import { isRetryableConflict } from "../lib/db-errors";
import { allocateDocumentSequence } from "../lib/document-number";
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../lib/errors";
import { istDayKey, istMonthKey } from "../lib/ist-day";
import { fromMilli, toMilli } from "../lib/milli";
import {
  type AmountLineIn,
  addDays,
  computeAmounts,
  financialYearOfDay,
  gstPercentToBp,
  itemTaxable,
  type MatchMismatch,
  resolveTaxType,
  runMatch,
} from "../lib/supplier-invoice-math";
import { poRepository } from "../repository/poRepository";
import { purchaseReturnRepository } from "../repository/purchaseReturnRepository";
import {
  LIVE_STATUSES,
  supplierInvoiceRepository as repo,
  type SupplierInvoiceLineInsert,
  type SupplierInvoiceRow,
  type Tx,
} from "../repository/supplierInvoiceRepository";
import { WEIGHT_UNITS, WHOLE_NUMBER_UNITS } from "../types/grn.types";
import type {
  BillableLinesQuery,
  CancelSupplierInvoiceInput,
  CreateSupplierInvoiceInput,
  ReleaseSupplierInvoiceInput,
  SupplierInvoiceChargeInput,
  SupplierInvoiceLineInput,
  SupplierInvoiceListQuery,
  UpdateSupplierInvoiceInput,
} from "../types/supplierInvoice.types";
import { purchaseReturnService } from "./purchaseReturnService";
import { supplierInvoiceLinkService } from "./supplierInvoiceLinkService";

// Supplier invoice and 3-way match (docs/specs/supplier-invoice, BR-SINV-01..41).
// Lock order on every state change (BR-SINV-34): GRN headers (asc) -> PO -> invoice row
// -> GRN lines (asc) -> debit-note rows -> number counter. Same order as the purchase
// return post (GRN -> PO -> debit note), so the two cannot deadlock each other.

type Status = SupplierInvoiceRow["status"];

type DraftInput = {
  invoiceNumber: string;
  invoiceDate: string;
  reverseCharge: boolean;
  itcNotEligible: boolean;
  printed: CreateSupplierInvoiceInput["printed"];
  lines: SupplierInvoiceLineInput[];
  charges: SupplierInvoiceChargeInput[];
};

// BR-SINV-04: where a new bill may be entered; `invoiced` has nothing left to bill.
const CREATE_PO_STATUSES = ["partial_received", "fully_received", "closed"];
// A draft that exists may still be submitted once its PO is `invoiced`.
const SUBMIT_PO_STATUSES = [...CREATE_PO_STATUSES, "invoiced"];

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

const normalizeUom = (uom: string) => uom.trim().toLowerCase();

function toPaginatedMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function conflict(message: string, code: string) {
  return new ConflictError(message, code);
}

function notDraft() {
  return conflict("Only a draft invoice can be changed", "SINV_NOT_DRAFT");
}

function notBlocked() {
  return conflict(
    "Only a blocked invoice can be changed this way",
    "SINV_NOT_BLOCKED",
  );
}

// ---------- locks and billable qty ----------

async function lockBillRows(poId: number, grnItemIds: number[], tx: Tx) {
  const ids = [...new Set(grnItemIds)].sort((a, b) => a - b);
  const headers = await repo.findGrnLineHeaders(ids, tx);
  const byId = new Map(headers.map((h) => [h.id, h]));
  for (const id of ids) {
    const header = byId.get(id);
    if (!header) {
      throw new NotFoundError(`GRN line ${id} not found`);
    }
    if (header.grnPoId !== poId) {
      throw new BadRequestError(
        `GRN line ${id} belongs to another purchase order`,
        "SINV_WRONG_PO",
      ); // BR-SINV-01
    }
  }
  const grnIds = [
    ...new Set(headers.flatMap((h) => (h.grnId === null ? [] : [h.grnId]))),
  ].sort((a, b) => a - b);
  await repo.lockGrnHeaders(grnIds, tx);
  const po = await poRepository.lockPoById(poId, tx);
  if (!po) {
    throw new NotFoundError("Purchase order not found");
  }
  const rows = await purchaseReturnRepository.lockGrnLines(ids, tx);
  return { po, lines: new Map(rows.map((r) => [r.id, r])) };
}

type BillableFacts = {
  netMilli: number;
  billedMilli: number;
  returnedMilli: number;
  billableMilli: number;
};

// BR-SINV-02, 03: billable = net accepted - qty on other live bills - accepted returned, floor 0.
async function billableFacts(
  rows: { id: number; acceptedQty: number }[],
  excludeInvoiceId: number | undefined,
  tx?: Tx,
) {
  const ids = rows.map((r) => r.id);
  const [corrections, returned, billed] = await Promise.all([
    purchaseReturnRepository.correctionsMilliByGrnLine(ids, tx),
    purchaseReturnService.returnedQtyByGrnItem(ids, tx),
    repo.billedMilliByGrnItem(ids, LIVE_STATUSES, tx, excludeInvoiceId),
  ]);
  const result = new Map<number, BillableFacts>();
  for (const row of rows) {
    const netMilli = toMilli(row.acceptedQty) - (corrections.get(row.id) ?? 0);
    const billedMilli = billed.get(row.id) ?? 0;
    const returnedMilli = toMilli(returned.get(row.id)?.acceptedReturned ?? 0);
    result.set(row.id, {
      netMilli,
      billedMilli,
      returnedMilli,
      billableMilli: Math.max(0, netMilli - billedMilli - returnedMilli),
    });
  }
  return result;
}

// ---------- draft build (create and edit) ----------

function checkDate(invoiceDate: string, poCreatedAt: Date) {
  const parsed = new Date(`${invoiceDate}T00:00:00Z`);
  const valid =
    !Number.isNaN(parsed.getTime()) && istDayKey(parsed) === invoiceDate;
  if (!valid) {
    throw new BadRequestError(
      "Invoice date is not a real date",
      "SINV_BAD_DATE",
    );
  }
  if (invoiceDate > istDayKey(new Date())) {
    throw new BadRequestError(
      "Invoice date cannot be after today",
      "SINV_BAD_DATE",
    ); // BR-SINV-07
  }
  if (invoiceDate < istDayKey(poCreatedAt)) {
    throw new BadRequestError(
      "Invoice date cannot be before the PO date",
      "SINV_BAD_DATE",
    );
  }
}

async function prepareDraft(
  po: NonNullable<Awaited<ReturnType<typeof poRepository.lockPoById>>>,
  locked: Awaited<ReturnType<typeof lockBillRows>>["lines"],
  draft: DraftInput,
  excludeInvoiceId: number | undefined,
  tx: Tx,
) {
  const seen = new Set<number>();
  for (const line of draft.lines) {
    if (seen.has(line.grnItemId)) {
      throw new BadRequestError(
        "The same GRN line can be on an invoice only once",
        "SINV_DUPLICATE_LINE",
      ); // BR-SINV-01
    }
    seen.add(line.grnItemId);
  }
  if (!CREATE_PO_STATUSES.includes(po.status)) {
    throw new BadRequestError(
      `Purchase order is ${po.status} - nothing can be billed against it`,
      "SINV_NOTHING_TO_BILL",
    ); // BR-SINV-04
  }
  if (await repo.hasLegacyInvoice(po.id, tx)) {
    throw new BadRequestError(
      "This purchase order already has an old-style invoice record",
      "SINV_NOTHING_TO_BILL",
    );
  }
  checkDate(draft.invoiceDate, po.createdAt);

  const facts = await billableFacts([...locked.values()], excludeInvoiceId, tx);
  for (const line of draft.lines) {
    const row = locked.get(line.grnItemId);
    if (!row) {
      throw new NotFoundError(`GRN line ${line.grnItemId} not found`);
    }
    if (row.qaStatus !== "passed" && row.qaStatus !== "waived") {
      throw new BadRequestError(
        `GRN line ${row.id} is still waiting for QA`,
        "SINV_QA_PENDING",
      ); // BR-SINV-02
    }
    if (
      WHOLE_NUMBER_UNITS.includes(normalizeUom(row.uom)) &&
      !Number.isInteger(line.qty)
    ) {
      throw new BadRequestError(
        `Qty must be a whole number for items in ${normalizeUom(row.uom)}`,
        "SINV_QTY_WHOLE",
      ); // BR-SINV-08
    }
    if ((facts.get(row.id)?.billableMilli ?? 0) <= 0) {
      throw new BadRequestError(
        `GRN line ${row.id} has nothing left to bill`,
        "SINV_NOTHING_TO_BILL",
      ); // BR-SINV-02, 03
    }
  }

  const supplier = await repo.findSupplier(po.supplierId, tx);
  if (!supplier) {
    throw new NotFoundError("Supplier not found");
  }
  const fy = financialYearOfDay(draft.invoiceDate);
  if (
    await repo.findNumberClash(
      supplier.id,
      draft.invoiceNumber,
      fy,
      excludeInvoiceId,
      tx,
    )
  ) {
    throw conflict(
      `Supplier invoice ${draft.invoiceNumber} is already entered for this supplier in FY ${fy}`,
      "SINV_DUPLICATE_NUMBER",
    ); // BR-SINV-06
  }

  const company = await repo.findCompany(tx);
  const taxType = resolveTaxType(supplier.gstNumber, company?.stateCode);
  const amountIn: AmountLineIn[] = [
    ...draft.lines.map((l) => ({
      taxable: itemTaxable(toMilli(l.qty), l.ratePaise),
      gstBp: gstPercentToBp(l.gstPercent),
    })),
    ...draft.charges.map((c) => ({
      taxable: BigInt(c.taxablePaise),
      gstBp: gstPercentToBp(c.gstPercent),
    })),
  ];
  const amounts = computeAmounts(amountIn, taxType);

  const lineRows: Omit<SupplierInvoiceLineInsert, "invoiceId">[] = [
    ...draft.lines.map((l, i) => {
      const amount = amounts.lines[i];
      const row = locked.get(l.grnItemId);
      return {
        lineNo: i + 1,
        kind: "item" as const,
        grnItemId: l.grnItemId,
        uom: row?.uom ?? null,
        qty: l.qty,
        ratePaise: l.ratePaise,
        gstBp: gstPercentToBp(l.gstPercent),
        taxablePaise: amount?.taxablePaise ?? 0,
        cgstPaise: amount?.cgstPaise ?? 0,
        sgstPaise: amount?.sgstPaise ?? 0,
        igstPaise: amount?.igstPaise ?? 0,
      };
    }),
    ...draft.charges.map((c, j) => {
      const amount = amounts.lines[draft.lines.length + j];
      return {
        lineNo: draft.lines.length + j + 1,
        kind: "charge" as const,
        chargeType: c.type,
        description: c.description?.trim() || null,
        gstBp: gstPercentToBp(c.gstPercent),
        taxablePaise: amount?.taxablePaise ?? 0,
        cgstPaise: amount?.cgstPaise ?? 0,
        sgstPaise: amount?.sgstPaise ?? 0,
        igstPaise: amount?.igstPaise ?? 0,
      };
    }),
  ];

  const header = {
    invoiceNumber: draft.invoiceNumber,
    invoiceDate: draft.invoiceDate,
    reverseCharge: draft.reverseCharge,
    itcIneligible: draft.itcNotEligible,
    billedAmountPaise: draft.printed.totalPaise,
    printedTaxablePaise: draft.printed.taxablePaise,
    printedCgstPaise: draft.printed.cgstPaise,
    printedSgstPaise: draft.printed.sgstPaise,
    printedIgstPaise: draft.printed.igstPaise,
    taxablePaise: amounts.totals.taxablePaise,
    cgstPaise: amounts.totals.cgstPaise,
    sgstPaise: amounts.totals.sgstPaise,
    igstPaise: amounts.totals.igstPaise,
    totalPaise: amounts.totals.totalPaise,
    taxType,
    paymentTermsDays: po.paymentTermsDays ?? 0,
    dueDate: addDays(draft.invoiceDate, po.paymentTermsDays ?? 0),
  };
  return { supplier, header, lineRows };
}

type DiffSource = {
  inv: SupplierInvoiceRow;
  lines: Awaited<ReturnType<typeof repo.listLines>>;
};

// BR-SINV-35: the edit row stores what changed (old -> new).
function diffDraft(old: DiffSource, draft: DraftInput) {
  const changes: {
    field: string;
    from: unknown;
    to: unknown;
    grnItemId?: number;
  }[] = [];
  const cmp = (
    field: string,
    from: unknown,
    to: unknown,
    grnItemId?: number,
  ) => {
    if (from !== to) {
      changes.push({
        field,
        from,
        to,
        ...(grnItemId !== undefined ? { grnItemId } : {}),
      });
    }
  };
  cmp("invoiceNumber", old.inv.invoiceNumber, draft.invoiceNumber);
  cmp("invoiceDate", old.inv.invoiceDate, draft.invoiceDate);
  cmp("reverseCharge", old.inv.reverseCharge, draft.reverseCharge);
  cmp("itcNotEligible", old.inv.itcIneligible, draft.itcNotEligible);
  cmp(
    "printed.taxablePaise",
    old.inv.printedTaxablePaise,
    draft.printed.taxablePaise,
  );
  cmp("printed.cgstPaise", old.inv.printedCgstPaise, draft.printed.cgstPaise);
  cmp("printed.sgstPaise", old.inv.printedSgstPaise, draft.printed.sgstPaise);
  cmp("printed.igstPaise", old.inv.printedIgstPaise, draft.printed.igstPaise);
  cmp(
    "printed.totalPaise",
    old.inv.billedAmountPaise,
    draft.printed.totalPaise,
  );

  const oldItems = new Map(
    old.lines.flatMap((l) => (l.grnItemId === null ? [] : [[l.grnItemId, l]])),
  );
  for (const line of draft.lines) {
    const before = oldItems.get(line.grnItemId);
    if (!before) {
      cmp("line", null, "added", line.grnItemId);
      continue;
    }
    cmp("qty", before.qty, line.qty, line.grnItemId);
    cmp("ratePaise", before.ratePaise, line.ratePaise, line.grnItemId);
    cmp("gstPercent", before.gstBp / 100, line.gstPercent, line.grnItemId);
  }
  const newIds = new Set(draft.lines.map((l) => l.grnItemId));
  for (const id of oldItems.keys()) {
    if (!newIds.has(id)) {
      cmp("line", "removed", null, id);
    }
  }
  const chargeKey = (c: {
    type?: string | null;
    description?: string | null;
    taxablePaise: number;
    gstPercent: number;
  }) => `${c.type}|${c.description ?? ""}|${c.taxablePaise}|${c.gstPercent}`;
  const oldCharges = old.lines
    .filter((l) => l.kind === "charge")
    .map((l) =>
      chargeKey({
        type: l.chargeType,
        description: l.description,
        taxablePaise: l.taxablePaise,
        gstPercent: l.gstBp / 100,
      }),
    );
  const newCharges = draft.charges.map((c) =>
    chargeKey({
      type: c.type,
      description: c.description?.trim() || null,
      taxablePaise: c.taxablePaise,
      gstPercent: c.gstPercent,
    }),
  );
  cmp("charges", oldCharges.join(";"), newCharges.join(";"));
  return changes;
}

// ---------- shared bits ----------

async function addHistory(
  tx: Tx,
  inv: { id: number; ourNumber: string },
  entry: {
    action:
      | "create"
      | "edit"
      | "submit"
      | "back_to_draft"
      | "release"
      | "cancel"
      | "delete";
    from: Status | null;
    to: Status | null;
    actorId: number;
    reason?: string;
    detail?: unknown;
  },
) {
  await repo.insertHistory(
    {
      invoiceId: inv.id,
      ourNumber: inv.ourNumber,
      action: entry.action,
      fromStatus: entry.from,
      toStatus: entry.to,
      reason: entry.reason ?? null,
      detail: entry.detail ?? null,
      createdBy: entry.actorId,
    },
    tx,
  );
}

async function lockDraftForChange(id: number, tx: Tx) {
  const inv = await repo.lockInvoice(id, tx);
  if (!inv) {
    throw new NotFoundError("Supplier invoice not found");
  }
  if (inv.status !== "draft") {
    throw notDraft();
  }
  return inv;
}

const itemGrnIds = (lines: { grnItemId: number | null }[]) =>
  lines.flatMap((l) => (l.grnItemId === null ? [] : [l.grnItemId]));

// A deadlock or serialization failure rolled everything back: safe to retry.
async function inInvoiceTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await repo.withTransaction(fn);
  } catch (error) {
    if (isRetryableConflict(error)) {
      throw conflict("Another change was in progress, try again", "SINV_RETRY");
    }
    throw error;
  }
}

/**
 * Lock in the global order: GRN headers (asc) -> PO (from an unlocked read of the
 * invoice and its lines), then the invoice row. The invoice is read again under its
 * lock; if its PO or lines moved since the unlocked read, the loser gets 409 SINV_BUSY.
 * The caller re-checks the status on the returned `inv`.
 */
async function lockInOrder(id: number, tx: Tx, extraGrnItemIds: number[] = []) {
  const seen = await repo.findInvoice(id, tx);
  if (!seen) {
    throw new NotFoundError("Supplier invoice not found");
  }
  const seenIds = [
    ...itemGrnIds(await repo.listLines(id, tx)),
    ...extraGrnItemIds,
  ];
  const bill = await lockBillRows(seen.poId, seenIds, tx);
  const inv = await repo.lockInvoice(id, tx);
  if (!inv) {
    throw new NotFoundError("Supplier invoice not found");
  }
  const covered = new Set(seenIds);
  if (
    inv.poId !== seen.poId ||
    itemGrnIds(await repo.listLines(id, tx)).some((g) => !covered.has(g))
  ) {
    throw conflict(
      "The invoice changed while you were working on it - reload and try again",
      "SINV_BUSY",
    );
  }
  return { inv, ...bill };
}

function mismatchesForHistory(
  rows: Awaited<ReturnType<typeof repo.listMismatches>>,
) {
  return rows.map((m) => ({
    check: m.check,
    lineId: m.lineId,
    head: m.head,
    expected: m.expected,
    billed: m.billed,
    unit: m.unit,
  }));
}

export const supplierInvoiceService = {
  // ---------- reads ----------

  async list(params: SupplierInvoiceListQuery) {
    const today = istDayKey(new Date());
    const { rows, total, statusCounts } = await repo.list(params, today);
    return {
      data: rows.map((r) => ({
        id: r.id,
        ourNumber: r.ourNumber,
        invoiceNumber: r.invoiceNumber,
        invoiceDate: r.invoiceDate,
        supplier: { id: r.supplierId, name: r.supplierName },
        poNumber: r.poNumber,
        status: r.status,
        totalPaise: r.status === "legacy" ? r.billedAmountPaise : r.totalPaise,
        dueDate: r.dueDate ?? null,
        overdue:
          r.status === "approved" && r.dueDate !== null && r.dueDate < today,
      })),
      meta: {
        ...toPaginatedMeta(params.page, params.pageSize, total),
        statusCounts,
      },
    };
  },

  async getDetails(id: number) {
    const header = await repo.getDetailsHeader(id);
    if (!header) {
      throw new NotFoundError("Supplier invoice not found");
    }
    const [lines, mismatches, history, notes, prs] = await Promise.all([
      repo.getDetailsLines(id),
      repo.listMismatches(id),
      repo.listHistory(id),
      repo.listDebitNotesOfInvoice(id),
      repo.listPrsOfPo(header.poId),
    ]);
    // A draft's billableQty is live and includes its own qty (edit mode shows what is still billable).
    const draftFacts =
      header.status === "draft"
        ? await billableFacts(
            await repo.listGrnLineAccepted(
              lines.flatMap((l) => (l.grnItemId === null ? [] : [l.grnItemId])),
            ),
            id,
          )
        : undefined;
    const grns = await repo.listGrnsByIds([
      ...new Set(lines.flatMap((l) => (l.grnId === null ? [] : [l.grnId]))),
    ]);
    const today = istDayKey(new Date());
    const offset = notes
      .filter((n) => n.status !== "cancelled")
      .reduce((sum, n) => sum + n.billOffsetPaise, 0);
    const total =
      header.status === "legacy" ? header.billedAmountPaise : header.totalPaise;

    return {
      id: header.id,
      ourNumber: header.ourNumber,
      invoiceNumber: header.invoiceNumber,
      invoiceDate: header.invoiceDate,
      fy: header.fy ?? "",
      status: header.status,
      poId: header.poId,
      prId: prs[0]?.id ?? null,
      poNumber: header.poNumber,
      supplier: {
        id: header.supplierId,
        name: header.supplierName,
        gstin: header.supplierMasterGstin ?? null,
      },
      billedAmountPaise: header.billedAmountPaise,
      printed: {
        taxablePaise: header.printedTaxablePaise,
        cgstPaise: header.printedCgstPaise,
        sgstPaise: header.printedSgstPaise,
        igstPaise: header.printedIgstPaise,
        totalPaise: header.billedAmountPaise,
      },
      taxablePaise: header.taxablePaise,
      cgstPaise: header.cgstPaise,
      sgstPaise: header.sgstPaise,
      igstPaise: header.igstPaise,
      totalPaise: total,
      taxType: header.taxType ?? null,
      supplierGstin: header.supplierGstin ?? null,
      supplierStateCode: header.supplierStateCode ?? null,
      plantStateCode: header.plantStateCode ?? null,
      reverseCharge: header.reverseCharge,
      itcIneligible: header.itcIneligible,
      paymentTermsDays: header.paymentTermsDays,
      dueDate: header.dueDate ?? null,
      overdue:
        header.status === "approved" &&
        header.dueDate !== null &&
        header.dueDate < today,
      paymentStatus: header.paymentStatus,
      tolerances: {
        priceTolBpUsed: header.priceTolBpUsed ?? null,
        weightTolBpUsed: header.weightTolBpUsed ?? null,
      },
      submittedBy: header.submittedBy ?? null,
      submittedAt: iso(header.submittedAt),
      releasedBy: header.releasedBy ?? null,
      releasedAt: iso(header.releasedAt),
      releaseReason: header.releaseReason ?? null,
      cancelledBy: header.cancelledBy ?? null,
      cancelledAt: iso(header.cancelledAt),
      cancelReason: header.cancelReason ?? null,
      createdBy: header.createdBy,
      createdAt: header.createdAt.toISOString(),
      lastUpdatedBy: header.lastUpdatedBy ?? null,
      lastUpdatedAt: iso(header.lastUpdatedAt),
      lines: lines.map((l) => ({
        id: l.id,
        lineNo: l.lineNo,
        kind: l.kind,
        grnItemId: l.grnItemId ?? null,
        grnId: l.grnId ?? null,
        grnNumber: l.grnNumber ?? null,
        itemName: l.itemName ?? null,
        chargeType: l.chargeType ?? null,
        description: l.description ?? null,
        uom: l.uom ?? null,
        qty: l.qty ?? null,
        ratePaise: l.ratePaise ?? null,
        gstBp: l.gstBp,
        taxablePaise: l.taxablePaise,
        cgstPaise: l.cgstPaise,
        sgstPaise: l.sgstPaise,
        igstPaise: l.igstPaise,
        poRatePaise: l.poRatePaise ?? null,
        poGstBp: l.poGstBp ?? null,
        billableQty:
          draftFacts && l.grnItemId !== null
            ? fromMilli(draftFacts.get(l.grnItemId)?.billableMilli ?? 0)
            : (l.billableQty ?? null),
        belowPoRate: l.belowPoRate,
      })),
      mismatches: mismatches.map((m) => ({
        check: m.check,
        lineId: m.lineId ?? null,
        head: m.head ?? null,
        expected: m.expected,
        billed: m.billed,
        unit: m.unit,
      })),
      history: history.map((h) => ({
        id: h.id,
        action: h.action,
        fromStatus: h.fromStatus ?? null,
        toStatus: h.toStatus ?? null,
        reason: h.reason ?? null,
        detail: h.detail ?? null,
        createdBy: h.createdBy,
        createdByName: h.createdByName ?? null,
        createdAt: h.createdAt.toISOString(),
      })),
      debitNotes: notes.map((n) => ({
        id: n.id,
        number: n.number,
        totalPaise: n.totalPaise,
        billOffsetPaise: n.billOffsetPaise,
        status: n.status,
      })),
      netPayablePaise: total - offset,
      flow: {
        pr: prs,
        po: {
          id: header.poId,
          number: header.poNumber,
          status: header.poStatus,
        },
        grns,
      },
    };
  },

  // BR-SINV-02, 04, 38: billable GRN lines of a PO prefilled at PO rate and GST.
  async billableLines(query: BillableLinesQuery) {
    const po = await repo.findPo(query.poId);
    if (!po) {
      throw new NotFoundError("Purchase order not found");
    }
    // `invoiced` has nothing left to bill (BR-SINV-04): an empty list is fine, a non-empty one is not.
    if (
      !SUBMIT_PO_STATUSES.includes(po.status) ||
      (await repo.hasLegacyInvoice(po.id))
    ) {
      throw conflict(
        `Purchase order is ${po.status} - it cannot be billed`,
        "SINV_PO_NOT_BILLABLE",
      );
    }
    const supplier = await repo.findSupplier(po.supplierId);
    if (!supplier) {
      throw new NotFoundError("Supplier not found");
    }
    const candidates = await repo.listBillableCandidates(po.id, query.grnId);
    const facts = await billableFacts(
      candidates.map((c) => ({ id: c.grnItemId, acceptedQty: c.acceptedQty })),
      undefined,
    );
    const billable = candidates.filter(
      (c) => (facts.get(c.grnItemId)?.billableMilli ?? 0) > 0,
    );
    if (po.status === "invoiced" && billable.length > 0) {
      throw conflict(
        "Purchase order is invoiced - it cannot be billed",
        "SINV_PO_NOT_BILLABLE",
      );
    }
    return {
      po: {
        id: po.id,
        prId: (await repo.listPrsOfPo(po.id))[0]?.id ?? null,
        poNumber: po.poNumber,
        status: po.status,
        paymentTermsDays: po.paymentTermsDays ?? 0,
      },
      supplier: {
        id: supplier.id,
        name: supplier.name,
        gstin: supplier.gstNumber?.trim() || null,
      },
      lines: candidates.flatMap((c) => {
        const f = facts.get(c.grnItemId);
        if (!f || f.billableMilli <= 0) {
          return [];
        }
        return [
          {
            grnItemId: c.grnItemId,
            grnId: c.grnId,
            grnNumber: c.grnNumber,
            itemName: c.itemName,
            uom: c.uom,
            netAcceptedQty: fromMilli(f.netMilli),
            billedQty: fromMilli(f.billedMilli),
            returnedQty: fromMilli(f.returnedMilli),
            billableQty: fromMilli(f.billableMilli),
            poRatePaise: c.poRatePaise,
            poGstPercent: c.poGstPercent,
          },
        ];
      }),
    };
  },

  // ---------- writes ----------

  // BR-SINV-01..17. GRN headers -> PO -> GRN lines -> counter (the invoice row is new).
  async create(input: CreateSupplierInvoiceInput, actorId: number) {
    const id = await repo.withTransaction(async (tx) => {
      const pre = await repo.findPo(input.poId, tx);
      if (!pre) {
        throw new NotFoundError("Purchase order not found");
      }
      const { po, lines } = await lockBillRows(
        pre.id,
        input.lines.map((l) => l.grnItemId),
        tx,
      );
      const draft: DraftInput = {
        invoiceNumber: input.invoiceNumber,
        invoiceDate: input.invoiceDate,
        reverseCharge: input.reverseCharge ?? false,
        itcNotEligible: input.itcNotEligible ?? false,
        printed: input.printed,
        lines: input.lines,
        charges: input.charges ?? [],
      };
      const { supplier, header, lineRows } = await prepareDraft(
        po,
        lines,
        draft,
        undefined,
        tx,
      );

      const now = new Date();
      const { periodKey, seq } = await allocateDocumentSequence(
        tx,
        "SINV",
        actorId,
        now,
        istMonthKey(now),
      );
      const ourNumber = `SINV-${periodKey}-${seq}`;
      const row = await repo.insertInvoice(
        {
          ...header,
          ourNumber,
          poId: po.id,
          supplierId: supplier.id,
          status: "draft",
          createdBy: actorId,
        },
        tx,
      );
      if (!row) {
        throw new AppError(
          "Failed to create the invoice",
          500,
          "INTERNAL_ERROR",
        );
      }
      await repo.insertLines(
        lineRows.map((l) => ({ ...l, invoiceId: row.id })),
        tx,
      );
      await addHistory(tx, row, {
        action: "create",
        from: null,
        to: "draft",
        actorId,
      });
      return row.id;
    });
    return this.getDetails(id);
  },

  // BR-SINV-11, 35: invoice row first, then the same order as create.
  async update(input: UpdateSupplierInvoiceInput, actorId: number) {
    await inInvoiceTx(async (tx) => {
      const {
        inv,
        po,
        lines: lockedLines,
      } = await lockInOrder(
        input.id,
        tx,
        input.lines?.map((l) => l.grnItemId) ?? [],
      );
      if (inv.status !== "draft") {
        throw notDraft();
      }
      if (input.poId !== undefined && input.poId !== inv.poId) {
        throw new BadRequestError(
          "The purchase order of an invoice cannot be changed",
          "SINV_PO_IMMUTABLE",
        ); // BR-SINV-01
      }
      const oldLines = await repo.listLines(inv.id, tx);
      const draft: DraftInput = {
        invoiceNumber: input.invoiceNumber ?? inv.invoiceNumber,
        invoiceDate: input.invoiceDate ?? inv.invoiceDate,
        reverseCharge: input.reverseCharge ?? inv.reverseCharge,
        itcNotEligible: input.itcNotEligible ?? inv.itcIneligible,
        printed: input.printed ?? {
          taxablePaise: inv.printedTaxablePaise,
          cgstPaise: inv.printedCgstPaise,
          sgstPaise: inv.printedSgstPaise,
          igstPaise: inv.printedIgstPaise,
          totalPaise: inv.billedAmountPaise,
        },
        lines:
          input.lines ??
          oldLines.flatMap((l) =>
            l.grnItemId === null
              ? []
              : [
                  {
                    grnItemId: l.grnItemId,
                    qty: l.qty ?? 0,
                    ratePaise: l.ratePaise ?? 0,
                    gstPercent: l.gstBp / 100,
                  },
                ],
          ),
        charges:
          input.charges ??
          oldLines.flatMap((l) =>
            l.kind === "charge" && l.chargeType !== null
              ? [
                  {
                    type: l.chargeType,
                    ...(l.description ? { description: l.description } : {}),
                    taxablePaise: l.taxablePaise,
                    gstPercent: l.gstBp / 100,
                  },
                ]
              : [],
          ),
      };
      const { header, lineRows } = await prepareDraft(
        po,
        lockedLines,
        draft,
        inv.id,
        tx,
      );
      const changes = diffDraft({ inv, lines: oldLines }, draft);

      await repo.deleteLines(inv.id, tx);
      await repo.insertLines(
        lineRows.map((l) => ({ ...l, invoiceId: inv.id })),
        tx,
      );
      await repo.updateInvoice(
        inv.id,
        { ...header, lastUpdatedBy: actorId, lastUpdatedAt: new Date() },
        tx,
      );
      await addHistory(tx, inv, {
        action: "edit",
        from: "draft",
        to: "draft",
        actorId,
        detail: { changes },
      });
    });
    return this.getDetails(input.id);
  },

  // BR-SINV-11, 35: a draft is deleted; its history rows stay.
  async remove(id: number, actorId: number) {
    await repo.withTransaction(async (tx) => {
      const inv = await lockDraftForChange(id, tx);
      await addHistory(tx, inv, {
        action: "delete",
        from: "draft",
        to: null,
        actorId,
      });
      await repo.deleteInvoice(id, tx);
    });
    return { id, deleted: true as const };
  },

  // BR-SINV-18..23, 29, 31, 40, 41.
  async submit(id: number, actorId: number) {
    await inInvoiceTx(async (tx) => {
      const { inv, po, lines: locked } = await lockInOrder(id, tx);
      if (inv.status !== "draft") {
        throw notDraft();
      }
      const company = await repo.findCompany(tx);
      if (!company?.stateCode.trim()) {
        throw new BadRequestError(
          "Set the plant state code in company settings",
          "SINV_COMPANY_SETTINGS_MISSING",
        ); // BR-SINV-18
      }
      if (!company.gstin.trim()) {
        throw new BadRequestError(
          "Set the plant GSTIN in company settings",
          "SINV_COMPANY_SETTINGS_MISSING",
        );
      }
      const lines = await repo.listLines(id, tx);
      const items = lines.filter((l) => l.kind === "item");
      if (!SUBMIT_PO_STATUSES.includes(po.status)) {
        throw conflict(
          `Purchase order is ${po.status} - it cannot be billed`,
          "SINV_PO_NOT_BILLABLE",
        );
      }
      const facts = await billableFacts([...locked.values()], id, tx);
      for (const line of items) {
        if ((facts.get(line.grnItemId ?? 0)?.billableMilli ?? 0) <= 0) {
          throw conflict(
            "The qty on this invoice is no longer billable - check the GRN, returns and other invoices",
            "SINV_STALE_QTY",
          );
        }
      }
      const supplier = await repo.findSupplier(inv.supplierId, tx);
      if (!supplier) {
        throw new NotFoundError("Supplier not found");
      }
      const supplierGstin = supplier.gstNumber?.trim() || null;
      const taxType = resolveTaxType(supplierGstin, company.stateCode);
      if (taxType === null) {
        throw new BadRequestError(
          "Set the plant state code in company settings",
          "SINV_COMPANY_SETTINGS_MISSING",
        );
      }

      // Amounts are recomputed from the stored qty, rate and GST (BR-SINV-13..16).
      const amountIn: AmountLineIn[] = lines.map((l) => ({
        taxable:
          l.kind === "item"
            ? itemTaxable(toMilli(l.qty ?? 0), l.ratePaise ?? 0)
            : BigInt(l.taxablePaise),
        gstBp: l.gstBp,
      }));
      const amounts = computeAmounts(amountIn, taxType);

      const poFacts = new Map(
        (await repo.findPoLineFactsByGrnItem(itemGrnIds(items), tx)).map(
          (f) => [f.id, f],
        ),
      );
      const match = runMatch({
        taxType,
        items: items.map((l) => {
          const grnItemId = l.grnItemId ?? 0;
          const poFact = poFacts.get(grnItemId);
          return {
            key: String(l.id),
            qtyMilli: toMilli(l.qty ?? 0),
            ratePaise: l.ratePaise ?? 0,
            gstBp: l.gstBp,
            weightUnit: WEIGHT_UNITS.includes(normalizeUom(l.uom ?? "")),
            poRatePaise: poFact?.poRatePaise ?? 0,
            poGstBp: gstPercentToBp(poFact?.poGstPercent ?? 0),
            billableMilli: facts.get(grnItemId)?.billableMilli ?? 0,
          };
        }),
        charges: lines
          .filter((l) => l.kind === "charge")
          .map((l) => ({ key: String(l.id), taxablePaise: l.taxablePaise })),
        computed: amounts.totals,
        printed: {
          cgstPaise: inv.printedCgstPaise,
          sgstPaise: inv.printedSgstPaise,
          igstPaise: inv.printedIgstPaise,
          totalPaise: inv.billedAmountPaise,
        },
        priceTolBp: company.priceToleranceBp,
        weightTolBp: company.weightToleranceBp,
      });

      await repo.updateLinesAmounts(
        lines.map((line, index) => {
          const amount = amounts.lines[index];
          const poFact = poFacts.get(line.grnItemId ?? 0);
          const item = line.kind === "item";
          return {
            id: line.id,
            cgstPaise: amount?.cgstPaise ?? 0,
            sgstPaise: amount?.sgstPaise ?? 0,
            igstPaise: amount?.igstPaise ?? 0,
            item,
            poRatePaise: item ? (poFact?.poRatePaise ?? null) : null,
            poGstBp:
              item && poFact ? gstPercentToBp(poFact.poGstPercent) : null,
            billableQty: item
              ? fromMilli(facts.get(line.grnItemId ?? 0)?.billableMilli ?? 0)
              : null,
            belowPoRate: item && match.belowPoRate.has(String(line.id)),
          };
        }),
        tx,
      );
      await repo.deleteMismatches(id, tx);
      await repo.insertMismatches(
        match.mismatches.map((m: MatchMismatch) => ({
          invoiceId: id,
          lineId: m.lineKey === null ? null : Number(m.lineKey),
          check: m.check,
          head: m.head,
          expected: m.expected,
          billed: m.billed,
          unit: m.unit,
        })),
        tx,
      );

      const status: Status =
        match.mismatches.length === 0 ? "approved" : "blocked";
      const now = new Date();
      await repo.updateInvoice(
        id,
        {
          status,
          taxType,
          taxablePaise: amounts.totals.taxablePaise,
          cgstPaise: amounts.totals.cgstPaise,
          sgstPaise: amounts.totals.sgstPaise,
          igstPaise: amounts.totals.igstPaise,
          totalPaise: amounts.totals.totalPaise,
          supplierGstin,
          supplierStateCode: supplierGstin ? supplierGstin.slice(0, 2) : null,
          plantStateCode: company.stateCode.trim(),
          priceTolBpUsed: company.priceToleranceBp,
          weightTolBpUsed: company.weightToleranceBp,
          submittedBy: actorId,
          submittedAt: now,
          lastUpdatedBy: actorId,
          lastUpdatedAt: now,
        },
        tx,
      );

      let linked: number[] = [];
      if (status === "approved") {
        linked = await supplierInvoiceLinkService.linkOnApproval(id, tx);
        await supplierInvoiceLinkService.reevaluatePoInvoiced(
          po.id,
          actorId,
          tx,
        );
      }
      await addHistory(tx, inv, {
        action: "submit",
        from: "draft",
        to: status,
        actorId,
        detail: {
          result: status,
          mismatches: mismatchesForHistory(await repo.listMismatches(id, tx)),
          linkedDebitNoteIds: linked,
        },
      });
    });
    return this.getDetails(id);
  },

  // BR-SINV-24: only the mismatch list is cleared; the submit result stays in history.
  async backToDraft(id: number, actorId: number) {
    await repo.withTransaction(async (tx) => {
      const inv = await repo.lockInvoice(id, tx);
      if (!inv) {
        throw new NotFoundError("Supplier invoice not found");
      }
      if (inv.status !== "blocked") {
        throw notBlocked();
      }
      await repo.deleteMismatches(id, tx);
      await repo.updateInvoice(
        id,
        { status: "draft", lastUpdatedBy: actorId, lastUpdatedAt: new Date() },
        tx,
      );
      await addHistory(tx, inv, {
        action: "back_to_draft",
        from: "blocked",
        to: "draft",
        actorId,
      });
    });
    return this.getDetails(id);
  },

  // BR-SINV-25: key `invoice.release` is checked by the route; here the self-release ban.
  async release(
    id: number,
    input: ReleaseSupplierInvoiceInput,
    actorId: number,
  ) {
    await inInvoiceTx(async (tx) => {
      const { inv, po, lines: locked } = await lockInOrder(id, tx);
      if (inv.status !== "blocked") {
        throw notBlocked();
      }
      if (await repo.hasHistoryBy(id, actorId, tx)) {
        throw new ForbiddenError(
          "You created, edited or submitted this invoice, so someone else must release it",
          "SINV_SELF_RELEASE",
        );
      }
      const lines = await repo.listLines(id, tx);
      // A-52: the qty may have dropped since submit (return, correction, other bill).
      // A qty over billable that the submit match already flagged is the owner's override
      // (BR-SINV-22, 24); only a further drop since submit is stale.
      const facts = await billableFacts([...locked.values()], id, tx);
      const flagged = await repo.listMismatches(id, tx);
      for (const line of lines) {
        const billable = facts.get(line.grnItemId ?? 0)?.billableMilli ?? 0;
        const seenQty = flagged.find(
          (m) => m.check === "qty" && m.lineId === line.id,
        );
        if (
          line.kind === "item" &&
          toMilli(line.qty ?? 0) > billable &&
          (!seenQty || billable < Number(seenQty.expected))
        ) {
          throw conflict(
            "The qty on this invoice is no longer billable - send it back to draft and check the GRN, returns and other invoices",
            "SINV_STALE_QTY",
          );
        }
      }
      const mismatches = mismatchesForHistory(
        await repo.listMismatches(id, tx),
      );
      const now = new Date();
      await repo.updateInvoice(
        id,
        {
          status: "approved",
          releasedBy: actorId,
          releasedAt: now,
          releaseReason: input.reason,
          lastUpdatedBy: actorId,
          lastUpdatedAt: now,
        },
        tx,
      );
      const linked = await supplierInvoiceLinkService.linkOnApproval(id, tx);
      await supplierInvoiceLinkService.reevaluatePoInvoiced(po.id, actorId, tx);
      await addHistory(tx, inv, {
        action: "release",
        from: "blocked",
        to: "approved",
        actorId,
        reason: input.reason,
        detail: { mismatches, linkedDebitNoteIds: linked },
      });
    });
    return this.getDetails(id);
  },

  // BR-SINV-26, 27, 29, 31.
  async cancel(id: number, input: CancelSupplierInvoiceInput, actorId: number) {
    // Status the caller saw before the lock: if it moved under the lock, the loser gets 409 (BR-SINV-34).
    const seen = await repo.findInvoice(id);
    await inInvoiceTx(async (tx) => {
      const { inv, po } = await lockInOrder(id, tx);
      if (seen && seen.status !== inv.status) {
        throw conflict(
          "The invoice changed while you were cancelling it - reload and try again",
          "SINV_BUSY",
        );
      }
      if (inv.status !== "blocked" && inv.status !== "approved") {
        throw conflict(
          inv.status === "draft"
            ? "A draft invoice is deleted, not cancelled"
            : `A ${inv.status} invoice cannot be cancelled`,
          "SINV_NOT_CANCELLABLE",
        );
      }
      const min = inv.status === "approved" ? 10 : 3;
      if (input.reason.length < min || input.reason.length > 500) {
        throw new BadRequestError(
          `Give a reason of ${min} to 500 characters`,
          "SINV_REASON_LENGTH",
        );
      }
      const now = new Date();
      await repo.updateInvoice(
        id,
        {
          status: "cancelled",
          cancelledBy: actorId,
          cancelledAt: now,
          cancelReason: input.reason,
          lastUpdatedBy: actorId,
          lastUpdatedAt: now,
        },
        tx,
      );
      const unlinked = await supplierInvoiceLinkService.unlinkOfInvoice(id, tx);
      await supplierInvoiceLinkService.reevaluatePoInvoiced(po.id, actorId, tx);
      await addHistory(tx, inv, {
        action: "cancel",
        from: inv.status,
        to: "cancelled",
        actorId,
        reason: input.reason,
        detail: { unlinkedDebitNoteIds: unlinked },
      });
    });
    return this.getDetails(id);
  },
};
