import { db } from "../db/client";
import { type Actor, can } from "../lib/auth-middleware";
import { allocateDocumentSequence } from "../lib/document-number";
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../lib/errors";
import { istDayKey } from "../lib/ist-day";
import { assertMoneyInRange } from "../lib/money";
import { computeLinePaise } from "../lib/rfq-math";
import { approvalRepository } from "../repository/approvalRepository";
import type {
  CreatePoLineData,
  PoLinePriceData,
  PoLineRateLinks,
  PreparedPoLine,
  Tx,
} from "../repository/poRepository";
import { NO_RATE_LINKS, poRepository } from "../repository/poRepository";
import { prRepository } from "../repository/prRepository";
import type { RateChoice } from "../repository/rateChainRepository";
import type {
  closePoSchemaType,
  confirmPoSchemaType,
  createPoSchemaType,
  logPoCommunicationSchemaType,
  markPoSentSchemaType,
  poListQuerySchemaType,
  poStatusSchemaType,
  shortClosePoSchemaType,
  updatePoDelaySchemaType,
  updatePoSchemaType,
} from "../types/po.types";
import { assertContractLines } from "./rateContractService";

// Allowed forward moves per status. Empty array = terminal state. Only
// draft/pending_approval/approved/cancelled are reachable by anything built
// so far — the rest is pre-wired for the GRN/invoicing phase.
//
// Deviation from the original set: `dispatched` also allows a direct jump to
// `fully_received` — a single GRN pass can fully receive every line without
// ever passing through `partial_received` (grnService.recomputeReceiptStatus
// needs this edge to be legal).
const PO_STATUS_TRANSITIONS: Record<poStatusSchemaType, poStatusSchemaType[]> =
  {
    draft: ["pending_approval", "cancelled"],
    pending_approval: ["approved", "cancelled"],
    approved: ["dispatched", "cancelled"],
    dispatched: ["partial_received", "fully_received", "cancelled"],
    partial_received: ["fully_received", "cancelled"],
    fully_received: ["invoiced", "closed"],
    // invoiced is set and cleared only by the supplier-invoice service (BR-SINV-29)
    invoiced: ["fully_received", "closed"],
    closed: [],
    cancelled: [],
  };

function assertValidStatusTransition(
  current: poStatusSchemaType,
  next: poStatusSchemaType,
) {
  if (current === next) {
    return;
  }

  if (!PO_STATUS_TRANSITIONS[current].includes(next)) {
    throw new BadRequestError(`Cannot move PO from ${current} to ${next}`);
  }
}

function toPaginatedMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

async function assertLinesAreDraftable(prItemIds: number[], tx?: Tx) {
  const uniqueIds = [...new Set(prItemIds)];
  if (uniqueIds.length !== prItemIds.length) {
    throw new BadRequestError("Duplicate prItemId in the same request");
  }

  const rows = await poRepository.findPurchaseRequestItemsByIds(uniqueIds, tx);
  const rowById = new Map(rows.map((row) => [row.id, row]));

  const missingIds = uniqueIds.filter((id) => !rowById.has(id));
  if (missingIds.length > 0) {
    throw new BadRequestError(
      `Invalid prItemId entries: ${missingIds.join(", ")}`,
    );
  }

  for (const id of uniqueIds) {
    const row = rowById.get(id);
    if (!row) {
      continue;
    }

    if (row.status !== "pending") {
      throw new BadRequestError(
        `PR item ${id} is not in pending status (current: ${row.status})`,
      );
    }

    if (row.prStatus !== "approved" && row.prStatus !== "partial_ordered") {
      throw new BadRequestError(
        `PR item ${id}'s parent PR must be approved or partial_ordered (current: ${row.prStatus})`,
      );
    }

    assertItemActive(row);
  }

  await assertNoOpenRfq(uniqueIds, tx);
  return rowById;
}

// BR-RFQ-02: a PR line on an RFQ that is draft, sent or partially_awarded can't be
// drafted into a PO (the award flips its RFQ lines first, so it passes this check).
async function assertNoOpenRfq(prItemIds: number[], tx?: Tx) {
  const open = await poRepository.findOpenRfqForPrItems(prItemIds, tx ?? db);
  const first = open[0];
  if (first) {
    throw new AppError(
      `PR item ${first.prItemId} is on ${first.rfqNumber}; close or cancel the RFQ first`,
      409,
      "PR_LINE_ON_OPEN_RFQ",
      { prItemId: first.prItemId, rfqNumber: first.rfqNumber },
    );
  }
}

// BR-INV-05: an inactive item can't go on a new PO line, even from a PR line
// approved before the item was deactivated.
function assertItemActive(row: { id: number; itemIsActive: boolean }) {
  if (!row.itemIsActive) {
    throw new BadRequestError(
      `The item of PR item ${row.id} is inactive and can't go on a new PO`,
      "ITEM_INACTIVE",
    );
  }
}

// BR-PO-04: the line maths lives in lib/rfq-math (shared with quote lines, BR-RFQ-16).
export { computeLinePaise };

// BR-PO-04: totals are always the sum of the stored line amounts.
function computeTotalsPaise(
  lines: { lineValuePaise: number; lineTaxPaise: number }[],
) {
  const subtotalPaise = lines.reduce((sum, l) => sum + l.lineValuePaise, 0);
  const taxAmountPaise = lines.reduce((sum, l) => sum + l.lineTaxPaise, 0);
  const totalAmountPaise = subtotalPaise + taxAmountPaise;
  assertMoneyInRange(subtotalPaise);
  assertMoneyInRange(taxAmountPaise);
  assertMoneyInRange(totalAmountPaise);
  return { subtotalPaise, taxAmountPaise, totalAmountPaise };
}

/**
 * Locks the PR lines behind these PO lines (headers first, CRP-2) and turns
 * each resolved line into a PO line ready to save. Re-checks under the lock
 * what the unlocked pre-check saw: the PR line is still pending (a concurrent
 * PO may have drafted it) and its item is still active (BR-INV-05).
 */
function prepareLines(
  lines: CreatePoLineData[],
  prItemMap: Map<
    number,
    Awaited<
      ReturnType<typeof poRepository.findPurchaseRequestItemsByIdsForUpdate>
    >[number]
  >,
): PreparedPoLine[] {
  return lines.map((line) => {
    const prItem = prItemMap.get(line.prItemId);
    if (!prItem) {
      throw new BadRequestError(
        `Invalid prItemId: ${line.prItemId}`,
        "PO_INVALID_PR_ITEM",
      );
    }
    if (prItem.status !== "pending") {
      throw new ConflictError(
        `PR item ${line.prItemId} is no longer pending (already ${prItem.status})`,
        "PO_LINE_ALREADY_DRAFTED",
      );
    }
    assertItemActive(prItem);

    const qty = prItem.requestedQty - (prItem.issuedQty ?? 0);
    return {
      prItemId: line.prItemId,
      itemId: prItem.itemId,
      qty,
      uom: prItem.uom,
      unitPricePaise: line.unitPricePaise,
      gstPercent: line.gstPercent,
      quoteItemId: line.quoteItemId,
      contractItemId: line.contractItemId,
      contractRatePaise: line.contractRatePaise,
      rateOverrideReason: line.rateOverrideReason,
      rateOverrideBy: line.rateOverrideBy,
      rateOverrideAt: line.rateOverrideAt,
      ...computeLinePaise(qty, line.unitPricePaise, line.gstPercent),
    };
  });
}

// BR-PR-36: recompute each touched PR header, in id order.
async function recomputePrHeaders(prIds: Iterable<number>, tx: Tx) {
  for (const prId of [...new Set(prIds)].sort((a, b) => a - b)) {
    await prRepository.recomputeHeaderStatusFromItems(prId, tx);
  }
}

function startOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

// BR-PO-18: the expected delivery date can't be before the PO date.
function assertNotBeforePoDate(
  expected: Date | null | undefined,
  poDate: Date,
) {
  if (expected && expected.getTime() < startOfUtcDay(poDate).getTime()) {
    throw new BadRequestError(
      "Expected delivery date cannot be before the PO date",
      "PO_DATE_BEFORE_PO_DATE",
    );
  }
}

// BR-PO-05, BR-APR-47: only a draft PO can be edited.
function assertEditable(status: poStatusSchemaType) {
  if (status === "pending_approval") {
    throw new ConflictError(
      "Purchase order is locked while it is in approval",
      "DOC_LOCKED_IN_APPROVAL",
    );
  }
  if (status !== "draft") {
    throw new ConflictError(
      `Purchase order can only be edited in draft (now ${status})`,
      "PO_NOT_EDITABLE",
    );
  }
}

// A PO line as typed by the caller (create, update inserts). `quoteItemId` is
// internal: only the RFQ award sets it (BR-RFQ-31), createpo never accepts it.
export type DraftLineInput = {
  prItemId: number;
  unitPricePaise?: number | undefined;
  gstPercent?: number | undefined;
  rateOverrideReason?: string | undefined;
  quoteItemId?: number | undefined;
};

export type DraftPoInput = {
  supplierId: number;
  paymentTermsDays?: number | undefined;
  deliveryTerms?: string | undefined;
  expectedDeliveryDate?: Date | undefined;
  notes?: string | undefined;
  lines: DraftLineInput[];
};

type KeptOverride = {
  unitPricePaise: number;
  reason: string;
  by: number | null;
  at: Date | null;
};

/**
 * BR-RFQ-50, 51, 55, 57: a line whose supplier has a usable contract for the item
 * takes the contract rate and GST %. GST % can never differ (400
 * CONTRACT_LINE_LOCKED_FIELD). A different rate needs contract.override_rate (403
 * first) and a reason (400 OVERRIDE_REASON_REQUIRED). A line that came from a quote
 * (award) takes the contract rate without any override (BR-RFQ-29).
 */
function applyContract(
  line: {
    unitPricePaise?: number | undefined;
    gstPercent?: number | undefined;
    rateOverrideReason?: string | undefined;
    fromQuote: boolean;
  },
  choice: RateChoice,
  actor: Actor,
  keep: KeptOverride | null,
): {
  unitPricePaise: number;
  gstPercent: number;
  links: Omit<PoLineRateLinks, "quoteItemId">;
} {
  const contractRate = choice.ratePaise;
  const contractGst = choice.gstPercent ?? 0;
  let unitPricePaise = contractRate;
  let override: KeptOverride | null = null;

  if (!line.fromQuote) {
    if (line.gstPercent !== undefined && line.gstPercent !== contractGst) {
      throw new BadRequestError(
        "GST % on a contract line is the contract's and can't be changed",
        "CONTRACT_LINE_LOCKED_FIELD",
      );
    }
    if (line.unitPricePaise !== undefined) {
      if (keep && line.unitPricePaise === keep.unitPricePaise) {
        unitPricePaise = keep.unitPricePaise;
        override = keep;
      } else if (line.unitPricePaise !== contractRate) {
        if (!can(actor, "contract.override_rate")) {
          throw new ForbiddenError("Permission denied", "PERMISSION_DENIED", {
            key: "contract.override_rate",
          });
        }
        if (!line.rateOverrideReason) {
          throw new BadRequestError(
            "A reason of 3 to 500 characters is required to change a contract rate",
            "OVERRIDE_REASON_REQUIRED",
          );
        }
        unitPricePaise = line.unitPricePaise;
        override = {
          unitPricePaise,
          reason: line.rateOverrideReason,
          by: actor.id,
          at: new Date(),
        };
      }
    } else if (keep) {
      unitPricePaise = keep.unitPricePaise;
      override = keep;
    }
  }

  return {
    unitPricePaise,
    gstPercent: contractGst,
    links: {
      contractItemId: choice.contractItemId ?? null,
      contractRatePaise: contractRate,
      rateOverrideReason: override?.reason ?? null,
      rateOverrideBy: override?.by ?? null,
      rateOverrideAt: override?.at ?? null,
    },
  };
}

// BR-PO-03 / BR-PO-04 / BR-SUP-16 / BR-RFQ-50: contract rate first, then (when a rate
// is omitted) last PO rate, price list, average cost; an omitted GST % comes from the
// contract, else the price list, else 0.
async function resolveLines(
  tx: Tx,
  actor: Actor,
  supplierId: number,
  lines: DraftLineInput[],
  prRows: Map<number, { itemId: number }>,
  today: string,
) {
  const itemIds = [
    ...new Set(
      lines.flatMap((l) => {
        const row = prRows.get(l.prItemId);
        return row ? [row.itemId] : [];
      }),
    ),
  ];
  const needRate = lines.some((line) => line.unitPricePaise === undefined);
  const [priceRows, choices] = await Promise.all([
    poRepository.findActivePriceRows(supplierId, itemIds),
    // #53: one batch lookup instead of getLastRate per line.
    poRepository.findLastRates(
      supplierId,
      itemIds,
      { onDate: today, includeContract: true, includeFallback: needRate },
      tx,
    ),
  ]);
  const gstByItem = new Map(priceRows.map((r) => [r.itemId, r.taxPercentage]));

  const resolved: CreatePoLineData[] = [];
  for (const line of lines) {
    const itemId = prRows.get(line.prItemId)?.itemId;
    const choice = itemId !== undefined ? choices.get(itemId) : undefined;
    if (choice?.source === "contract") {
      const applied = applyContract(
        { ...line, fromQuote: line.quoteItemId !== undefined },
        choice,
        actor,
        null,
      );
      resolved.push({
        prItemId: line.prItemId,
        unitPricePaise: applied.unitPricePaise,
        gstPercent: applied.gstPercent,
        quoteItemId: line.quoteItemId ?? null,
        ...applied.links,
      });
      continue;
    }
    const unitPricePaise = line.unitPricePaise ?? choice?.ratePaise;
    if (unitPricePaise === undefined || unitPricePaise < 1) {
      throw new BadRequestError(
        `A rate of at least 1 paise is required for PR item ${line.prItemId}`,
        "PO_RATE_REQUIRED",
      );
    }
    resolved.push({
      ...NO_RATE_LINKS,
      prItemId: line.prItemId,
      unitPricePaise,
      gstPercent:
        line.gstPercent ??
        (itemId !== undefined ? gstByItem.get(itemId) : undefined) ??
        0,
      quoteItemId: line.quoteItemId ?? null,
    });
  }
  return resolved;
}

/**
 * BR-RFQ-50, 54: re-resolves the lines being repriced. A contract usable today wins
 * (GST % locked, a different rate needs the override key and a reason); a line whose
 * contract has ended drops its link and snapshot and takes the normal suggestion when
 * no rate is typed; any other line keeps its rate and GST % unless new ones are given.
 */
async function resolveUpdatedLines(
  tx: Tx,
  actor: Actor,
  supplierId: number,
  updates: {
    id: number;
    unitPricePaise?: number | undefined;
    gstPercent?: number | undefined;
    rateOverrideReason?: string | undefined;
  }[],
  existingById: Map<
    number,
    Awaited<ReturnType<typeof poRepository.findPoItemsByPoId>>[number]
  >,
  today: string,
): Promise<PoLinePriceData[]> {
  if (updates.length === 0) return [];
  const itemIds = [
    ...new Set(
      updates.map((u) => (existingById.get(u.id) as { itemId: number }).itemId),
    ),
  ];
  const needFallback = updates.some((u) => {
    const existing = existingById.get(u.id);
    return existing?.contractItemId != null && u.unitPricePaise === undefined;
  });
  const choices = await poRepository.findLastRates(
    supplierId,
    itemIds,
    { onDate: today, includeContract: true, includeFallback: needFallback },
    tx,
  );

  return updates.map((update) => {
    const existing = existingById.get(update.id) as NonNullable<
      ReturnType<typeof existingById.get>
    >;
    const choice = choices.get(existing.itemId);
    let unitPricePaise: number;
    let gstPercent: number;
    let links: PoLineRateLinks;
    if (choice?.source === "contract") {
      const keep: KeptOverride | null =
        existing.contractItemId === choice.contractItemId &&
        existing.rateOverrideReason !== null &&
        existing.unitPricePaise !== existing.contractRatePaise
          ? {
              unitPricePaise: existing.unitPricePaise,
              reason: existing.rateOverrideReason,
              by: existing.rateOverrideBy,
              at: existing.rateOverrideAt,
            }
          : null;
      // CR-04: contract A -> newer B with the old rate sent back unchanged = no rate typed
      const rateTyped =
        existing.contractItemId !== null &&
        existing.contractItemId !== choice.contractItemId &&
        update.unitPricePaise === existing.unitPricePaise
          ? { ...update, unitPricePaise: undefined }
          : update;
      const applied = applyContract(
        { ...rateTyped, fromQuote: false },
        choice,
        actor,
        keep,
      );
      unitPricePaise = applied.unitPricePaise;
      gstPercent = applied.gstPercent;
      links = { quoteItemId: existing.quoteItemId, ...applied.links };
    } else if (existing.contractItemId !== null) {
      // the contract ended: link and snapshot dropped, the line is re-priced (BR-RFQ-54)
      const suggested = update.unitPricePaise ?? choice?.ratePaise;
      if (suggested === undefined || suggested < 1) {
        throw new BadRequestError(
          `A rate of at least 1 paise is required for PO item ${update.id}`,
          "PO_RATE_REQUIRED",
        );
      }
      unitPricePaise = suggested;
      gstPercent = update.gstPercent ?? existing.gstPercent;
      links = { ...NO_RATE_LINKS, quoteItemId: existing.quoteItemId };
    } else {
      unitPricePaise = update.unitPricePaise ?? existing.unitPricePaise;
      gstPercent = update.gstPercent ?? existing.gstPercent;
      links = {
        quoteItemId: existing.quoteItemId,
        contractItemId: null,
        contractRatePaise: null,
        rateOverrideReason: null,
        rateOverrideBy: null,
        rateOverrideAt: null,
      };
    }
    return {
      id: update.id,
      unitPricePaise,
      gstPercent,
      ...computeLinePaise(existing.qty, unitPricePaise, gstPercent),
      links,
    };
  });
}

/**
 * BR-PO-01..04, BR-RFQ-28, 50..52: drafts one PO inside the caller's transaction.
 * `create` opens the transaction; the RFQ award calls this once per winning supplier
 * inside the award transaction (it flips the awarded RFQ lines first, so the open-RFQ
 * check passes). Lock order: the owning PR headers (id asc, FOR UPDATE), then the PR lines (id asc, FOR UPDATE),
 * then contract lines, then the PO number counter.
 */
async function createDraftInTx(tx: Tx, actor: Actor, input: DraftPoInput) {
  const supplier = await poRepository.findSupplierById(input.supplierId, tx);
  if (!supplier) {
    throw new NotFoundError("Supplier not found");
  }
  if (!supplier.isActive) {
    throw new BadRequestError("Supplier is inactive", "SUPPLIER_INACTIVE");
  }

  assertNotBeforePoDate(input.expectedDeliveryDate, new Date());

  const prItemIds = input.lines.map((line) => line.prItemId);
  const prRows = await assertLinesAreDraftable(prItemIds, tx);
  const lines = await resolveLines(
    tx,
    actor,
    input.supplierId,
    input.lines,
    prRows,
    istDayKey(),
  );

  const prItemRows = await poRepository.findPurchaseRequestItemsByIdsForUpdate(
    prItemIds,
    tx,
  );
  // BR-RFQ-02: re-checked under the PR line lock.
  await assertNoOpenRfq(prItemIds, tx);
  const prepared = prepareLines(
    lines,
    new Map(prItemRows.map((row) => [row.id, row])),
  );
  await assertContractLines(
    tx,
    prepared.flatMap((line) =>
      line.contractItemId === null
        ? []
        : [{ contractItemId: line.contractItemId, qty: line.qty }],
    ),
    { checkActive: true },
  );

  const { periodKey, seq } = await allocateDocumentSequence(tx, "po", actor.id);
  const created = await poRepository.insertPo(
    {
      poNumber: `PO-${periodKey}-${seq}`,
      supplierId: input.supplierId,
      ...computeTotalsPaise(prepared),
      // BR-PO-23: no terms typed -> the supplier's default terms.
      paymentTermsDays:
        input.paymentTermsDays ?? supplier.defaultPaymentTermsDays,
      deliveryTerms: input.deliveryTerms ?? null,
      expectedDeliveryDate: input.expectedDeliveryDate ?? null,
      notes: input.notes ?? null,
      createdBy: actor.id,
    },
    tx,
  );
  if (!created) {
    throw new AppError(
      "Failed to create purchase order",
      500,
      "PO_CREATE_FAILED",
    );
  }

  const items = await poRepository.insertPoLines(created.id, prepared, tx);
  if (!items) {
    throw new AppError(
      "PO item/line mismatch during link creation",
      500,
      "PO_LINK_MISMATCH",
    );
  }
  await recomputePrHeaders(
    prItemRows.map((row) => row.prId),
    tx,
  );

  return { po: await reloadPo(created.id, tx), items };
}

const LOGGABLE_STATUSES: poStatusSchemaType[] = [
  "dispatched",
  "partial_received",
];
const CANCELLABLE_STATUSES: poStatusSchemaType[] = [
  "draft",
  "pending_approval",
  "approved",
  "dispatched",
];

// BR-PO-22: check status (400 for a wrong status), then take the row lock and
// check again inside the same transaction (409 for the loser of a race).
async function withLockedPo<T>(
  poId: number,
  allowed: readonly poStatusSchemaType[],
  action: string,
  work: (
    tx: Tx,
    po: NonNullable<Awaited<ReturnType<typeof poRepository.lockPoById>>>,
  ) => Promise<T>,
): Promise<T> {
  const pre = await poRepository.findPoById(poId);
  if (!pre) {
    throw new NotFoundError("Purchase order not found");
  }
  if (!allowed.includes(pre.status)) {
    throw new BadRequestError(
      `Cannot ${action} a purchase order in status ${pre.status}`,
      "PO_INVALID_STATUS",
    );
  }

  return db.transaction(async (tx) => {
    const po = await poRepository.lockPoById(poId, tx);
    if (!po) {
      throw new NotFoundError("Purchase order not found");
    }
    if (!allowed.includes(po.status)) {
      throw new ConflictError(
        `Purchase order is now ${po.status}; reload and try again`,
        "PO_STATUS_CHANGED",
      );
    }
    return work(tx, po);
  });
}

async function reloadPo(poId: number, tx: Tx) {
  const row = await poRepository.findPoById(poId, tx);
  if (!row) {
    throw new NotFoundError("Purchase order not found");
  }
  return row;
}

export const poService = {
  // BR-RFQ-56: contract and quote links only for po.manage / contract.view holders;
  // the override reason, who and when only for po.manage holders (spec Security table).
  async getDetails(poId: number, actor: Actor) {
    const row = await poRepository.getDetails(poId);
    if (!row) {
      throw new NotFoundError("Purchase order not found");
    }
    const seeLinks = can(actor, "po.manage") || can(actor, "contract.view");
    const seeOverride = can(actor, "po.manage");
    return {
      ...row,
      items: row.items.map((item) => ({
        ...item,
        contractItemId: seeLinks ? item.contractItemId : null,
        contractNumber: seeLinks ? item.contractNumber : null,
        contractRatePaise: seeLinks ? item.contractRatePaise : null,
        quoteItemId: seeLinks ? item.quoteItemId : null,
        quoteNumber: seeLinks ? item.quoteNumber : null,
        rateSource: seeLinks
          ? item.contractItemId !== null
            ? ("contract" as const)
            : item.quoteItemId !== null
              ? ("quote" as const)
              : null
          : null,
        rateOverrideReason: seeOverride ? item.rateOverrideReason : null,
        rateOverrideBy: seeOverride ? item.rateOverrideBy : null,
        rateOverrideByName: seeOverride ? item.rateOverrideByName : null,
        rateOverrideAt:
          seeOverride && item.rateOverrideAt
            ? item.rateOverrideAt.toISOString()
            : null,
      })),
    };
  },

  async list(params: poListQuerySchemaType) {
    const { rows, total, statusCounts } = await poRepository.list(params);
    return {
      data: rows,
      meta: {
        ...toPaginatedMeta(params.page, params.pageSize, total),
        statusCounts,
      },
    };
  },

  async create(input: createPoSchemaType, actor: Actor) {
    return db.transaction((tx) => createDraftInTx(tx, actor, input));
  },

  createDraftInTx,

  // BR-PO-05: draft only, checked once under the row lock (BR-PO-22). A PO
  // can't be left with no lines.
  async update(input: updatePoSchemaType, actor: Actor) {
    const { poId } = input;
    return db.transaction(async (tx) => {
      const locked = await poRepository.lockPoById(poId, tx);
      if (!locked) {
        throw new NotFoundError("Purchase order not found");
      }
      assertEditable(locked.status);
      assertNotBeforePoDate(input.expectedDeliveryDate, locked.createdAt);

      const today = istDayKey();
      const insertPrItemIds = input.inserts.map((line) => line.prItemId);
      const inserts =
        insertPrItemIds.length > 0
          ? await resolveLines(
              tx,
              actor,
              locked.supplierId,
              input.inserts,
              await assertLinesAreDraftable(insertPrItemIds, tx),
              today,
            )
          : [];

      const existingItems = await poRepository.findPoItemsByPoId(poId, tx);
      const existingById = new Map(existingItems.map((row) => [row.id, row]));
      const deleteIds = [...new Set(input.deletes.map((del) => del.id))];
      const deleted = new Set(deleteIds);
      for (const id of [...deleteIds, ...input.updates.map((u) => u.id)]) {
        if (!existingById.has(id)) {
          throw new NotFoundError(`PO item not found for id ${id}`);
        }
      }
      // A-43: a line made by an award cannot be removed; cancel the PO to undo it.
      if (deleteIds.some((id) => existingById.get(id)?.quoteItemId != null)) {
        throw new ConflictError(
          "A line made by an award cannot be removed; cancel the purchase order instead",
          "PO_LINE_FROM_AWARD",
        );
      }
      if (existingItems.length - deleteIds.length + inserts.length === 0) {
        throw new BadRequestError(
          "A purchase order needs at least one line",
          "PO_NEEDS_A_LINE",
        );
      }

      const resolvedUpdates = await resolveUpdatedLines(
        tx,
        actor,
        locked.supplierId,
        input.updates.filter((u) => !deleted.has(u.id)),
        existingById,
        today,
      );

      const headerData = {
        ...(input.paymentTermsDays !== undefined
          ? { paymentTermsDays: input.paymentTermsDays }
          : {}),
        ...(input.deliveryTerms !== undefined
          ? { deliveryTerms: input.deliveryTerms }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.expectedDeliveryDate !== undefined
          ? { expectedDeliveryDate: input.expectedDeliveryDate }
          : {}),
      };
      if (Object.keys(headerData).length > 0) {
        await poRepository.updatePoById(poId, headerData, tx);
      }

      // CRP-2: take every PR lock this edit needs up front, headers first and
      // lines in id order, before any line is changed.
      const links = await poRepository.findLinksByPoItemIds(
        poId,
        deleteIds,
        tx,
      );
      const prItemRows =
        await poRepository.findPurchaseRequestItemsByIdsForUpdate(
          [
            ...links
              .map((link) => link.prItemId)
              .filter((id): id is number => id != null),
            ...insertPrItemIds,
          ],
          tx,
        );
      // BR-RFQ-02: re-checked under the PR line lock.
      await assertNoOpenRfq(insertPrItemIds, tx);

      const prepared = prepareLines(
        inserts,
        new Map(prItemRows.map((row) => [row.id, row])),
      );

      // BR-RFQ-52: the contract cap over the lines this PO will have after the edit
      // (lock order: PR lines above, contract lines here, nothing else after).
      const resolvedById = new Map(resolvedUpdates.map((u) => [u.id, u]));
      await assertContractLines(
        tx,
        [
          ...existingItems.flatMap((row) => {
            if (deleted.has(row.id)) return [];
            const contractItemId = resolvedById.has(row.id)
              ? (resolvedById.get(row.id)?.links.contractItemId ?? null)
              : row.contractItemId;
            return contractItemId === null
              ? []
              : [{ contractItemId, qty: row.qty }];
          }),
          ...prepared.flatMap((line) =>
            line.contractItemId === null
              ? []
              : [{ contractItemId: line.contractItemId, qty: line.qty }],
          ),
        ],
        { checkActive: false, poId },
      );

      await poRepository.removePoLines(poId, deleteIds, links, tx);

      const updatedItems = await poRepository.updatePoLinePrices(
        poId,
        resolvedUpdates,
        tx,
      );
      const updatedById = new Map(updatedItems.map((row) => [row.id, row]));

      const createdItems = await poRepository.insertPoLines(poId, prepared, tx);
      if (!createdItems) {
        throw new AppError(
          "Failed to create PO item",
          500,
          "PO_ITEM_CREATE_FAILED",
        );
      }

      await recomputePrHeaders(
        [
          ...links.map((link) => link.prId),
          ...prItemRows
            .filter((row) => insertPrItemIds.includes(row.id))
            .map((row) => row.prId),
        ],
        tx,
      );

      const lines = await poRepository.findPoItemsByPoId(poId, tx);
      const po = await poRepository.updatePoById(
        poId,
        computeTotalsPaise(lines),
        tx,
      );
      if (!po) {
        throw new NotFoundError("Purchase order not found");
      }

      return {
        po,
        items: [
          ...input.updates.flatMap((update) => {
            const row = updatedById.get(update.id);
            return row ? [row] : [];
          }),
          ...createdItems,
        ],
      };
    });
  },

  // BR-PO-11: draft / pending_approval / approved / dispatched with no GRN,
  // reason always required. One transaction under the PO row lock.
  async cancel(poId: number, reason: string, actorId: number) {
    return db.transaction(async (tx) => {
      const pre = await poRepository.findPoById(poId, tx);
      if (!pre) {
        throw new NotFoundError("Purchase order not found");
      }

      // Same lock order as approval actions (request, then document) so they cannot deadlock.
      if (pre.status === "pending_approval") {
        const open = await approvalRepository.findPendingRequestByDoc(
          "po",
          poId,
          tx,
        );
        if (open) {
          await approvalRepository.lockRequestById(open.id, tx);
        }
      }

      const po = await poRepository.lockPoById(poId, tx);
      if (!po) {
        throw new NotFoundError("Purchase order not found");
      }
      if (!CANCELLABLE_STATUSES.includes(po.status)) {
        throw new ConflictError(
          `A purchase order in status ${po.status} cannot be cancelled`,
          "PO_INVALID_TRANSITION",
        );
      }
      if (await poRepository.hasGrnForPo(poId, tx)) {
        throw new ConflictError(
          "Purchase order has a GRN and cannot be cancelled.",
          "PO_HAS_GRN",
        );
      }

      await poRepository.cancelLockedPo(poId, { actorId, reason }, tx);
      // BR-APR-48: the open request is cancelled in the same transaction.
      await approvalRepository.cancelOpenRequestForDocument(
        "po",
        poId,
        undefined,
        { actorId, notes: reason, tx },
      );

      return reloadPo(poId, tx);
    });
  },

  // BR-PO-08, 18: approved -> dispatched with a channel; one "PO sent" row in the same save.
  async markSent(poId: number, input: markPoSentSchemaType, actorId: number) {
    return withLockedPo(poId, ["approved"], "send", async (tx, po) => {
      if (!po.expectedDeliveryDate) {
        throw new BadRequestError(
          "Expected delivery date is required before sending",
          "PO_EXPECTED_DATE_REQUIRED",
        );
      }
      assertNotBeforePoDate(po.expectedDeliveryDate, po.createdAt);

      await poRepository.insertCommunication(
        {
          poId,
          type: "po_sent",
          channel: input.channel,
          toEmail: input.toEmail ?? null,
          note: input.note ?? null,
          sentBy: actorId,
        },
        tx,
      );
      await poRepository.setStatus(poId, "dispatched", tx);
      return reloadPo(poId, tx);
    });
  },

  // BR-PO-17: log rows only, on dispatched / partial_received.
  async logReminder(
    poId: number,
    input: logPoCommunicationSchemaType,
    actorId: number,
  ) {
    return withLockedPo(poId, LOGGABLE_STATUSES, "log a reminder on", (tx) =>
      poRepository.insertCommunication(
        {
          poId,
          type: "reminder",
          channel: input.channel,
          toEmail: input.toEmail ?? null,
          note: input.note ?? null,
          sentBy: actorId,
        },
        tx,
      ),
    );
  },

  async escalate(
    poId: number,
    input: logPoCommunicationSchemaType,
    actorId: number,
  ) {
    return withLockedPo(poId, LOGGABLE_STATUSES, "escalate", (tx) =>
      poRepository.insertCommunication(
        {
          poId,
          type: "escalation",
          channel: input.channel,
          toEmail: input.toEmail ?? null,
          note: input.note ?? null,
          sentBy: actorId,
        },
        tx,
      ),
    );
  },

  // BR-PO-16: dispatched / partial_received; expectedDeliveryDate is never overwritten.
  async updateDelay(poId: number, input: updatePoDelaySchemaType) {
    return withLockedPo(
      poId,
      LOGGABLE_STATUSES,
      "record a delay on",
      async (tx) => {
        await poRepository.updatePoById(
          poId,
          {
            revisedDeliveryDate: input.revisedDeliveryDate,
            delayReason: input.delayReason,
          },
          tx,
        );
        return reloadPo(poId, tx);
      },
    );
  },

  // BR-PO-17: supplier confirmation — who, when, method, note; never changes status.
  async confirmSupplier(
    poId: number,
    input: confirmPoSchemaType,
    actorId: number,
  ) {
    return withLockedPo(poId, LOGGABLE_STATUSES, "confirm", async (tx) => {
      await poRepository.updatePoById(
        poId,
        {
          supplierConfirmed: true,
          confirmationMethod: input.confirmationMethod,
          confirmationNote: input.note ?? null,
          confirmedAt: new Date(),
          confirmedBy: actorId,
        },
        tx,
      );
      // BR-PO-17: also a PO log row (columns above stay in sync for the UI).
      await poRepository.insertCommunication(
        {
          poId,
          type: "confirmation",
          channel: input.confirmationMethod,
          note: input.note ?? null,
          sentBy: actorId,
        },
        tx,
      );
      return reloadPo(poId, tx);
    });
  },

  // BR-PO-14: fully_received or invoiced -> closed, with who, when, optional note.
  async close(poId: number, input: closePoSchemaType, actorId: number) {
    return withLockedPo(
      poId,
      ["fully_received", "invoiced"],
      "close",
      async (tx) => {
        await poRepository.setStatus(poId, "closed", tx, {
          closedAt: new Date(),
          closedBy: actorId,
          closeNote: input.note ?? null,
        });
        return reloadPo(poId, tx);
      },
    );
  },

  // BR-PO-13: partial_received -> closed as a whole; its PR lines -> closed (BR-PR-32).
  async shortClose(
    poId: number,
    input: shortClosePoSchemaType,
    actorId: number,
  ) {
    return withLockedPo(
      poId,
      ["partial_received"],
      "short-close",
      async (tx) => {
        await poRepository.setStatus(poId, "closed", tx, {
          shortClosed: true,
          closedAt: new Date(),
          closedBy: actorId,
          closeNote: input.reason,
        });
        await poRepository.closePrLinesOfPo(poId, tx);
        return reloadPo(poId, tx);
      },
    );
  },

  // BR-PO-21: the PO log (sent / reminder / escalation), newest first.
  async communications(poId: number) {
    const po = await poRepository.findPoById(poId);
    if (!po) {
      throw new NotFoundError("Purchase order not found");
    }
    return poRepository.listCommunications(poId);
  },

  // Recomputes a PO's receipt status after a GRN line posts (accept/bypass).
  // Called from grnService, not duplicated there — reuses this module's
  // status-transition table. `tx` lets the caller run this inside its own
  // transaction (see the GRN-side known non-atomicity note).
  async recomputeReceiptStatus(poId: number, tx?: Tx) {
    const po = await poRepository.findPoById(poId, tx);
    if (!po) {
      throw new NotFoundError("Purchase order not found");
    }

    // BR-SINV-29: `invoiced` is set and cleared only by the supplier-invoice service.
    if (po.status === "invoiced") {
      return po;
    }

    const items = await poRepository.findPoItemQuantitiesByPoId(poId, tx);
    if (items.length === 0) {
      return po;
    }

    const allReceived = items.every(
      (item) => (item.receivedQty ?? 0) >= item.qty,
    );
    const anyReceived = items.some((item) => (item.receivedQty ?? 0) > 0);

    let next: poStatusSchemaType | undefined;
    if (allReceived) {
      next = "fully_received";
    } else if (anyReceived) {
      next = "partial_received";
    } else if (po.status === "partial_received") {
      // everything received was corrected away (BR-PO-10)
      next = "dispatched";
    }

    if (!next || next === po.status) {
      return po;
    }

    // Receipt status moves both ways until invoiced or closed (BR-PO-10).
    const receiptMove =
      (po.status === "fully_received" || po.status === "partial_received") &&
      (next === "partial_received" || next === "dispatched");
    if (!receiptMove) {
      assertValidStatusTransition(po.status, next);
    }
    const row = await poRepository.setStatus(poId, next, tx);
    if (!row) {
      throw new NotFoundError("Purchase order not found");
    }
    return row;
  },
};
