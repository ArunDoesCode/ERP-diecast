import { isRetryableConflict } from "../lib/db-errors";
import {
  allocateDocumentSequence,
  allocateFinancialYearSequence,
} from "../lib/document-number";
import {
  AppError,
  BadRequestError,
  ConflictError,
  InternalServerError,
  NotFoundError,
} from "../lib/errors";
import { istMonthKey } from "../lib/ist-day";
import { fromMilli, toMilli } from "../lib/milli";
import {
  computeReturnLine,
  computeReturnTotals,
  isInterstateSupply,
} from "../lib/purchase-return-math";
import { grnRepository } from "../repository/grnRepository";
import { poRepository } from "../repository/poRepository";
import {
  type PurchaseReturnLineRow,
  purchaseReturnRepository as repo,
  type Tx,
} from "../repository/purchaseReturnRepository";
import { postStock } from "../repository/stockPostingRepository";
import { WHOLE_NUMBER_UNITS } from "../types/grn.types";
import type {
  AwaitingReturnQuery,
  CancelPurchaseReturnInput,
  CreatePurchaseReturnInput,
  PurchaseReturnLineInput,
  PurchaseReturnListQuery,
  UpdatePurchaseReturnInput,
} from "../types/purchaseReturn.types";
import { OVER_RECEIPT_TOLERANCE_RATIO } from "./grnService";
import { poService } from "./poService";
import { supplierInvoiceLinkService } from "./supplierInvoiceLinkService";

type Source = "rejected" | "accepted";

const QA_DECIDED = ["passed", "failed", "waived"];

function toPaginatedMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

const cleanOptional = (value: string | undefined) => {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

function notEditable() {
  return new ConflictError(
    "Only a draft purchase return can be changed",
    "PRT_NOT_EDITABLE",
  );
}

function capExceeded(
  status: 400 | 409,
  grnItemId: number,
  source: Source,
  capMilli: number,
  reservedMilli: number,
) {
  return new AppError(
    `Return qty for this GRN line (${source}) is more than what is left to return (cap ${fromMilli(capMilli)}, already on returns ${fromMilli(reservedMilli)})`,
    status,
    "PRT_CAP_EXCEEDED",
    {
      grnItemId,
      source,
      cap: fromMilli(capMilli),
      reserved: fromMilli(reservedMilli),
    },
  );
}

type GrnLineRow = Awaited<ReturnType<typeof repo.lockGrnLines>>[number];

// Cap of a GRN line for one source, in thousandths (BR-PRT-05, 06).
function capMilli(
  line: { acceptedQty: number; rejectedQty: number | null },
  source: Source,
  correctionsMilli: number,
) {
  return source === "rejected"
    ? toMilli(line.rejectedQty ?? 0)
    : toMilli(line.acceptedQty) - correctionsMilli;
}

const isQaDecided = (line: {
  qaStatus: string | null;
  isQaBypassed: boolean | null;
}) => Boolean(line.isQaBypassed) || QA_DECIDED.includes(line.qaStatus ?? "");

// Validates the input lines against one GRN and the caps, inside the caller's
// transaction after the GRN header lock; locks the GRN lines (ascending id) before
// reading the sums. `excludeProId` leaves the return being edited out of the sums.
async function buildLines(
  grnId: number,
  inputLines: PurchaseReturnLineInput[],
  tx: Tx,
  excludeProId?: number,
) {
  const seen = new Set<string>();
  for (const line of inputLines) {
    const key = `${line.grnItemId}:${line.source}`;
    if (seen.has(key)) {
      throw new BadRequestError(
        "The same GRN line and source can be on a return only once",
        "PRT_DUPLICATE_LINE",
      ); // BR-PRT-03
    }
    seen.add(key);
  }

  const ids = [...new Set(inputLines.map((l) => l.grnItemId))].sort(
    (a, b) => a - b,
  );
  const rows = await repo.lockGrnLines(ids, tx);
  const byId = new Map(rows.map((r) => [r.id, r]));

  for (const line of inputLines) {
    const row = byId.get(line.grnItemId);
    if (!row || row.grnId !== grnId) {
      throw new BadRequestError(
        `GRN line ${line.grnItemId} does not belong to this GRN`,
        "PRT_GRN_MISMATCH",
      ); // BR-PRT-01
    }
    if (!isQaDecided(row)) {
      throw new BadRequestError(
        `GRN line ${line.grnItemId} is still waiting for QA`,
        "PRT_QA_PENDING",
      ); // BR-PRT-02
    }
    const uom = row.uom.trim().toLowerCase();
    if (WHOLE_NUMBER_UNITS.includes(uom) && !Number.isInteger(line.qty)) {
      throw new BadRequestError(
        `Qty must be a whole number for items in ${uom}`,
      ); // BR-PRT-04
    }
  }

  const [reserved, corrections] = await Promise.all([
    repo.reservedByGrnLine(ids, tx, excludeProId),
    repo.correctionsMilliByGrnLine(ids, tx),
  ]);
  for (const line of inputLines) {
    const row = byId.get(line.grnItemId) as GrnLineRow;
    const cap = capMilli(row, line.source, corrections.get(row.id) ?? 0);
    const used = reserved.get(row.id)?.[line.source] ?? 0;
    if (used + toMilli(line.qty) > cap) {
      throw capExceeded(400, row.id, line.source, cap, used); // BR-PRT-05, 06, 07
    }
  }

  return inputLines.map((line) => {
    const row = byId.get(line.grnItemId) as GrnLineRow;
    if (row.poItemId == null) {
      throw new InternalServerError("GRN line is missing its PO line link");
    }
    return {
      grnItemId: row.id,
      poItemId: row.poItemId,
      itemId: row.itemId,
      source: line.source,
      returnQty: line.qty,
      uom: row.uom,
      batchNumber: row.batchNumber ?? null,
      unitPricePaise: row.ratePaise,
      gstPercent: row.gstPercent,
    };
  });
}

// Per-line cap facts shown on prefill and details.
type CapFacts = {
  rejectedQty: number;
  rejectedReserved: number;
  rejectedReturnable: number;
  acceptedNet: number;
  acceptedReserved: number;
  acceptedReturnable: number;
};

function capFacts(
  line: { acceptedQty: number; rejectedQty: number | null },
  reservedMilli: { rejected: number; accepted: number } | undefined,
  correctionsMilli: number,
): CapFacts {
  const rejectedCap = capMilli(line, "rejected", correctionsMilli);
  const acceptedCap = capMilli(line, "accepted", correctionsMilli);
  const rejectedUsed = reservedMilli?.rejected ?? 0;
  const acceptedUsed = reservedMilli?.accepted ?? 0;
  return {
    rejectedQty: fromMilli(rejectedCap),
    rejectedReserved: fromMilli(rejectedUsed),
    rejectedReturnable: fromMilli(Math.max(0, rejectedCap - rejectedUsed)),
    acceptedNet: fromMilli(acceptedCap),
    acceptedReserved: fromMilli(acceptedUsed),
    acceptedReturnable: fromMilli(Math.max(0, acceptedCap - acceptedUsed)),
  };
}

// Takes the GRN header lock first (BR-PRT-13 order), then re-reads the return
// under it. Used by update, cancel draft, post and cancel.
async function lockReturnUnderGrn(id: number, tx: Tx) {
  const pre = await repo.findHeader(id, tx);
  if (!pre) {
    throw new NotFoundError("Purchase return not found");
  }
  const grn = await grnRepository.lockGrn(pre.grnId, tx);
  if (!grn) {
    throw new NotFoundError("GRN not found");
  }
  return pre.grnId;
}

// GRN lines, PO lines and the return's lines of a locked return, in lock order.
async function lockPostingRows(lines: PurchaseReturnLineRow[], tx: Tx) {
  const grnLineIds = [...new Set(lines.map((l) => l.grnItemId))].sort(
    (a, b) => a - b,
  );
  const poLineIds = [...new Set(lines.map((l) => l.poItemId))].sort(
    (a, b) => a - b,
  );
  const grnRows = await repo.lockGrnLines(grnLineIds, tx);
  const poRows = await repo.lockPoLines(poLineIds, tx);
  return {
    grnLineIds,
    grnById: new Map(grnRows.map((r) => [r.id, r])),
    poById: new Map(poRows.map((r) => [r.id, r])),
  };
}

// Stock-out preview and debit note total from the lines, same maths as post.
function previewOf(
  lines: {
    itemId: number;
    source: Source;
    qty: number;
    uom: string;
    ratePaise: number;
    gstPercent: number;
  }[],
  replacementExpected: boolean,
  interstate: boolean,
) {
  const results = lines.map((l) =>
    computeReturnLine(
      { qty: l.qty, ratePaise: l.ratePaise, gstPercent: l.gstPercent },
      interstate,
    ),
  );
  const stock = new Map<number, { itemId: number; qty: number; uom: string }>();
  for (const l of lines) {
    if (l.source !== "accepted") {
      continue;
    }
    const entry = stock.get(l.itemId);
    if (entry) {
      entry.qty = fromMilli(toMilli(entry.qty) + toMilli(l.qty));
    } else {
      stock.set(l.itemId, { itemId: l.itemId, qty: l.qty, uom: l.uom });
    }
  }
  return {
    stockOut: [...stock.values()],
    debitNoteTotalPaise: computeReturnTotals(results).totalPaise,
    poEffect:
      replacementExpected && lines.some((l) => l.source === "accepted")
        ? ("replacement" as const)
        : ("credit_only" as const),
  };
}

// A deadlock or serialization failure rolled everything back: safe to retry.
async function inPostTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await repo.withTransaction(fn);
  } catch (error) {
    if (isRetryableConflict(error)) {
      throw new ConflictError(
        "Another change was in progress, try again",
        "PRT_RETRY",
      );
    }
    throw error;
  }
}

export const purchaseReturnService = {
  // Posted counters per GRN line, for the supplier-invoice bill match (BR-PRT-43).
  // Runs inside the caller's transaction so it reads under the GRN line lock.
  async returnedQtyByGrnItem(grnItemIds: number[], tx?: Tx) {
    const rows = await repo.postedCounters(grnItemIds, tx);
    return new Map(
      rows.map((r) => [
        r.id,
        {
          rejectedReturned: r.rejectedReturned,
          acceptedReturned: r.acceptedReturned,
        },
      ]),
    );
  },

  async list(params: PurchaseReturnListQuery) {
    const [{ rows, total, statusCounts }, awaitingCount] = await Promise.all([
      repo.list(params),
      repo.countAwaiting(),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        proNumber: r.proNumber,
        status: r.status,
        grnNumber: r.grnNumber,
        poNumber: r.poNumber,
        supplierName: r.supplierName,
        linesCount: r.linesCount,
        totalPaise: r.totalPaise ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: {
        ...toPaginatedMeta(params.page, params.pageSize, total),
        statusCounts,
        awaitingCount,
      },
    };
  },

  async awaiting(params: AwaitingReturnQuery) {
    const [{ rows, total }, statusCounts, awaitingCount] = await Promise.all([
      repo.listAwaiting(params),
      repo.statusCounts(),
      repo.countAwaiting(),
    ]);
    return {
      data: rows.map((r) => {
        const rejected = Number(r.rejectedQty);
        const reserved = Number(r.rejectedReserved);
        return {
          grnId: r.grnId as number,
          grnNumber: r.grnNumber,
          grnItemId: r.grnItemId,
          itemId: r.itemId,
          itemName: r.itemName,
          batchNumber: r.batchNumber ?? null,
          rejectedQty: rejected,
          rejectedReserved: reserved,
          awaitingQty: fromMilli(toMilli(rejected) - toMilli(reserved)),
          receivedDate: iso(r.receivedDate),
          supplierId: r.supplierId,
          supplierName: r.supplierName,
          uom: r.uom,
        };
      }),
      meta: {
        ...toPaginatedMeta(params.page, params.pageSize, total),
        statusCounts,
        awaitingCount,
      },
    };
  },

  // Writes nothing (BR-PRT-36).
  async prefill(grnId: number) {
    const grn = await repo.findGrnForReturn(grnId);
    if (!grn) {
      throw new NotFoundError("GRN not found");
    }
    if (grn.poId == null || grn.poNumber == null) {
      throw new BadRequestError(
        "Only a GRN against a purchase order can be returned",
        "PRT_GRN_MISMATCH",
      ); // BR-PRT-01
    }
    const allLines = await repo.findGrnLinesForReturn(grnId);
    const decided = allLines.filter(isQaDecided);
    const ids = decided.map((l) => l.id);
    const [reserved, corrections] = await Promise.all([
      repo.reservedByGrnLine(ids),
      repo.correctionsMilliByGrnLine(ids),
    ]);

    const lines = decided.map((l) => {
      const facts = capFacts(l, reserved.get(l.id), corrections.get(l.id) ?? 0);
      return {
        grnItemId: l.id,
        itemId: l.itemId,
        itemName: l.itemName,
        uom: l.uom,
        batchNumber: l.batchNumber ?? null,
        ratePaise: l.ratePaise,
        gstPercent: l.gstPercent,
        ...facts,
        suggested:
          facts.rejectedReturnable > 0
            ? [{ source: "rejected" as const, qty: facts.rejectedReturnable }]
            : [],
      };
    });
    const mainAction = lines.some((l) => l.rejectedReturnable > 0)
      ? ("prefilled" as const)
      : lines.some((l) => l.acceptedReturnable > 0)
        ? ("secondary" as const)
        : ("none" as const);

    return {
      grnId: grn.id,
      grnNumber: grn.grnNumber,
      poId: grn.poId,
      supplierId: grn.supplierId,
      supplierName: grn.supplierName,
      poNumber: grn.poNumber,
      replacementExpected: false as const,
      lines,
      mainAction,
    };
  },

  async getDetails(id: number) {
    const header = await repo.getDetailsHeader(id);
    if (!header) {
      throw new NotFoundError("Purchase return not found");
    }
    const [lines, debitNote, events] = await Promise.all([
      repo.getDetailsLines(id),
      repo.getDebitNote(id),
      repo.getEvents(id),
    ]);
    const grnLineIds = [...new Set(lines.map((l) => l.grnItemId))];
    const [reserved, corrections] = await Promise.all([
      repo.reservedByGrnLine(grnLineIds),
      repo.correctionsMilliByGrnLine(grnLineIds),
    ]);
    // Same supplier-vs-company state test post uses, so the preview total matches (CR-03).
    let previewInterstate = false;
    if (header.status === "draft") {
      const [company, supplier] = await Promise.all([
        repo.findCompanySettings(),
        repo.findSupplier(header.supplierId),
      ]);
      if (company?.stateCode.trim() && supplier) {
        previewInterstate = isInterstateSupply(
          supplier.gstNumber,
          company.stateCode,
        );
      }
    }

    const detailLines = lines.map((l) => ({
      id: l.id,
      grnItemId: l.grnItemId,
      poItemId: l.poItemId,
      itemId: l.itemId,
      itemName: l.itemName,
      hsnCode: l.hsnCode ?? l.itemHsn ?? null,
      batchNumber: l.batchNumber ?? null,
      source: l.source,
      qty: l.returnQty,
      uom: l.uom,
      ratePaise: l.unitPricePaise,
      gstPercent: l.gstPercent,
      taxablePaise: l.taxablePaise ?? null,
      gstPaise: l.gstPaise ?? null,
      cgstPaise: l.cgstPaise ?? null,
      sgstPaise: l.sgstPaise ?? null,
      igstPaise: l.igstPaise ?? null,
      ledgerId: l.ledgerId ?? null,
      cancelLedgerId: l.cancelLedgerId ?? null,
      ...capFacts(
        { acceptedQty: l.grnAcceptedQty, rejectedQty: l.grnRejectedQty },
        reserved.get(l.grnItemId),
        corrections.get(l.grnItemId) ?? 0,
      ),
    }));

    return {
      id: header.id,
      proNumber: header.proNumber,
      status: header.status,
      reason: header.reason,
      vendorReturnRef: header.vendorReturnRef ?? null,
      transporter: header.transporter ?? null,
      vehicleNo: header.vehicleNo ?? null,
      remarks: header.remarks ?? null,
      challanNumber: header.challanNumber ?? null,
      replacementExpected: header.replacementExpected,
      grnId: header.grnId,
      grnNumber: header.grnNumber,
      grnChallanNo: header.grnChallanNo ?? null,
      poId: header.poId,
      poNumber: header.poNumber,
      supplierId: header.supplierId,
      supplierName: header.supplierName,
      postedBy: header.postedBy ?? null,
      postedAt: iso(header.postedAt),
      cancelledBy: header.cancelledBy ?? null,
      cancelledAt: iso(header.cancelledAt),
      cancelReason: header.cancelReason ?? null,
      createdBy: header.createdBy,
      createdAt: header.createdAt.toISOString(),
      lastUpdatedBy: header.lastUpdatedBy,
      lastUpdatedAt: header.lastUpdatedAt.toISOString(),
      lines: detailLines,
      documentFlow: [
        {
          step: "po" as const,
          docNo: header.poNumber,
          id: header.poId,
          status: header.poStatus,
        },
        {
          step: "grn" as const,
          docNo: header.grnNumber,
          id: header.grnId,
          status: header.grnStatus,
        },
        {
          step: "return" as const,
          docNo: header.proNumber,
          id: header.id,
          status: header.status,
        },
      ],
      debitNote: debitNote
        ? {
            id: debitNote.id,
            dnNumber: debitNote.dnNumber,
            debitNoteDate: debitNote.debitNoteDate.toISOString(),
            status: debitNote.status,
            taxablePaise: debitNote.taxablePaise,
            cgstPaise: debitNote.cgstPaise,
            sgstPaise: debitNote.sgstPaise,
            igstPaise: debitNote.igstPaise,
            totalPaise: debitNote.totalPaise,
            isInterstate: debitNote.isInterstate,
            billOffsetPaise: debitNote.billOffsetPaise,
            supplierBill:
              debitNote.supplierInvoiceId != null &&
              debitNote.billNumber != null &&
              debitNote.billDate != null
                ? {
                    id: debitNote.supplierInvoiceId,
                    invoiceNumber: debitNote.billNumber,
                    invoiceDate: debitNote.billDate,
                  }
                : null,
            plantName: debitNote.plantName,
            plantAddress: debitNote.plantAddress,
            plantGstin: debitNote.plantGstin,
            plantStateCode: debitNote.plantStateCode,
            supplierName: debitNote.supplierName,
            supplierAddress: debitNote.supplierAddress ?? null,
            supplierGstin: debitNote.supplierGstin ?? null,
          }
        : null,
      events: events.map((e) => ({
        id: e.id,
        action: e.action,
        fromStatus: e.fromStatus ?? null,
        toStatus: e.toStatus,
        reason: e.reason ?? null,
        actorId: e.actorId,
        actorName: e.actorName ?? null,
        at: e.at.toISOString(),
      })),
      preview:
        header.status === "draft"
          ? previewOf(
              lines.map((l) => ({
                itemId: l.itemId,
                source: l.source,
                qty: l.returnQty,
                uom: l.uom,
                ratePaise: l.unitPricePaise,
                gstPercent: l.gstPercent,
              })),
              header.replacementExpected,
              previewInterstate,
            )
          : null,
    };
  },

  // BR-PRT-01..09, 23. Header lock first, then GRN lines, then the counter.
  async create(input: CreatePurchaseReturnInput, actorId: number) {
    return repo.withTransaction(async (tx) => {
      const grn = await grnRepository.lockGrn(input.grnId, tx);
      if (!grn) {
        throw new NotFoundError("GRN not found");
      }
      if (grn.poId == null) {
        throw new BadRequestError(
          "Only a GRN against a purchase order can be returned",
          "PRT_GRN_MISMATCH",
        ); // BR-PRT-01
      }
      const lines = await buildLines(input.grnId, input.lines, tx);

      const now = new Date();
      const { periodKey, seq } = await allocateDocumentSequence(
        tx,
        "purchase_return",
        actorId,
        now,
        istMonthKey(now),
      );
      const proNumber = `PRT-${periodKey}-${String(seq).padStart(4, "0")}`;

      const header = await repo.insertHeader(
        {
          proNumber,
          grnId: grn.id,
          poId: grn.poId,
          supplierId: grn.supplierId,
          status: "draft",
          reason: input.reason,
          vendorReturnRef: cleanOptional(input.vendorReturnRef) ?? null,
          transporter: cleanOptional(input.transporter) ?? null,
          vehicleNo: cleanOptional(input.vehicleNo) ?? null,
          remarks: cleanOptional(input.remarks) ?? null,
          replacementExpected: input.replacementExpected ?? false,
          createdBy: actorId,
          lastUpdatedBy: actorId,
        },
        tx,
      );
      if (!header) {
        throw new InternalServerError("Failed to create the purchase return");
      }
      await repo.insertLines(
        lines.map((l) => ({ ...l, proId: header.id })),
        tx,
      );
      await repo.insertEvent(
        {
          proId: header.id,
          action: "create",
          fromStatus: null,
          toStatus: "draft",
          actorId,
        },
        tx,
      ); // BR-PRT-41
      return {
        id: header.id,
        proNumber: header.proNumber,
        status: header.status,
      };
    });
  },

  // BR-PRT-10, 46: GRN header lock, then re-check draft.
  async update(input: UpdatePurchaseReturnInput, actorId: number) {
    return repo.withTransaction(async (tx) => {
      const grnId = await lockReturnUnderGrn(input.id, tx);
      const pro = await repo.lockHeader(input.id, tx);
      if (!pro) {
        throw new NotFoundError("Purchase return not found");
      }
      if (pro.status !== "draft") {
        throw notEditable();
      }

      if (input.lines) {
        const lines = await buildLines(grnId, input.lines, tx, pro.id);
        await repo.deleteLines(pro.id, tx);
        await repo.insertLines(
          lines.map((l) => ({ ...l, proId: pro.id })),
          tx,
        );
      }

      const header = await repo.updateHeader(
        pro.id,
        {
          ...(input.reason !== undefined ? { reason: input.reason } : {}),
          ...(input.vendorReturnRef !== undefined
            ? { vendorReturnRef: cleanOptional(input.vendorReturnRef) ?? null }
            : {}),
          ...(input.transporter !== undefined
            ? { transporter: cleanOptional(input.transporter) ?? null }
            : {}),
          ...(input.vehicleNo !== undefined
            ? { vehicleNo: cleanOptional(input.vehicleNo) ?? null }
            : {}),
          ...(input.remarks !== undefined
            ? { remarks: cleanOptional(input.remarks) ?? null }
            : {}),
          ...(input.replacementExpected !== undefined
            ? { replacementExpected: input.replacementExpected }
            : {}),
          lastUpdatedBy: actorId,
          lastUpdatedAt: new Date(),
        },
        tx,
      );
      await repo.insertEvent(
        {
          proId: pro.id,
          action: "edit",
          fromStatus: "draft",
          toStatus: "draft",
          actorId,
        },
        tx,
      );
      return {
        id: pro.id,
        proNumber: pro.proNumber,
        status: header?.status ?? pro.status,
      };
    });
  },

  // BR-PRT-11, 46.
  async cancelDraft(id: number, actorId: number) {
    return repo.withTransaction(async (tx) => {
      await lockReturnUnderGrn(id, tx);
      const pro = await repo.lockHeader(id, tx);
      if (!pro) {
        throw new NotFoundError("Purchase return not found");
      }
      if (pro.status !== "draft") {
        throw notEditable();
      }
      await repo.updateHeader(
        id,
        {
          status: "cancelled",
          lastUpdatedBy: actorId,
          lastUpdatedAt: new Date(),
        },
        tx,
      );
      await repo.insertEvent(
        {
          proId: id,
          action: "cancel_draft",
          fromStatus: "draft",
          toStatus: "cancelled",
          actorId,
        },
        tx,
      );
      return { id, status: "cancelled" as const };
    });
  },

  // BR-PRT-12..24, 29..35. One transaction; lock order GRN header -> PO header ->
  // GRN lines -> PO lines -> items (ascending id, inside postStock) -> counters.
  async post(id: number, actorId: number) {
    return inPostTx(async (tx) => {
      await lockReturnUnderGrn(id, tx);
      const pre = await repo.findHeader(id, tx);
      if (!pre) {
        throw new NotFoundError("Purchase return not found");
      }
      const po = await poRepository.lockPoById(pre.poId, tx);
      if (!po) {
        throw new NotFoundError("Purchase order not found");
      }
      const pro = await repo.lockHeader(id, tx);
      if (!pro) {
        throw new NotFoundError("Purchase return not found");
      }
      if (pro.status !== "draft") {
        throw notEditable(); // the loser of a race lands here too (BR-PRT-13)
      }
      const lines = await repo.findLines(id, tx);
      if (lines.length === 0) {
        throw new BadRequestError("A return needs at least one line");
      }
      const { grnLineIds, grnById } = await lockPostingRows(lines, tx);

      // BR-PRT-07: the post check is the judge. Reserved sums include this draft.
      const [reserved, corrections] = await Promise.all([
        repo.reservedByGrnLine(grnLineIds, tx),
        repo.correctionsMilliByGrnLine(grnLineIds, tx),
      ]);
      for (const line of lines) {
        const grnLine = grnById.get(line.grnItemId);
        if (!grnLine) {
          throw new NotFoundError("GRN line not found");
        }
        const cap = capMilli(
          grnLine,
          line.source,
          corrections.get(line.grnItemId) ?? 0,
        );
        const used = reserved.get(line.grnItemId)?.[line.source] ?? 0;
        if (used > cap) {
          throw capExceeded(409, line.grnItemId, line.source, cap, used);
        }
      }

      const hasAccepted = lines.some((l) => l.source === "accepted");
      const replacement = pro.replacementExpected && hasAccepted;
      if (replacement && ["invoiced", "closed"].includes(po.status)) {
        throw new ConflictError(
          `Purchase order is ${po.status} - a replacement can no longer be received against it`,
          "PRT_REPLACEMENT_PO_CLOSED",
        ); // BR-PRT-22
      }

      // BR-PRT-34: complete plant data and HSN codes, or nothing is made.
      const company = await repo.findCompanySettings(tx);
      if (!company?.gstin.trim() || !company.stateCode.trim()) {
        throw new BadRequestError(
          "Company GSTIN and state are not set up - a debit note cannot be made",
          "PRT_COMPANY_SETTINGS_MISSING",
        );
      }
      const itemIds = [...new Set(lines.map((l) => l.itemId))].sort(
        (a, b) => a - b,
      );
      const items = await repo.findItems(itemIds, tx);
      const hsnByItem = new Map(items.map((i) => [i.id, i.hsnCode?.trim()]));
      const missingHsn = itemIds.filter((i) => !hsnByItem.get(i));
      if (missingHsn.length > 0) {
        throw new AppError(
          `Item(s) without an HSN code: ${missingHsn.join(", ")}`,
          400,
          "PRT_HSN_MISSING",
          { itemIds: missingHsn },
        );
      }
      const supplier = await repo.findSupplier(pro.supplierId, tx);
      if (!supplier) {
        throw new NotFoundError("Supplier not found");
      }

      // BR-PRT-31, 32: per-line amounts; money limit checked before anything is written.
      const interstate = isInterstateSupply(
        supplier.gstNumber,
        company.stateCode,
      );
      const amounts = lines.map((l) =>
        computeReturnLine(
          {
            qty: l.returnQty,
            ratePaise: l.unitPricePaise,
            gstPercent: l.gstPercent,
          },
          interstate,
        ),
      );
      const totals = computeReturnTotals(amounts);

      // BR-PRT-14..17: accepted lines leave stock at the GRN line's posting. Items in
      // ascending id order so two returns sharing items cannot deadlock.
      const postedRows = await repo.findPostedRows(grnLineIds, tx);
      const defaultLocationId = lines.some((l) => l.source === "accepted")
        ? await grnRepository.findDefaultReceivingLocationId(tx)
        : 0;
      const accepted = lines
        .filter((line) => line.source === "accepted")
        .sort((a, b) => a.itemId - b.itemId || a.id - b.id);
      const ledgerByLine = new Map<
        number,
        { ledgerId: number; locationId: number; unitCostPaise: number }
      >();
      for (const line of accepted) {
        const posted = postedRows.get(line.grnItemId);
        const locationId = posted?.locationId ?? defaultLocationId;
        const unitCostPaise = posted?.unitCostPaise ?? line.unitPricePaise;
        const row = await postStock(tx, {
          itemId: line.itemId,
          locationId,
          transactionType: "out",
          referenceType: "pro",
          referenceId: id,
          referenceLineId: line.id,
          batchNumber: line.batchNumber,
          quantityChange: -line.returnQty,
          unitCostPaise,
          averageEffect: "out_at_cost", // BR-PRT-17
          blockNegative: true, // BR-PRT-16
          notes: `Purchase return ${pro.proNumber} line #${line.id}`,
          createdBy: actorId,
        });
        if (!row) {
          throw new InternalServerError("Stock posting returned no ledger row");
        }
        ledgerByLine.set(line.id, {
          ledgerId: row.id,
          locationId,
          unitCostPaise,
        });
      }

      for (const [index, line] of lines.entries()) {
        const amount = amounts[index];
        const ledger = ledgerByLine.get(line.id);
        await repo.updateLine(
          line.id,
          {
            hsnCode: hsnByItem.get(line.itemId) ?? null,
            taxablePaise: amount?.taxablePaise ?? 0,
            gstPaise: amount?.gstPaise ?? 0,
            cgstPaise: amount?.cgstPaise ?? 0,
            sgstPaise: amount?.sgstPaise ?? 0,
            igstPaise: amount?.igstPaise ?? 0,
            ...(ledger
              ? {
                  ledgerId: ledger.ledgerId,
                  locationId: ledger.locationId,
                  unitCostPaise: ledger.unitCostPaise,
                }
              : {}),
          },
          tx,
        );
        // BR-PRT-19, 20: counters
        await repo.addGrnLineReturned(
          line.grnItemId,
          line.source,
          line.returnQty,
          tx,
        );
        await repo.addPoLineReturned(line.poItemId, line.returnQty, tx);
        // BR-PRT-22: a replacement return lowers received qty
        if (replacement && line.source === "accepted") {
          await poRepository.incrementPoItemReceivedQty(
            line.poItemId,
            -line.returnQty,
            tx,
          );
        }
      }
      if (replacement) {
        await poService.recomputeReceiptStatus(pro.poId, tx); // BR-PO-10
      }
      // BR-SINV-29: the PO "invoiced" test is re-run after the counters moved.
      await supplierInvoiceLinkService.reevaluatePoInvoiced(
        pro.poId,
        actorId,
        tx,
      );

      // Numbers last (counter rows lock until commit). BR-PRT-30, 35.
      const now = new Date();
      const dn = await allocateFinancialYearSequence(
        tx,
        "debit_note",
        actorId,
        now,
      );
      const dnNumber = `DN/${dn.fy}/${dn.seq}`;
      const prc = await allocateFinancialYearSequence(
        tx,
        "return_challan",
        actorId,
        now,
      );
      const challanNumber = `PRC/${prc.fy}/${String(prc.seq).padStart(4, "0")}`;

      // BR-PRT-44, 45: link the oldest approved bill covering a returned line, with its offset.
      const billLink = await supplierInvoiceLinkService.findBillForReturnPost(
        lines.map((line, index) => ({
          grnItemId: line.grnItemId,
          source: line.source,
          taxablePaise: amounts[index]?.taxablePaise ?? 0,
          gstPaise: amounts[index]?.gstPaise ?? 0,
        })),
        tx,
      );
      const debitNote = await repo.insertDebitNote(
        {
          dnNumber,
          proId: id,
          debitNoteDate: now,
          status: "issued",
          taxablePaise: totals.taxablePaise,
          cgstPaise: totals.cgstPaise,
          sgstPaise: totals.sgstPaise,
          igstPaise: totals.igstPaise,
          totalPaise: totals.totalPaise,
          isInterstate: interstate,
          supplierInvoiceId: billLink.supplierInvoiceId,
          billOffsetPaise: billLink.billOffsetPaise,
          plantName: company.name,
          plantAddress: company.address,
          plantGstin: company.gstin,
          plantStateCode: company.stateCode,
          supplierName: supplier.name,
          supplierAddress: supplier.address ?? null,
          supplierGstin: supplier.gstNumber ?? null,
          createdBy: actorId,
        },
        tx,
      );
      if (!debitNote) {
        throw new InternalServerError("Failed to create the debit note");
      }
      await repo.updateHeader(
        id,
        {
          status: "posted",
          challanNumber,
          postedBy: actorId,
          postedAt: now,
          lastUpdatedBy: actorId,
          lastUpdatedAt: now,
        },
        tx,
      );
      await repo.insertEvent(
        {
          proId: id,
          action: "post",
          fromStatus: "draft",
          toStatus: "posted",
          actorId,
        },
        tx,
      ); // BR-PRT-41
      return {
        id,
        status: "posted" as const,
        debitNoteId: debitNote.id,
        dnNumber,
        challanNumber,
        totalPaise: totals.totalPaise,
        ledgerRowIds: lines.flatMap((l) => {
          const ledger = ledgerByLine.get(l.id);
          return ledger ? [ledger.ledgerId] : [];
        }),
      };
    });
  },

  // BR-PRT-25..28.
  async cancel(id: number, input: CancelPurchaseReturnInput, actorId: number) {
    return inPostTx(async (tx) => {
      await lockReturnUnderGrn(id, tx);
      const pre = await repo.findHeader(id, tx);
      if (!pre) {
        throw new NotFoundError("Purchase return not found");
      }
      const po = await poRepository.lockPoById(pre.poId, tx);
      if (!po) {
        throw new NotFoundError("Purchase order not found");
      }
      const pro = await repo.lockHeader(id, tx);
      if (!pro) {
        throw new NotFoundError("Purchase return not found");
      }
      if (pro.status !== "posted") {
        throw new ConflictError(
          "Only a posted purchase return can be cancelled this way",
          "PRT_NOT_POSTED",
        );
      }
      const lines = await repo.findLines(id, tx);
      const { poById } = await lockPostingRows(lines, tx);

      const acceptedLines = lines.filter((l) => l.source === "accepted");
      const replacement = pro.replacementExpected && acceptedLines.length > 0;
      if (replacement) {
        if (["invoiced", "closed"].includes(po.status)) {
          throw new ConflictError(
            `Purchase order is ${po.status} - the replacement qty can no longer be added back`,
            "PRT_REPLACEMENT_PO_CLOSED",
          ); // BR-PRT-27
        }
        // Over-receipt limit ordered x 1.05, no override (BR-PRT-27).
        const addBack = new Map<number, number>();
        for (const l of acceptedLines) {
          addBack.set(
            l.poItemId,
            (addBack.get(l.poItemId) ?? 0) + toMilli(l.returnQty),
          );
        }
        for (const [poItemId, milli] of addBack) {
          const poLine = poById.get(poItemId);
          if (!poLine) {
            throw new NotFoundError("PO line not found");
          }
          const limit = Math.round(
            toMilli(poLine.qty) * OVER_RECEIPT_TOLERANCE_RATIO,
          );
          if (toMilli(poLine.receivedQty ?? 0) + milli > limit) {
            throw new ConflictError(
              `Cancelling would put the received qty above 105% of the ordered qty (${poLine.qty})`,
              "PRT_OVER_RECEIPT",
            );
          }
        }
      }

      // BR-PRT-26: one counter row per accepted line, same location and cost.
      const counterRows = new Map<number, number>();
      const ordered = [...acceptedLines].sort(
        (a, b) => a.itemId - b.itemId || a.id - b.id,
      );
      for (const line of ordered) {
        if (line.locationId == null || line.unitCostPaise == null) {
          throw new InternalServerError(
            "Posted return line has no location or cost",
          );
        }
        const row = await postStock(tx, {
          itemId: line.itemId,
          locationId: line.locationId,
          transactionType: "in",
          referenceType: "pro_cancel",
          referenceId: id,
          referenceLineId: line.id,
          batchNumber: line.batchNumber,
          quantityChange: line.returnQty,
          unitCostPaise: line.unitCostPaise,
          notes: `Purchase return ${pro.proNumber} cancelled: ${input.reason}`,
          createdBy: actorId,
        });
        if (!row) {
          throw new InternalServerError("Stock posting returned no ledger row");
        }
        counterRows.set(line.id, row.id);
      }

      for (const line of lines) {
        const cancelLedgerId = counterRows.get(line.id);
        if (cancelLedgerId !== undefined) {
          await repo.updateLine(line.id, { cancelLedgerId }, tx);
        }
        await repo.addGrnLineReturned(
          line.grnItemId,
          line.source,
          -line.returnQty,
          tx,
        );
        await repo.addPoLineReturned(line.poItemId, -line.returnQty, tx);
        if (replacement && line.source === "accepted") {
          await poRepository.incrementPoItemReceivedQty(
            line.poItemId,
            line.returnQty,
            tx,
          );
        }
      }
      if (replacement) {
        await poService.recomputeReceiptStatus(pro.poId, tx);
      }

      const now = new Date();
      await repo.cancelDebitNote(id, actorId, now, tx);
      // BR-SINV-29: the PO "invoiced" test is re-run after the counters moved back.
      await supplierInvoiceLinkService.reevaluatePoInvoiced(
        pro.poId,
        actorId,
        tx,
      );
      await repo.updateHeader(
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
      await repo.insertEvent(
        {
          proId: id,
          action: "cancel_posted",
          fromStatus: "posted",
          toStatus: "cancelled",
          reason: input.reason,
          actorId,
        },
        tx,
      ); // BR-PRT-41
      return {
        id,
        status: "cancelled" as const,
        debitNoteStatus: "cancelled" as const,
      };
    });
  },
};
