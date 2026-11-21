import { db } from "../db/client";
import { type Actor, can } from "../lib/auth-middleware";
import { isUniqueViolation } from "../lib/db-errors";
import { allocateDocumentSequence } from "../lib/document-number";
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../lib/errors";
import { istDayKey, istMonthKey } from "../lib/ist-day";
import { assertMoneyInRange, MAX_MONEY_PAISE } from "../lib/money";
import {
  assertFreightInRange,
  computeLinePaise,
  formatRupees,
  isGstSlab,
  isRealDay,
  landedRatePaise,
  pickLowest,
  round3,
} from "../lib/rfq-math";
import { companySettingsRepository } from "../repository/companySettingsRepository";
import type { DbExecutor, DbTransaction } from "../repository/executor";
import { poRepository } from "../repository/poRepository";
import { rfqRepository } from "../repository/rfqRepository";
import type {
  AwardInput,
  CreateQuoteInput,
  CreateRfqInput,
  PrLinesQuery,
  RfqListQuery,
  UpdateQuoteInput,
  UpdateRfqInput,
} from "../types/rfq.types";
import { poService } from "./poService";
import { rateContractService } from "./rateContractService";

const iso = (d: Date | null) => (d ? d.toISOString() : null);

const toMeta = (page: number, pageSize: number, total: number) => ({
  page,
  pageSize,
  total,
  totalPages: Math.max(1, Math.ceil(total / pageSize)),
});

// BR-RFQ-72 lock order: RFQ -> quotes -> PR header -> PR lines -> contract lines -> counters.
const LIVE_RFQ = ["sent", "partially_awarded"] as const;
const isLiveRfq = (status: string) =>
  (LIVE_RFQ as readonly string[]).includes(status);

function dupError(what: string, id: number) {
  return new BadRequestError(
    `${what} ${id} is listed twice`,
    "RFQ_DUPLICATE_ID",
  );
}

function assertUnique(ids: number[], what: string) {
  const seen = new Set<number>();
  for (const id of ids) {
    if (seen.has(id)) throw dupError(what, id);
    seen.add(id);
  }
}

function assertDueDate(dueDate: string) {
  if (!isRealDay(dueDate))
    throw new BadRequestError("Due date is not a valid date");
  if (dueDate < istDayKey()) {
    throw new BadRequestError(
      "Quote due date can't be before today",
      "RFQ_DUE_DATE_PAST",
    );
  }
}

async function lockRfqOrThrow(id: number, tx: DbTransaction) {
  const row = await rfqRepository.lockRfq(id, tx);
  if (!row) throw new NotFoundError("RFQ not found");
  return row;
}

function invalidStatus(status: string, action: string) {
  return new ConflictError(
    `An RFQ in status ${status} can't be ${action}`,
    "RFQ_INVALID_STATUS",
  );
}

/**
 * BR-RFQ-01, 02: locks the PR lines (headers first, CRP-2) and checks each is a
 * pending line of an approved / partial_ordered PR with qty left, not on another
 * open RFQ. Returns the lines keyed by id.
 */
async function lockPrLinesForRfq(prItemIds: number[], tx: DbTransaction) {
  const rows = await poRepository.findPurchaseRequestItemsByIdsForUpdate(
    prItemIds,
    tx,
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const id of prItemIds) {
    const row = byId.get(id);
    if (!row) throw new NotFoundError(`PR line ${id} not found`);
    if (
      row.status !== "pending" ||
      (row.prStatus !== "approved" && row.prStatus !== "partial_ordered") ||
      round3(row.requestedQty - (row.issuedQty ?? 0)) <= 0
    ) {
      throw new BadRequestError(
        `PR line ${id} is not a pending line of an approved PR`,
        "RFQ_LINE_NOT_PENDING",
      );
    }
    if (!row.itemIsActive) {
      throw new BadRequestError(
        `The item of PR line ${id} is inactive`,
        "ITEM_INACTIVE",
      );
    }
  }
  const open = await rfqRepository.openRfqForPrItems(prItemIds, null, tx);
  const first = open[0];
  if (first) {
    throw new AppError(
      `PR line ${first.prItemId} is already on ${first.rfqNumber}`,
      409,
      "PR_LINE_ON_OPEN_RFQ",
      { prItemId: first.prItemId, rfqNumber: first.rfqNumber },
    );
  }
  return byId;
}

async function loadActiveSuppliers(ids: number[], tx: DbExecutor) {
  const rows = await rfqRepository.findSuppliers(ids, tx);
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) throw new NotFoundError(`Supplier ${id} not found`);
    if (!row.isActive) {
      throw new BadRequestError(
        `Supplier ${row.name} is inactive`,
        "SUPPLIER_INACTIVE",
      );
    }
  }
  return byId;
}

function mapHeader(
  h: NonNullable<Awaited<ReturnType<typeof rfqRepository.header>>>,
) {
  return {
    id: h.id,
    rfqNumber: h.rfqNumber,
    status: h.status,
    dueDate: h.dueDate,
    notes: h.notes,
    createdBy: h.createdBy,
    createdByName: h.createdByName,
    createdAt: h.createdAt.toISOString(),
    lastUpdatedAt: iso(h.lastUpdatedAt),
    sentBy: h.sentBy,
    sentByName: h.sentByName,
    sentAt: iso(h.sentAt),
    completedAt: iso(h.completedAt),
    closedBy: h.closedBy,
    closedByName: h.closedByName,
    closedAt: iso(h.closedAt),
    closeReason: h.closeReason,
    cancelledBy: h.cancelledBy,
    cancelledByName: h.cancelledByName,
    cancelledAt: iso(h.cancelledAt),
    cancelReason: h.cancelReason,
  };
}

async function headerOrThrow(id: number, executor: DbExecutor) {
  const h = await rfqRepository.header(id, executor);
  if (!h) throw new NotFoundError("RFQ not found");
  return mapHeader(h);
}

async function buildCreated(rfqId: number, executor: DbExecutor) {
  const h = await rfqRepository.header(rfqId, executor);
  if (!h) throw new NotFoundError("RFQ not found");
  const [suppliers, lines] = await Promise.all([
    rfqRepository.suppliersOfRfq(rfqId, executor),
    rfqRepository.plainLines(rfqId, executor),
  ]);
  return {
    id: h.id,
    rfqNumber: h.rfqNumber,
    status: h.status,
    dueDate: h.dueDate,
    suppliers: suppliers.map((s) => ({
      supplierId: s.supplierId,
      name: s.name,
      isActive: s.isActive,
    })),
    lines: lines.map((l) => ({
      id: l.id,
      prItemId: l.prItemId,
      itemId: l.itemId,
      qty: l.qty,
      uom: l.uom,
      lineStatus: l.lineStatus,
    })),
  };
}

function mapQuoteHeader(
  q: Awaited<ReturnType<typeof rfqRepository.quoteHeaders>>[number],
  totals?: { linesPriced: number; totalLandedPaise: number },
) {
  return {
    linesPriced: totals?.linesPriced ?? 0,
    totalLandedPaise: totals?.totalLandedPaise ?? 0,
    id: q.id,
    quoteNumber: q.quoteNumber,
    supplierId: q.supplierId,
    supplierName: q.supplierName,
    status: q.status,
    isAwarded: q.isAwarded,
    supplierQuoteRef: q.supplierQuoteRef,
    quoteDate: q.quoteDate,
    validTill: q.validTill,
    paymentTermsDays: q.paymentTermsDays,
    isLate: q.isLate,
    submittedAt: iso(q.submittedAt),
    cancelledByName: q.cancelledByName,
    cancelledAt: iso(q.cancelledAt),
    cancelReason: q.cancelReason,
  };
}

async function buildQuoteDetails(quoteId: number, executor: DbExecutor) {
  const q = await rfqRepository.quoteHeader(quoteId, executor);
  if (!q) throw new NotFoundError("Quote not found");
  const lines = await rfqRepository.quoteLines(quoteId, executor);
  return {
    ...mapQuoteHeader(q, {
      linesPriced: lines.filter((l) => l.isQuoted).length,
      totalLandedPaise: Math.min(
        lines.reduce(
          (sum, l) =>
            l.isQuoted
              ? sum + (l.lineValuePaise ?? 0) + (l.freightPaise ?? 0)
              : sum,
          0,
        ),
        MAX_MONEY_PAISE,
      ),
    }),
    rfqId: q.rfqId,
    rfqNumber: q.rfqNumber,
    rfqStatus: q.rfqStatus,
    lines: lines.map((l) => ({
      id: l.id,
      rfqItemId: l.rfqItemId,
      itemId: l.itemId,
      itemCode: l.itemCode,
      itemName: l.itemName,
      qty: l.qty,
      uom: l.uom,
      isQuoted: l.isQuoted,
      ratePaise: l.ratePaise,
      gstPercent: l.gstPercent,
      leadDays: l.leadDays,
      freightPaise: l.freightPaise,
      lineValuePaise: l.lineValuePaise,
      lineTaxPaise: l.lineTaxPaise,
      landedRatePaise: l.landedRatePaise,
      isAwarded: l.isAwarded === true,
    })),
  };
}

// BR-RFQ-56: last PO rate and contract rates only for po.manage / contract.view.
const canSeeRates = (actor: Actor) =>
  can(actor, "po.manage") || can(actor, "contract.view");

async function ratesBesideLines(
  itemIds: number[],
  supplierIds: number[],
  executor: DbExecutor,
) {
  const [last, contracts] = await Promise.all([
    rfqRepository.lastPoRates(itemIds, executor),
    rfqRepository.contractRates(supplierIds, itemIds, istDayKey(), executor),
  ]);
  const lastByItem = new Map(last.map((r) => [r.itemId, r.ratePaise]));
  const contractByItem = new Map<
    number,
    { supplierId: number; contractNumber: string; ratePaise: number }[]
  >();
  const seen = new Set<string>();
  for (const c of contracts) {
    const key = `${c.itemId}:${c.supplierId}`;
    if (seen.has(key)) continue; // newest first; one contract rate per supplier + item
    seen.add(key);
    const list = contractByItem.get(c.itemId) ?? [];
    list.push({
      supplierId: c.supplierId,
      contractNumber: c.contractNumber,
      ratePaise: c.ratePaise,
    });
    contractByItem.set(c.itemId, list);
  }
  return { lastByItem, contractByItem };
}

type QuoteLineInput = CreateQuoteInput["lines"][number];

/**
 * BR-RFQ-12, 15, 16, 74: one quote row per RFQ line. Lines the caller left out are
 * "not quoted". Value, tax and landed rate are worked
 * out here, never typed.
 */
function buildQuoteRows(
  inputLines: QuoteLineInput[],
  rfqLines: Awaited<ReturnType<typeof rfqRepository.plainLines>>,
  gstByItem: Map<number, number>,
) {
  const lineById = new Map(rfqLines.map((l) => [l.id, l]));
  const given = new Map<number, QuoteLineInput>();
  for (const l of inputLines) {
    if (!lineById.has(l.rfqItemId) || given.has(l.rfqItemId)) {
      throw new BadRequestError(
        `RFQ line ${l.rfqItemId} is not on this RFQ or is listed twice`,
        "QUOTE_LINE_INVALID",
      );
    }
    given.set(l.rfqItemId, l);
  }
  return rfqLines.map((line) => {
    const input = given.get(line.id);
    if (!input || !input.isQuoted) {
      return {
        rfqItemId: line.id,
        isQuoted: false,
        ratePaise: null,
        gstPercent: null,
        leadDays: null,
        freightPaise: null,
        lineValuePaise: null,
        lineTaxPaise: null,
        landedRatePaise: null,
      };
    }
    const rate = input.ratePaise;
    if (rate === undefined || rate < 1) {
      throw new BadRequestError(
        `A rate of at least 1 paise is required for RFQ line ${line.id}`,
        "QUOTE_LINE_INVALID",
      );
    }
    assertMoneyInRange(rate);
    const gst = input.gstPercent ?? gstByItem.get(line.itemId) ?? 0;
    if (!isGstSlab(gst)) {
      throw new BadRequestError(
        `GST % ${gst} is not an allowed rate`,
        "QUOTE_LINE_INVALID",
      );
    }
    const freight = input.freightPaise ?? 0;
    assertFreightInRange(freight);
    const landed = landedRatePaise(rate, freight, line.qty);
    assertMoneyInRange(landed);
    const { lineValuePaise, lineTaxPaise } = computeLinePaise(
      line.qty,
      rate,
      gst,
    );
    return {
      rfqItemId: line.id,
      isQuoted: true,
      ratePaise: rate,
      gstPercent: gst,
      leadDays: input.leadDays ?? null,
      freightPaise: freight,
      lineValuePaise,
      lineTaxPaise,
      landedRatePaise: landed,
    };
  });
}

// BR-RFQ-14: quote date a real day and not in the future; valid-till a real day, not before it.
function assertQuoteDates(quoteDate: string, validTill: string) {
  if (
    !isRealDay(quoteDate) ||
    !isRealDay(validTill) ||
    quoteDate > istDayKey() ||
    validTill < quoteDate
  ) {
    throw new BadRequestError(
      "Quote date can't be in the future and valid-till can't be before it",
      "QUOTE_DATES_INVALID",
    );
  }
}

/** RFQ lock, status re-read (BR-RFQ-12), then the quote lock (BR-RFQ-72). */
async function lockQuoteOnLiveRfq(quoteId: number, tx: DbTransaction) {
  const pre = await rfqRepository.quoteRow(quoteId, tx);
  if (!pre) throw new NotFoundError("Quote not found");
  const rfq = await lockRfqOrThrow(pre.rfqId, tx);
  if (!isLiveRfq(rfq.status)) throw invalidStatus(rfq.status, "changed");
  const [quote] = await rfqRepository.lockQuotes([quoteId], tx);
  if (!quote) throw new NotFoundError("Quote not found");
  return { rfq, quote };
}

export const rfqService = {
  async prLines(params: PrLinesQuery) {
    const { rows, total } = await rfqRepository.listPrLines(params);
    return {
      data: rows.map((r) => ({
        id: r.id,
        prId: r.prId,
        prNumber: r.prNumber,
        itemId: r.itemId,
        itemCode: r.itemCode,
        itemName: r.itemName,
        qty: r.qty,
        uom: r.uom,
        expectedDate: iso(r.expectedDate),
        onOpenRfq: r.openRfqId !== null,
        openRfqId: r.openRfqId,
        openRfqNumber: r.openRfqNumber,
      })),
      meta: toMeta(params.page, params.pageSize, total),
    };
  },

  async list(params: RfqListQuery) {
    const { rows, total } = await rfqRepository.listRfqs(params);
    const counts = await rfqRepository.listCounts(rows.map((r) => r.id));
    return {
      data: rows.map((r) => ({
        id: r.id,
        rfqNumber: r.rfqNumber,
        status: r.status,
        dueDate: r.dueDate,
        notes: r.notes,
        createdAt: r.createdAt.toISOString(),
        createdByName: r.createdByName,
        supplierCount: counts.supplierCount.get(r.id) ?? 0,
        quotedCount: counts.quotedCount.get(r.id) ?? 0,
        lineCount: counts.lineCount.get(r.id) ?? 0,
      })),
      meta: toMeta(params.page, params.pageSize, total),
    };
  },

  async details(id: number, actor: Actor) {
    const header = await rfqRepository.header(id);
    if (!header) throw new NotFoundError("RFQ not found");
    const [suppliers, lines, quotes, totals] = await Promise.all([
      rfqRepository.suppliersOfRfq(id),
      rfqRepository.detailedLines(id),
      rfqRepository.quoteHeaders(id),
      rfqRepository.quoteTotals(id),
    ]);
    const totalsByQuote = new Map(totals.map((t) => [t.quoteId, t]));
    const base = {
      rfq: mapHeader(header),
      suppliers: suppliers.map((s) => ({
        supplierId: s.supplierId,
        name: s.name,
        isActive: s.isActive,
      })),
      lines: lines.map((l) => ({
        id: l.id,
        prItemId: l.prItemId,
        prId: l.prId,
        prNumber: l.prNumber,
        itemId: l.itemId,
        itemCode: l.itemCode,
        itemName: l.itemName,
        qty: l.qty,
        uom: l.uom,
        lineStatus: l.lineStatus,
        prLineCancelled:
          l.prItemStatus === "cancelled" && l.lineStatus !== "awarded",
        awardedQuoteItemId: l.awardedQuoteItemId,
        awardedQuoteId: l.awardedQuoteId,
        awardedSupplierId: l.awardedSupplierId,
        awardedSupplierName: l.awardedSupplierName,
        awardedAt: iso(l.awardedAt),
        awardReason: l.awardReason,
        awardLowestLandedPaise: l.awardLowestLandedPaise,
        awardChosenLandedPaise: l.awardChosenLandedPaise,
        poItemId: l.poItemId,
        poId: l.poId,
        poNumber: l.poNumber,
        poStatus: l.poStatus,
      })),
      quotes: quotes.map((q) => mapQuoteHeader(q, totalsByQuote.get(q.id))),
    };
    if (!canSeeRates(actor)) return base;
    const itemIds = [...new Set(lines.map((l) => l.itemId))];
    const { lastByItem, contractByItem } = await ratesBesideLines(
      itemIds,
      suppliers.map((s) => s.supplierId),
      db,
    );
    const supplierSet = new Set(suppliers.map((s) => s.supplierId));
    return {
      ...base,
      lineRates: lines.map((l) => ({
        rfqItemId: l.id,
        lastPoRatePaise: lastByItem.get(l.itemId) ?? null,
        contract: (contractByItem.get(l.itemId) ?? []).filter((c) =>
          supplierSet.has(c.supplierId),
        ),
      })),
    };
  },

  // BR-RFQ-01..05
  async create(input: CreateRfqInput, actor: Actor) {
    assertUnique(input.supplierIds, "Supplier");
    assertUnique(input.prItemIds, "PR line");
    if (input.supplierIds.length < 1 || input.supplierIds.length > 10) {
      throw new BadRequestError(
        "An RFQ needs 1 to 10 suppliers",
        "RFQ_SUPPLIER_LIMIT",
      );
    }
    assertDueDate(input.dueDate);
    try {
      return await db.transaction(async (tx) => {
        await loadActiveSuppliers(input.supplierIds, tx);
        const prRows = await lockPrLinesForRfq(input.prItemIds, tx);
        const { periodKey, seq } = await allocateDocumentSequence(
          tx,
          "rfq",
          actor.id,
          new Date(),
          istMonthKey(),
        );
        const rfq = await rfqRepository.insertRfq(
          {
            rfqNumber: `RFQ-${periodKey}-${seq}`,
            status: "draft",
            dueDate: input.dueDate,
            notes: input.notes ? input.notes : null,
            createdBy: actor.id,
          },
          tx,
        );
        if (!rfq) {
          throw new AppError("Failed to create RFQ", 500, "RFQ_CREATE_FAILED");
        }
        await rfqRepository.insertSuppliers(rfq.id, input.supplierIds, tx);
        await rfqRepository.insertLines(
          input.prItemIds.map((prItemId) => {
            const pr = prRows.get(prItemId);
            return {
              rfqId: rfq.id,
              prItemId,
              itemId: pr?.itemId ?? 0,
              qty: round3((pr?.requestedQty ?? 0) - (pr?.issuedQty ?? 0)),
              uom: pr?.uom ?? "",
            };
          }),
          tx,
        );
        return buildCreated(rfq.id, tx);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(
          "A PR line is already on an open RFQ",
          409,
          "PR_LINE_ON_OPEN_RFQ",
        );
      }
      throw error;
    }
  },

  // BR-RFQ-06
  async update(input: UpdateRfqInput, actor: Actor) {
    const addSuppliers = input.addSupplierIds ?? [];
    const removeSuppliers = input.removeSupplierIds ?? [];
    const addLines = input.addPrItemIds ?? [];
    const removeLines = input.removePrItemIds ?? [];
    assertUnique(addSuppliers, "Supplier");
    assertUnique(addLines, "PR line");
    if (input.dueDate !== undefined) assertDueDate(input.dueDate);
    try {
      return await db.transaction(async (tx) => {
        const rfq = await lockRfqOrThrow(input.id, tx);
        if (rfq.status !== "draft") {
          throw new ConflictError(
            "Only a draft RFQ can be edited",
            "RFQ_NOT_EDITABLE",
          );
        }
        const suppliers = await rfqRepository.suppliersOfRfq(input.id, tx);
        const supplierIds = new Set(suppliers.map((s) => s.supplierId));
        for (const id of removeSuppliers) {
          if (!supplierIds.has(id)) {
            throw new BadRequestError(
              `Supplier ${id} is not on this RFQ`,
              "SUPPLIER_NOT_ON_RFQ",
            );
          }
          supplierIds.delete(id);
        }
        for (const id of addSuppliers) {
          if (supplierIds.has(id)) throw dupError("Supplier", id);
          supplierIds.add(id);
        }
        if (supplierIds.size > 10) {
          throw new BadRequestError(
            "An RFQ can have at most 10 suppliers",
            "RFQ_SUPPLIER_LIMIT",
          );
        }
        if (supplierIds.size === 0) {
          throw new BadRequestError(
            "An RFQ needs at least one supplier",
            "RFQ_EMPTY",
          );
        }
        const lines = await rfqRepository.plainLines(input.id, tx);
        const linePrIds = new Set(lines.map((l) => l.prItemId));
        for (const id of removeLines) {
          if (!linePrIds.has(id)) {
            throw new NotFoundError(`PR line ${id} is not on this RFQ`);
          }
          linePrIds.delete(id);
        }
        for (const id of addLines) {
          if (linePrIds.has(id)) throw dupError("PR line", id);
          linePrIds.add(id);
        }
        if (linePrIds.size === 0) {
          throw new BadRequestError(
            "An RFQ needs at least one line",
            "RFQ_EMPTY",
          );
        }

        await loadActiveSuppliers(addSuppliers, tx);
        const prRows = await lockPrLinesForRfq(addLines, tx);
        await rfqRepository.deleteSuppliers(input.id, removeSuppliers, tx);
        await rfqRepository.insertSuppliers(input.id, addSuppliers, tx);
        await rfqRepository.deleteLinesByPrItem(input.id, removeLines, tx);
        await rfqRepository.insertLines(
          addLines.map((prItemId) => {
            const pr = prRows.get(prItemId);
            return {
              rfqId: input.id,
              prItemId,
              itemId: pr?.itemId ?? 0,
              qty: round3((pr?.requestedQty ?? 0) - (pr?.issuedQty ?? 0)),
              uom: pr?.uom ?? "",
            };
          }),
          tx,
        );
        await rfqRepository.updateRfq(
          input.id,
          {
            ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
            ...(input.notes !== undefined
              ? { notes: input.notes ? input.notes : null }
              : {}),
            lastUpdatedBy: actor.id,
            lastUpdatedAt: new Date(),
          },
          tx,
        );
        return buildCreated(input.id, tx);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(
          "A PR line is already on an open RFQ",
          409,
          "PR_LINE_ON_OPEN_RFQ",
        );
      }
      throw error;
    }
  },

  // BR-RFQ-07, 09
  async send(id: number, actor: Actor) {
    return db.transaction(async (tx) => {
      const rfq = await lockRfqOrThrow(id, tx);
      if (rfq.status !== "draft") throw invalidStatus(rfq.status, "sent");
      const lines = await rfqRepository.plainLines(id, tx);
      // Owning PR headers (id asc), then the PR lines (id asc), locked in the usual order, then re-read.
      await poRepository.findPurchaseRequestItemsByIdsForUpdate(
        lines.map((l) => l.prItemId),
        tx,
      );
      const prState = await rfqRepository.openLinePrStatus(id, tx);
      for (const line of prState) {
        if (
          line.prItemStatus !== "pending" ||
          (line.prStatus !== "approved" && line.prStatus !== "partial_ordered")
        ) {
          throw new AppError(
            `PR line ${line.prItemId} is no longer pending`,
            409,
            "RFQ_LINE_STALE",
            { rfqItemId: line.id, prItemId: line.prItemId },
          );
        }
      }
      const suppliers = await rfqRepository.suppliersOfRfq(id, tx);
      for (const s of suppliers) {
        if (!s.isActive) {
          throw new AppError(
            `Supplier ${s.name} is inactive`,
            409,
            "SUPPLIER_INACTIVE_STALE",
            { supplierId: s.supplierId },
          );
        }
      }
      await rfqRepository.updateRfq(
        id,
        {
          status: "sent",
          sentBy: actor.id,
          sentAt: new Date(),
          lastUpdatedBy: actor.id,
          lastUpdatedAt: new Date(),
        },
        tx,
      );
      return headerOrThrow(id, tx);
    });
  },

  // BR-RFQ-36, 37, 38
  async cancel(id: number, reason: string, actor: Actor) {
    return db.transaction(async (tx) => {
      const rfq = await lockRfqOrThrow(id, tx);
      if (rfq.status === "partially_awarded") {
        throw new ConflictError(
          "An RFQ with an awarded line can't be cancelled; close it instead",
          "RFQ_HAS_AWARD",
        );
      }
      if (rfq.status !== "draft" && rfq.status !== "sent") {
        throw invalidStatus(rfq.status, "cancelled");
      }
      // SEC-01/02: cancelling submitted quotes needs rfq.award, as in BR-RFQ-19
      if (!can(actor, "rfq.award")) {
        const quotes = await rfqRepository.quoteHeaders(id, tx);
        if (quotes.some((q) => q.status === "submitted")) {
          throw new ForbiddenError("Permission denied", "PERMISSION_DENIED", {
            key: "rfq.award",
          });
        }
      }
      await rfqRepository.dropOpenLines(id, tx);
      await rfqRepository.cancelDraftQuotes(id, actor.id, tx, [
        "draft",
        "submitted",
      ]);
      await rfqRepository.updateRfq(
        id,
        {
          status: "cancelled",
          cancelledBy: actor.id,
          cancelledAt: new Date(),
          cancelReason: reason,
          lastUpdatedBy: actor.id,
          lastUpdatedAt: new Date(),
        },
        tx,
      );
      return headerOrThrow(id, tx);
    });
  },

  // BR-RFQ-35, 37, 38
  async close(id: number, reason: string, actor: Actor) {
    return db.transaction(async (tx) => {
      const rfq = await lockRfqOrThrow(id, tx);
      if (!isLiveRfq(rfq.status)) throw invalidStatus(rfq.status, "closed");
      await rfqRepository.dropOpenLines(id, tx);
      await rfqRepository.cancelDraftQuotes(id, actor.id, tx);
      await rfqRepository.markNotAwarded(id, tx);
      await rfqRepository.updateRfq(
        id,
        {
          status: "closed",
          closedBy: actor.id,
          closedAt: new Date(),
          closeReason: reason,
          lastUpdatedBy: actor.id,
          lastUpdatedAt: new Date(),
        },
        tx,
      );
      return headerOrThrow(id, tx);
    });
  },

  // BR-RFQ-08: one sheet per supplier, no rates, no notes, no other supplier.
  async print(id: number) {
    const header = await rfqRepository.header(id);
    if (!header) throw new NotFoundError("RFQ not found");
    if (header.status === "draft" || header.status === "cancelled") {
      throw invalidStatus(header.status, "printed");
    }
    const [suppliers, lines, company] = await Promise.all([
      rfqRepository.suppliersOfRfq(id),
      rfqRepository.detailedLines(id),
      companySettingsRepository.get(),
    ]);
    return {
      rfqNumber: header.rfqNumber,
      dueDate: header.dueDate,
      company: company
        ? {
            name: company.name,
            address: company.address ?? null,
            gstin: company.gstin ?? null,
          }
        : null,
      sheets: suppliers.map((s) => ({
        supplier: {
          id: s.supplierId,
          name: s.name,
          address: s.address,
          gstin: s.gstin,
        },
        lines: lines.map((l) => ({
          itemCode: l.itemCode,
          itemName: l.itemName,
          qty: l.qty,
          uom: l.uom,
        })),
      })),
    };
  },

  async quoteDetails(quoteId: number) {
    return buildQuoteDetails(quoteId, db);
  },

  // BR-RFQ-12..17
  async createQuote(rfqId: number, input: CreateQuoteInput, actor: Actor) {
    assertQuoteDates(input.quoteDate, input.validTill);
    try {
      return await db.transaction(async (tx) => {
        const rfq = await lockRfqOrThrow(rfqId, tx);
        if (!isLiveRfq(rfq.status)) throw invalidStatus(rfq.status, "quoted");
        const suppliers = await rfqRepository.suppliersOfRfq(rfqId, tx);
        const supplier = suppliers.find(
          (s) => s.supplierId === input.supplierId,
        );
        if (!supplier) {
          throw new BadRequestError(
            "Supplier is not on this RFQ",
            "SUPPLIER_NOT_ON_RFQ",
          );
        }
        if (
          await rfqRepository.liveQuoteOfSupplier(rfqId, input.supplierId, tx)
        ) {
          throw new ConflictError(
            "This supplier already has a live quote on the RFQ; cancel it first",
            "QUOTE_EXISTS",
          );
        }
        const rfqLines = await rfqRepository.plainLines(rfqId, tx);
        const gst = await rfqRepository.priceListGst(
          input.supplierId,
          rfqLines.map((l) => l.itemId),
          tx,
        );
        const rows = buildQuoteRows(
          input.lines,
          rfqLines,
          new Map(gst.map((g) => [g.itemId, g.taxPercentage])),
        );
        const { periodKey, seq } = await allocateDocumentSequence(
          tx,
          "rfq_quote",
          actor.id,
          new Date(),
          istMonthKey(),
        );
        const quote = await rfqRepository.insertQuote(
          {
            quoteNumber: `SQ-${periodKey}-${seq}`,
            rfqId,
            supplierId: input.supplierId,
            status: "draft",
            supplierQuoteRef: input.supplierQuoteRef,
            quoteDate: input.quoteDate,
            validTill: input.validTill,
            paymentTermsDays:
              input.paymentTermsDays ?? supplier.defaultPaymentTermsDays,
            createdBy: actor.id,
          },
          tx,
        );
        if (!quote) {
          throw new AppError(
            "Failed to create quote",
            500,
            "QUOTE_CREATE_FAILED",
          );
        }
        await rfqRepository.replaceQuoteItems(
          quote.id,
          rows.map((r) => ({ ...r, quoteId: quote.id })),
          tx,
        );
        return buildQuoteDetails(quote.id, tx);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          "This supplier already has a live quote on the RFQ; cancel it first",
          "QUOTE_EXISTS",
        );
      }
      throw error;
    }
  },

  // BR-RFQ-14..16, 18: a draft quote's lines are replaced.
  async updateQuote(quoteId: number, input: UpdateQuoteInput, actor: Actor) {
    assertQuoteDates(input.quoteDate, input.validTill);
    return db.transaction(async (tx) => {
      const { rfq, quote } = await lockQuoteOnLiveRfq(quoteId, tx);
      if (quote.status !== "draft") {
        throw new ConflictError(
          "Only a draft quote can be edited",
          "QUOTE_NOT_EDITABLE",
        );
      }
      const suppliers = await rfqRepository.suppliersOfRfq(rfq.id, tx);
      const supplier = suppliers.find((s) => s.supplierId === quote.supplierId);
      const rfqLines = await rfqRepository.plainLines(rfq.id, tx);
      const gst = await rfqRepository.priceListGst(
        quote.supplierId,
        rfqLines.map((l) => l.itemId),
        tx,
      );
      const rows = buildQuoteRows(
        input.lines,
        rfqLines,
        new Map(gst.map((g) => [g.itemId, g.taxPercentage])),
      );
      await rfqRepository.updateQuote(
        quoteId,
        {
          supplierQuoteRef: input.supplierQuoteRef,
          quoteDate: input.quoteDate,
          validTill: input.validTill,
          paymentTermsDays:
            input.paymentTermsDays ?? supplier?.defaultPaymentTermsDays ?? 0,
          lastUpdatedBy: actor.id,
          lastUpdatedAt: new Date(),
        },
        tx,
      );
      await rfqRepository.replaceQuoteItems(
        quoteId,
        rows.map((r) => ({ ...r, quoteId })),
        tx,
      );
      return buildQuoteDetails(quoteId, tx);
    });
  },

  // BR-RFQ-17, 18
  async submitQuote(quoteId: number, actor: Actor) {
    return db.transaction(async (tx) => {
      const { rfq, quote } = await lockQuoteOnLiveRfq(quoteId, tx);
      if (quote.status !== "draft") {
        throw new ConflictError(
          "Only a draft quote can be submitted",
          "QUOTE_NOT_EDITABLE",
        );
      }
      const lines = await rfqRepository.quoteLines(quoteId, tx);
      if (!lines.some((l) => l.isQuoted && l.lineStatus === "open")) {
        throw new BadRequestError(
          "A quote needs at least one priced line",
          "QUOTE_EMPTY",
        );
      }
      await rfqRepository.updateQuote(
        quoteId,
        {
          status: "submitted",
          // late = submitted on an India day after the due date (BR-RFQ-17)
          isLate: istDayKey() > rfq.dueDate,
          submittedBy: actor.id,
          submittedAt: new Date(),
          lastUpdatedBy: actor.id,
          lastUpdatedAt: new Date(),
        },
        tx,
      );
      return buildQuoteDetails(quoteId, tx);
    });
  },

  // BR-RFQ-19: draft or submitted with no awarded line; submitted also needs rfq.award.
  async cancelQuote(quoteId: number, reason: string, actor: Actor) {
    const pre = await rfqRepository.quoteRow(quoteId);
    if (!pre) throw new NotFoundError("Quote not found");
    if (pre.status === "submitted" && !can(actor, "rfq.award")) {
      throw new ForbiddenError("Permission denied", "PERMISSION_DENIED", {
        key: "rfq.award",
      });
    }
    return db.transaction(async (tx) => {
      const rfq = await lockRfqOrThrow(pre.rfqId, tx);
      const [quote] = await rfqRepository.lockQuotes([quoteId], tx);
      if (!quote) throw new NotFoundError("Quote not found");
      if (quote.status !== "draft" && quote.status !== "submitted") {
        throw new ConflictError(
          `A quote in status ${quote.status} can't be cancelled`,
          "QUOTE_INVALID_STATUS",
        );
      }
      if (await rfqRepository.quoteHasAward(quoteId, tx)) {
        throw new ConflictError(
          "A quote with an awarded line can't be cancelled",
          "QUOTE_AWARDED",
        );
      }
      if (!isLiveRfq(rfq.status)) throw invalidStatus(rfq.status, "changed");
      // the row may have been submitted while we waited for the lock
      if (quote.status === "submitted" && !can(actor, "rfq.award")) {
        throw new ForbiddenError("Permission denied", "PERMISSION_DENIED", {
          key: "rfq.award",
        });
      }
      await rfqRepository.updateQuote(
        quoteId,
        {
          status: "cancelled",
          cancelledBy: actor.id,
          cancelledAt: new Date(),
          cancelReason: reason,
          lastUpdatedBy: actor.id,
          lastUpdatedAt: new Date(),
        },
        tx,
      );
      return buildQuoteDetails(quoteId, tx);
    });
  },

  // BR-RFQ-20..24: computed on read, nothing stored.
  async comparison(id: number, actor: Actor) {
    const header = await rfqRepository.header(id);
    if (!header) throw new NotFoundError("RFQ not found");
    const [suppliers, lines, items, cancelled] = await Promise.all([
      rfqRepository.suppliersOfRfq(id),
      rfqRepository.detailedLines(id),
      rfqRepository.comparisonQuoteItems(id, db),
      rfqRepository.cancelledQuotes(id, db),
    ]);
    const today = istDayKey();
    const seeRates = canSeeRates(actor);
    const rates = seeRates
      ? await ratesBesideLines(
          [...new Set(lines.map((l) => l.itemId))],
          suppliers.map((s) => s.supplierId),
          db,
        )
      : null;
    const supplierSet = new Set(suppliers.map((s) => s.supplierId));
    const byCell = new Map(
      items.map((i) => [`${i.rfqItemId}:${i.supplierId}`, i]),
    );

    const rows = lines.map((line) => {
      const cells = suppliers.map((s) => {
        const qi = byCell.get(`${line.id}:${s.supplierId}`);
        const empty = {
          supplierId: s.supplierId,
          quoteId: null as number | null,
          quoteItemId: null as number | null,
          state: "no_quote" as
            | "priced"
            | "not_quoted"
            | "no_quote"
            | "expired"
            | "inactive",
          ratePaise: null as number | null,
          gstPercent: null as number | null,
          freightPaise: null as number | null,
          landedRatePaise: null as number | null,
          leadDays: null as number | null,
          validTill: null as string | null,
          paymentTermsDays: null as number | null,
          isLate: null as boolean | null,
          isLowest: false,
          eligible: false,
        };
        if (!qi) return { cell: empty, qi: null };
        const base = {
          ...empty,
          quoteId: qi.quoteId,
          quoteItemId: qi.quoteItemId,
          validTill: qi.validTill,
          paymentTermsDays: qi.paymentTermsDays,
          isLate: qi.isLate,
        };
        if (!qi.isQuoted) {
          return { cell: { ...base, state: "not_quoted" as const }, qi: null };
        }
        const state = !qi.supplierActive
          ? ("inactive" as const)
          : qi.validTill < today
            ? ("expired" as const)
            : ("priced" as const);
        // A-44: lines already awarded or dropped show their quotes but are never eligible
        const eligible =
          state === "priced" &&
          qi.quoteStatus === "submitted" &&
          line.lineStatus === "open";
        return {
          cell: {
            ...base,
            state,
            ratePaise: qi.ratePaise,
            gstPercent: qi.gstPercent,
            freightPaise: qi.freightPaise,
            landedRatePaise: qi.landedRatePaise,
            leadDays: qi.leadDays,
            eligible,
          },
          qi: eligible && qi.landedRatePaise !== null ? qi : null,
        };
      });
      const lowest = pickLowest(
        cells.flatMap((c) =>
          c.qi && c.qi.landedRatePaise !== null
            ? [
                {
                  quoteItemId: c.qi.quoteItemId,
                  landedRatePaise: c.qi.landedRatePaise,
                  leadDays: c.qi.leadDays,
                  submittedAt: c.qi.submittedAt,
                },
              ]
            : [],
        ),
      );
      return {
        rfqItemId: line.id,
        itemId: line.itemId,
        itemCode: line.itemCode,
        itemName: line.itemName,
        qty: line.qty,
        uom: line.uom,
        lineStatus: line.lineStatus,
        prLineCancelled:
          line.prItemStatus === "cancelled" && line.lineStatus !== "awarded",
        ...(rates
          ? {
              lastPoRatePaise: rates.lastByItem.get(line.itemId) ?? null,
              contract: (rates.contractByItem.get(line.itemId) ?? []).filter(
                (c) => supplierSet.has(c.supplierId),
              ),
            }
          : {}),
        cells: cells.map(({ cell }) => ({
          ...cell,
          isLowest: lowest !== null && cell.quoteItemId === lowest.quoteItemId,
        })),
      };
    });

    return {
      rfq: {
        id: header.id,
        rfqNumber: header.rfqNumber,
        status: header.status,
        dueDate: header.dueDate,
      },
      suppliers: suppliers.map((s) => ({
        supplierId: s.supplierId,
        name: s.name,
        isActive: s.isActive,
      })),
      rows,
      cancelledQuotes: cancelled.map((q) => ({
        quoteId: q.quoteId,
        quoteNumber: q.quoteNumber,
        supplierId: q.supplierId,
        cancelledBy: q.cancelledBy,
        cancelledByName: q.cancelledByName,
        cancelledAt: iso(q.cancelledAt),
        cancelReason: q.cancelReason,
      })),
    };
  },

  /**
   * BR-RFQ-25..34, 72: awards RFQ lines to quote lines and drafts one PO per winning
   * supplier, all in one transaction. The awarded RFQ lines are flipped first, so the
   * shared PO draft's open-RFQ check (BR-RFQ-02) lets them through.
   */
  async award(rfqId: number, input: AwardInput, actor: Actor) {
    return db.transaction(async (tx) => {
      const rfq = await lockRfqOrThrow(rfqId, tx);
      const lines = await rfqRepository.plainLines(rfqId, tx);
      const lineById = new Map(lines.map((l) => [l.id, l]));

      if (!isLiveRfq(rfq.status)) {
        // an awarded RFQ asked for a line that is already awarded: say so
        if (
          rfq.status === "awarded" &&
          input.lines.some(
            (l) => lineById.get(l.rfqItemId)?.lineStatus === "awarded",
          )
        ) {
          throw new ConflictError(
            "This RFQ line is already awarded",
            "RFQ_LINE_AWARDED",
          );
        }
        throw invalidStatus(rfq.status, "awarded");
      }

      for (const req of input.lines) {
        const line = lineById.get(req.rfqItemId);
        if (!line) {
          throw new BadRequestError(
            `RFQ line ${req.rfqItemId} is not on this RFQ`,
            "QUOTE_LINE_INVALID",
          );
        }
        if (line.lineStatus === "awarded") {
          throw new ConflictError(
            `RFQ line ${line.id} is already awarded`,
            "RFQ_LINE_AWARDED",
          );
        }
        if (line.lineStatus === "dropped") {
          throw new AppError(
            `RFQ line ${line.id} was dropped`,
            409,
            "RFQ_LINE_STALE",
            { rfqItemId: line.id },
          );
        }
      }

      // quotes (id asc), then PR header and lines (CRP-2) of every open line
      const headers = await rfqRepository.quoteHeaders(rfqId, tx);
      await rfqRepository.lockQuotes(
        headers.map((h) => h.id),
        tx,
      );
      const openLines = lines.filter((l) => l.lineStatus === "open");
      const prRows = await poRepository.findPurchaseRequestItemsByIdsForUpdate(
        openLines.map((l) => l.prItemId),
        tx,
      );
      const prById = new Map(prRows.map((r) => [r.id, r]));

      const today = istDayKey();
      const quoteItems = await rfqRepository.comparisonQuoteItems(rfqId, tx, [
        "submitted",
      ]);
      const quoteItemById = new Map(quoteItems.map((q) => [q.quoteItemId, q]));

      const picks = input.lines.map((req) => {
        const line = lineById.get(req.rfqItemId) as NonNullable<
          ReturnType<typeof lineById.get>
        >;
        const chosen = quoteItemById.get(req.quoteItemId);
        if (
          !chosen ||
          chosen.rfqItemId !== line.id ||
          !chosen.isQuoted ||
          chosen.ratePaise === null ||
          chosen.gstPercent === null ||
          chosen.landedRatePaise === null
        ) {
          throw new BadRequestError(
            `Quote line ${req.quoteItemId} can't be awarded for RFQ line ${line.id}`,
            "QUOTE_LINE_INVALID",
          );
        }
        const pr = prById.get(line.prItemId);
        if (
          !pr ||
          pr.status !== "pending" ||
          (pr.prStatus !== "approved" && pr.prStatus !== "partial_ordered")
        ) {
          throw new AppError(
            `PR line ${line.prItemId} is no longer pending`,
            409,
            "RFQ_LINE_STALE",
            { rfqItemId: line.id, prItemId: line.prItemId },
          );
        }
        if (!chosen.supplierActive) {
          throw new AppError(
            "The supplier of this quote is inactive",
            409,
            "SUPPLIER_INACTIVE_STALE",
            { supplierId: chosen.supplierId, rfqItemId: line.id },
          );
        }
        if (chosen.validTill < today) {
          throw new AppError(
            `Quote ${chosen.quoteNumber} expired on ${chosen.validTill}`,
            409,
            "QUOTE_EXPIRED",
            { quoteId: chosen.quoteId, rfqItemId: line.id },
          );
        }
        // BR-RFQ-27: a line not given to the lowest eligible quote needs a reason
        const lowest = pickLowest(
          quoteItems.flatMap((q) =>
            q.rfqItemId === line.id &&
            q.isQuoted &&
            q.supplierActive &&
            q.validTill >= today &&
            q.landedRatePaise !== null
              ? [{ ...q, landedRatePaise: q.landedRatePaise }]
              : [],
          ),
        );
        if (
          lowest &&
          lowest.quoteItemId !== chosen.quoteItemId &&
          !req.reason
        ) {
          throw new BadRequestError(
            "A reason is required to award a line to a quote that is not the lowest",
            "AWARD_REASON_REQUIRED",
          );
        }
        return {
          line,
          chosen,
          reason: req.reason ?? null,
          lowestLanded: lowest?.landedRatePaise ?? chosen.landedRatePaise,
        };
      });

      // one PO per winning supplier, in supplier id order
      const bySupplier = new Map<number, typeof picks>();
      for (const pick of picks) {
        const list = bySupplier.get(pick.chosen.supplierId) ?? [];
        list.push(pick);
        bySupplier.set(pick.chosen.supplierId, list);
      }
      const supplierIds = [...bySupplier.keys()].sort((a, b) => a - b);

      // contract lines the POs will use are locked before any PO number is taken
      for (const supplierId of supplierIds) {
        await rateContractService.lockUsableContractLines(
          tx,
          supplierId,
          (bySupplier.get(supplierId) ?? []).map((p) => p.line.itemId),
        );
      }

      // flip the awarded lines first (BR-RFQ-02 exception), drop lines whose PR line
      // was cancelled (BR-RFQ-11)
      const now = new Date();
      await rfqRepository.markLinesAwarded(
        picks.map((pick) => ({
          id: pick.line.id,
          quoteItemId: pick.chosen.quoteItemId,
          actorId: actor.id,
          reason: pick.reason,
          lowestLandedPaise: pick.lowestLanded,
          chosenLandedPaise: pick.chosen.landedRatePaise ?? 0,
          at: now,
        })),
        tx,
      );
      const awardedIds = new Set(picks.map((p) => p.line.id));
      await rfqRepository.markLinesDropped(
        openLines
          .filter(
            (l) =>
              !awardedIds.has(l.id) &&
              prById.get(l.prItemId)?.status === "cancelled",
          )
          .map((l) => l.id),
        tx,
      );

      const itemNames = new Map(
        (
          await rfqRepository.itemsByIds(
            [...new Set(picks.map((p) => p.line.itemId))],
            tx,
          )
        ).map((i) => [i.id, i.name]),
      );
      const quoteRefs = new Map(headers.map((h) => [h.id, h.supplierQuoteRef]));

      const pos: {
        poId: number;
        poNumber: string;
        supplierId: number;
        lineCount: number;
      }[] = [];
      const poLinks: { id: number; poItemId: number }[] = [];
      const awards: {
        rfqItemId: number;
        poId: number;
        poNumber: string;
        poItemId: number;
        ratePaise: number;
        source: "contract" | "quote";
      }[] = [];
      for (const supplierId of supplierIds) {
        const group = bySupplier.get(supplierId) ?? [];
        const first = group[0];
        if (!first) continue;
        // BR-RFQ-30: freight goes into the PO notes, one line per quoted freight
        const notes = group
          .flatMap((p) =>
            (p.chosen.freightPaise ?? 0) > 0
              ? [
                  `Freight ₹${formatRupees(p.chosen.freightPaise ?? 0)} on ${itemNames.get(p.line.itemId) ?? p.line.itemId} as per ${quoteRefs.get(p.chosen.quoteId) ?? p.chosen.quoteNumber}`,
                ]
              : [],
          )
          .join("\n");
        const { po, items } = await poService.createDraftInTx(tx, actor, {
          supplierId,
          paymentTermsDays: first.chosen.paymentTermsDays,
          ...(notes ? { notes } : {}),
          lines: group.map((p) => ({
            prItemId: p.line.prItemId,
            unitPricePaise: p.chosen.ratePaise ?? 0,
            gstPercent: p.chosen.gstPercent ?? 0,
            quoteItemId: p.chosen.quoteItemId,
          })),
        });
        pos.push({
          poId: po.id,
          poNumber: po.poNumber,
          supplierId,
          lineCount: items.length,
        });
        for (const [index, pick] of group.entries()) {
          const item = items[index];
          if (!item) continue;
          poLinks.push({ id: pick.line.id, poItemId: item.id });
          awards.push({
            rfqItemId: pick.line.id,
            poId: po.id,
            poNumber: po.poNumber,
            poItemId: item.id,
            ratePaise: item.unitPricePaise,
            source: item.contractItemId !== null ? "contract" : "quote",
          });
        }
      }

      await rfqRepository.setPoItems(poLinks, tx);

      // BR-RFQ-34, 38: the RFQ is awarded when no line is open any more
      const stillOpen = await rfqRepository.countOpenLines(rfqId, tx);
      const status = stillOpen === 0 ? "awarded" : "partially_awarded";
      if (status === "awarded") {
        await rfqRepository.cancelDraftQuotes(rfqId, actor.id, tx);
        await rfqRepository.markNotAwarded(rfqId, tx);
      }
      await rfqRepository.updateRfq(
        rfqId,
        {
          status,
          ...(status === "awarded" ? { completedAt: now } : {}),
          lastUpdatedBy: actor.id,
          lastUpdatedAt: now,
        },
        tx,
      );
      awards.sort((a, b) => a.rfqItemId - b.rfqItemId);
      return { rfq: { id: rfqId, status }, pos, awards };
    });
  },
};
