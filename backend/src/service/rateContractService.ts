import { db } from "../db/client";
import { allocateDocumentSequence } from "../lib/document-number";
import {
  AppError,
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../lib/errors";
import { istDayKey, istMonthKey } from "../lib/ist-day";
import { assertMoneyInRange } from "../lib/money";
import {
  contractCapQty,
  isGstSlab,
  isRealDay,
  percentOf,
  round3,
} from "../lib/rfq-math";
import type { DbExecutor, DbTransaction } from "../repository/executor";
import { findRateChoices } from "../repository/rateChainRepository";
import { rateContractRepository } from "../repository/rateContractRepository";
import type {
  ContractListQuery,
  CreateContractInput,
  TerminateContractInput,
  UpdateContractInput,
} from "../types/rateContract.types";

const iso = (d: Date | null) => (d ? d.toISOString() : null);

const addDays = (day: string, days: number) => {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Stored status, or "expired" for an active contract past its valid-to (BR-RFQ-47). */
function effectiveStatus(
  status: "draft" | "active" | "terminated" | "cancelled",
  validTo: string,
  today: string,
) {
  return status === "active" && validTo < today ? "expired" : status;
}

type ContractBody = CreateContractInput | UpdateContractInput;
type CheckedBody<T extends ContractBody> = T & {
  validFrom: string;
  validTo: string;
};

// BR-RFQ-40, 41, 74: everything the schema leaves to the service so it can carry its code.
function assertContractShape<T extends ContractBody>(
  input: T,
): asserts input is CheckedBody<T> {
  if (
    input.validFrom === undefined ||
    input.validTo === undefined ||
    !isRealDay(input.validFrom) ||
    !isRealDay(input.validTo) ||
    input.validTo < input.validFrom
  ) {
    throw new BadRequestError(
      "Valid-to must be on or after valid-from",
      "CONTRACT_DATES_INVALID",
    );
  }
  const seen = new Set<number>();
  for (const line of input.lines) {
    if (seen.has(line.itemId)) {
      throw new BadRequestError(
        `Item ${line.itemId} is on the contract twice`,
        "CONTRACT_LINE_INVALID",
      );
    }
    seen.add(line.itemId);
    if (line.ratePaise < 1) {
      throw new BadRequestError(
        "A rate of at least 1 paise is required",
        "CONTRACT_LINE_INVALID",
      );
    }
    if (!isGstSlab(line.gstPercent)) {
      throw new BadRequestError(
        "GST % is not an allowed rate",
        "CONTRACT_LINE_INVALID",
      );
    }
    const qty = line.agreedQty;
    if (qty !== null && qty !== undefined) {
      if (
        !Number.isFinite(qty) ||
        qty <= 0 ||
        qty > 1e9 ||
        Math.abs(qty * 1000 - Math.round(qty * 1000)) > 1e-6
      ) {
        throw new BadRequestError(
          "Agreed quantity must be above 0, at most 1,000,000,000, with at most 3 decimals",
          "CONTRACT_LINE_INVALID",
        );
      }
    }
  }
  for (const line of input.lines) {
    assertMoneyInRange(line.ratePaise);
    if (line.agreedQty !== null && line.agreedQty !== undefined) {
      assertMoneyInRange(Math.round(line.agreedQty * line.ratePaise));
    }
  }
}

async function assertSupplierAndItems(input: ContractBody, tx: DbExecutor) {
  const supplier = await rateContractRepository.findSupplier(
    input.supplierId,
    tx,
  );
  if (!supplier) throw new NotFoundError("Supplier not found");
  if (!supplier.isActive) {
    throw new BadRequestError("Supplier is inactive", "SUPPLIER_INACTIVE");
  }
  const items = await rateContractRepository.findItemsByIds(
    input.lines.map((l) => l.itemId),
    tx,
  );
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const line of input.lines) {
    const item = byId.get(line.itemId);
    if (!item) throw new NotFoundError(`Item ${line.itemId} not found`);
    if (!item.isActive) {
      throw new BadRequestError(
        `Item ${line.itemId} is inactive`,
        "CONTRACT_LINE_INVALID",
      );
    }
  }
  return byId;
}

async function buildDetails(id: number, executor: DbExecutor) {
  const header = await rateContractRepository.header(id, executor);
  if (!header) throw new NotFoundError("Rate contract not found");
  const [lines, pos] = await Promise.all([
    rateContractRepository.lines(id, executor),
    rateContractRepository.pos(id, executor),
  ]);
  const fulfilment = await rateContractRepository.fulfilmentByLine(
    executor,
    lines.map((l) => l.id),
  );
  const today = istDayKey();
  return {
    id: header.id,
    contractNumber: header.contractNumber,
    supplierId: header.supplierId,
    supplierName: header.supplierName,
    status: header.status,
    effectiveStatus: effectiveStatus(header.status, header.validTo, today),
    validFrom: header.validFrom,
    validTo: header.validTo,
    allowancePercent: header.allowancePercent,
    notes: header.notes,
    createdBy: header.createdBy,
    createdByName: header.createdByName,
    createdAt: header.createdAt.toISOString(),
    lastUpdatedAt: iso(header.lastUpdatedAt),
    activatedByName: header.activatedByName,
    activatedAt: iso(header.activatedAt),
    terminatedOn: header.terminatedOn,
    terminatedByName: header.terminatedByName,
    terminatedAt: iso(header.terminatedAt),
    terminateReason: header.terminateReason,
    cancelledByName: header.cancelledByName,
    cancelledAt: iso(header.cancelledAt),
    cancelReason: header.cancelReason,
    lines: lines.map((line) => {
      const f = fulfilment.get(line.id);
      const ordered = round3(f?.ordered ?? 0);
      return {
        id: line.id,
        itemId: line.itemId,
        itemCode: line.itemCode,
        itemName: line.itemName,
        uom: line.uom,
        ratePaise: line.ratePaise,
        gstPercent: line.gstPercent,
        agreedQty: line.agreedQty,
        orderedQty: ordered,
        receivedQty: round3(f?.received ?? 0),
        percentOrdered: percentOf(ordered, line.agreedQty),
        capQty:
          line.agreedQty === null
            ? null
            : contractCapQty(line.agreedQty, header.allowancePercent),
      };
    }),
    pos: pos.map((p) => ({
      poId: p.poId,
      poNumber: p.poNumber,
      prId: p.prId === null ? null : Number(p.prId),
      status: p.status,
      lineCount: Number(p.lineCount),
    })),
  };
}

async function loadForChange(id: number, tx: DbTransaction) {
  const row = await rateContractRepository.lockById(id, tx);
  if (!row) throw new NotFoundError("Rate contract not found");
  return row;
}

/**
 * BR-RFQ-52, 54: for these PO lines on contract lines, lock the contract lines
 * (id asc), then check the contract is still usable today (when `checkActive`)
 * and that ordered + this PO's qty stays within agreed x (1 + allowance).
 * Rate-only lines have no cap. Called at PO create, update, submit and the
 * last-level approve; `poId` leaves the PO itself out of "ordered".
 */
export async function assertContractLines(
  tx: DbTransaction,
  lines: { contractItemId: number; qty: number }[],
  opts: { checkActive: boolean; poId?: number },
) {
  if (lines.length === 0) return;
  const qtyByLine = new Map<number, number>();
  for (const l of lines) {
    qtyByLine.set(
      l.contractItemId,
      (qtyByLine.get(l.contractItemId) ?? 0) + l.qty,
    );
  }
  const today = istDayKey();
  const locked = await rateContractRepository.lockLinesForCap(
    [...qtyByLine.keys()],
    tx,
    opts.poId,
  );
  for (const row of locked) {
    if (opts.checkActive) {
      const end = row.terminatedOn ?? row.validTo;
      const usable =
        (row.status === "active" || row.status === "terminated") &&
        row.validFrom <= today &&
        end >= today;
      if (!usable) {
        throw new AppError(
          `Rate contract ${row.contractNumber} is no longer active; re-price the line`,
          409,
          "CONTRACT_NOT_ACTIVE",
          { contractNumber: row.contractNumber },
        );
      }
    }
    if (row.agreedQty === null) continue;
    const cap = contractCapQty(row.agreedQty, row.allowancePercent);
    const ordered = round3(row.orderedQty);
    const wanted = qtyByLine.get(row.id) ?? 0;
    if (round3(ordered + wanted) > cap) {
      throw new AppError(
        `Order would pass the quantity allowed on contract ${row.contractNumber}`,
        409,
        "CONTRACT_QTY_EXCEEDED",
        {
          contractNumber: row.contractNumber,
          agreed: row.agreedQty,
          ordered,
          cap,
        },
      );
    }
  }
}

export const rateContractService = {
  assertContractLines,

  // Approval submit (BR-RFQ-52, 54): a PO's linked contracts must still be usable and in cap.
  async assertPoContractsForSubmit(tx: DbTransaction, poId: number) {
    const lines = await rateContractRepository.contractLinesOfPo(poId, tx);
    await assertContractLines(
      tx,
      lines.flatMap((l) =>
        l.contractItemId === null
          ? []
          : [{ contractItemId: l.contractItemId, qty: l.qty }],
      ),
      { checkActive: true, poId },
    );
  },

  // Last-level approve (BR-RFQ-52, 72): cap re-check under the contract-line lock.
  async assertPoContractsForApprove(tx: DbTransaction, poId: number) {
    const lines = await rateContractRepository.contractLinesOfPo(poId, tx);
    await assertContractLines(
      tx,
      lines.flatMap((l) =>
        l.contractItemId === null
          ? []
          : [{ contractItemId: l.contractItemId, qty: l.qty }],
      ),
      { checkActive: false, poId },
    );
  },

  // Award (BR-RFQ-72): lock the contract lines the award POs will use, id asc, before
  // any PO number is allocated, so two awards never wait on each other in a cycle.
  async lockUsableContractLines(
    tx: DbTransaction,
    supplierId: number,
    itemIds: number[],
  ) {
    const choices = await findRateChoices(tx, supplierId, itemIds, {
      onDate: istDayKey(),
      includeContract: true,
      includeFallback: false,
    });
    const ids = [...choices.values()].flatMap((c) =>
      c.contractItemId === undefined ? [] : [c.contractItemId],
    );
    await rateContractRepository.lockLinesForCap(ids, tx);
  },

  async list(params: ContractListQuery) {
    const today = istDayKey();
    const endsBefore =
      params.endsWithinDays !== undefined
        ? addDays(today, params.endsWithinDays)
        : null;
    const { rows, total } = await rateContractRepository.list(
      params,
      today,
      endsBefore,
    );
    const lines = await rateContractRepository.lineSummaries(
      rows.map((r) => r.id),
    );
    const fulfilment = await rateContractRepository.fulfilmentByLine(
      db,
      lines.map((l) => l.id),
    );
    const data = rows.map((row) => {
      const own = lines.filter((l) => l.contractId === row.id);
      const withQty = own.filter((l) => l.agreedQty !== null);
      const agreed = withQty.reduce((s, l) => s + (l.agreedQty ?? 0), 0);
      const ordered = withQty.reduce(
        (s, l) => s + (fulfilment.get(l.id)?.ordered ?? 0),
        0,
      );
      return {
        id: row.id,
        contractNumber: row.contractNumber,
        supplierId: row.supplierId,
        supplierName: row.supplierName,
        status: row.status,
        effectiveStatus: effectiveStatus(row.status, row.validTo, today),
        validFrom: row.validFrom,
        validTo: row.validTo,
        createdByName: row.createdByName,
        itemCount: own.length,
        orderedPercent:
          withQty.length === 0 ? null : percentOf(ordered, agreed),
        createdAt: row.createdAt.toISOString(),
      };
    });
    return {
      data,
      meta: {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
      },
    };
  },

  async getDetails(id: number) {
    return buildDetails(id, db);
  },

  // BR-RFQ-40..43
  async create(input: CreateContractInput, actorId: number) {
    assertContractShape(input);
    return db.transaction(async (tx) => {
      const itemById = await assertSupplierAndItems(input, tx);
      const { periodKey, seq } = await allocateDocumentSequence(
        tx,
        "rate_contract",
        actorId,
        new Date(),
        istMonthKey(),
      );
      const created = await rateContractRepository.insertContract(
        {
          contractNumber: `RC-${periodKey}-${seq}`,
          supplierId: input.supplierId,
          status: "draft",
          validFrom: input.validFrom,
          validTo: input.validTo,
          allowancePercent: input.allowancePercent ?? 0,
          notes: input.notes ? input.notes : null,
          createdBy: actorId,
        },
        tx,
      );
      if (!created) {
        throw new AppError(
          "Failed to create rate contract",
          500,
          "CONTRACT_CREATE_FAILED",
        );
      }
      await rateContractRepository.insertLines(
        input.lines.map((l) => ({
          contractId: created.id,
          itemId: l.itemId,
          uom: itemById.get(l.itemId)?.uom ?? "",
          ratePaise: l.ratePaise,
          gstPercent: l.gstPercent,
          agreedQty: l.agreedQty ?? null,
        })),
        tx,
      );
      return buildDetails(created.id, tx);
    });
  },

  // BR-RFQ-44: draft only, re-read under the row lock (BR-RFQ-72); full replace.
  async update(input: UpdateContractInput, actorId: number) {
    assertContractShape(input);
    return db.transaction(async (tx) => {
      const current = await loadForChange(input.id, tx);
      if (current.status !== "draft") {
        throw new ConflictError(
          "Only a draft contract can be edited",
          "CONTRACT_NOT_EDITABLE",
        );
      }
      const itemById = await assertSupplierAndItems(input, tx);
      await rateContractRepository.updateContract(
        input.id,
        {
          supplierId: input.supplierId,
          validFrom: input.validFrom,
          validTo: input.validTo,
          allowancePercent: input.allowancePercent ?? 0,
          notes: input.notes ? input.notes : null,
          lastUpdatedBy: actorId,
          lastUpdatedAt: new Date(),
        },
        tx,
      );
      await rateContractRepository.deleteLines(input.id, tx);
      await rateContractRepository.insertLines(
        input.lines.map((l) => ({
          contractId: input.id,
          itemId: l.itemId,
          uom: itemById.get(l.itemId)?.uom ?? "",
          ratePaise: l.ratePaise,
          gstPercent: l.gstPercent,
          agreedQty: l.agreedQty ?? null,
        })),
        tx,
      );
      return buildDetails(input.id, tx);
    });
  },

  // BR-RFQ-45, 46: draft -> active; overlap checked under a per-supplier advisory lock.
  async activate(id: number, actorId: number) {
    const pre = await rateContractRepository.header(id);
    if (!pre) throw new NotFoundError("Rate contract not found");
    return db.transaction(async (tx) => {
      await rateContractRepository.lockSupplierForActivation(
        pre.supplierId,
        tx,
      );
      const current = await loadForChange(id, tx);
      if (current.status !== "draft") {
        throw new ConflictError(
          `A contract in status ${current.status} cannot be activated`,
          "CONTRACT_INVALID_STATUS",
        );
      }
      if (current.validTo < istDayKey()) {
        throw new BadRequestError(
          "Valid-to is already past; edit the dates first",
          "CONTRACT_DATES_INVALID",
        );
      }
      const clash = await rateContractRepository.findOverlap(
        {
          contractId: id,
          supplierId: current.supplierId,
          validFrom: current.validFrom,
          validTo: current.validTo,
        },
        tx,
      );
      if (clash) {
        throw new AppError(
          `Contract ${clash.contractNumber} already covers this supplier and item on overlapping dates`,
          409,
          "CONTRACT_OVERLAP",
          { contractNumber: clash.contractNumber },
        );
      }
      await rateContractRepository.updateContract(
        id,
        {
          status: "active",
          activatedBy: actorId,
          activatedAt: new Date(),
          lastUpdatedBy: actorId,
          lastUpdatedAt: new Date(),
        },
        tx,
      );
      return buildDetails(id, tx);
    });
  },

  // BR-RFQ-48: active and not expired; terminated-on today..valid-to (default today).
  async terminate(id: number, input: TerminateContractInput, actorId: number) {
    return db.transaction(async (tx) => {
      const current = await loadForChange(id, tx);
      const today = istDayKey();
      if (current.status !== "active" || current.validTo < today) {
        throw new ConflictError(
          "Only an active, not expired contract can be terminated",
          "CONTRACT_INVALID_STATUS",
        );
      }
      const terminatedOn = input.terminatedOn ?? today;
      if (
        !isRealDay(terminatedOn) ||
        terminatedOn < today ||
        terminatedOn > current.validTo
      ) {
        throw new BadRequestError(
          "Termination date must be from today up to valid-to",
          "CONTRACT_DATES_INVALID",
        );
      }
      await rateContractRepository.updateContract(
        id,
        {
          status: "terminated",
          terminatedOn,
          terminatedBy: actorId,
          terminatedAt: new Date(),
          terminateReason: input.reason,
          lastUpdatedBy: actorId,
          lastUpdatedAt: new Date(),
        },
        tx,
      );
      return buildDetails(id, tx);
    });
  },

  // BR-RFQ-44: draft only, with a reason.
  async cancel(id: number, reason: string, actorId: number) {
    return db.transaction(async (tx) => {
      const current = await loadForChange(id, tx);
      if (current.status !== "draft") {
        throw new ConflictError(
          "Only a draft contract can be cancelled",
          "CONTRACT_NOT_EDITABLE",
        );
      }
      await rateContractRepository.updateContract(
        id,
        {
          status: "cancelled",
          cancelledBy: actorId,
          cancelledAt: new Date(),
          cancelReason: reason,
          lastUpdatedBy: actorId,
          lastUpdatedAt: new Date(),
        },
        tx,
      );
      return buildDetails(id, tx);
    });
  },
};
