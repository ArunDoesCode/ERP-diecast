import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  inArray,
  ne,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "../db/client";
import { itemMaster } from "../db/schemas/02_procurement-catalog";
import {
  prPoItemLinks,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
} from "../db/schemas/02_procurement-purchasing";
import {
  rateContractItems,
  rateContracts,
} from "../db/schemas/02_procurement-rfq";
import { supplierMaster } from "../db/schemas/02_procurement-suppliers";
import { employees } from "../db/schemas/03_hcm";
import { RFQ_CONTRACT_LOCK_NS } from "../lib/advisory-locks";
import { safeSearch } from "../lib/safe-search";
import type { ContractListQuery } from "../types/rateContract.types";
import type { DbExecutor, DbTransaction } from "./executor";
import { APPROVED_OR_LATER_PO_STATUSES } from "./rateChainRepository";

type ContractInsert = typeof rateContracts.$inferInsert;
type ContractLineInsert = typeof rateContractItems.$inferInsert;

const creator = alias(employees, "rc_creator");
const activator = alias(employees, "rc_activator");
const terminator = alias(employees, "rc_terminator");
const canceller = alias(employees, "rc_canceller");

const sortColumns = {
  id: rateContracts.id,
  contractNumber: rateContracts.contractNumber,
  validFrom: rateContracts.validFrom,
  validTo: rateContracts.validTo,
  createdAt: rateContracts.createdAt,
  status: rateContracts.status,
} as const;

/** Ordered and received qty per contract line (BR-RFQ-49, 53): POs approved or later. */
async function fulfilmentByLine(
  executor: DbExecutor,
  contractItemIds: number[],
  excludePoId?: number,
) {
  const result = new Map<number, { ordered: number; received: number }>();
  if (contractItemIds.length === 0) return result;
  const rows = await executor
    .select({
      contractItemId: purchaseOrderItems.contractItemId,
      ordered: sql<number>`coalesce(sum(${purchaseOrderItems.qty}), 0)`.mapWith(
        Number,
      ),
      received:
        sql<number>`coalesce(sum(coalesce(${purchaseOrderItems.receivedQty}, 0)), 0)`.mapWith(
          Number,
        ),
    })
    .from(purchaseOrderItems)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderItems.poId))
    .where(
      and(
        inArray(purchaseOrderItems.contractItemId, contractItemIds),
        inArray(purchaseOrders.status, [...APPROVED_OR_LATER_PO_STATUSES]),
        excludePoId !== undefined
          ? ne(purchaseOrders.id, excludePoId)
          : undefined,
      ),
    )
    .groupBy(purchaseOrderItems.contractItemId);
  for (const row of rows) {
    if (row.contractItemId !== null) {
      result.set(row.contractItemId, {
        ordered: row.ordered,
        received: row.received,
      });
    }
  }
  return result;
}

export const rateContractRepository = {
  fulfilmentByLine,

  async findSupplier(supplierId: number, executor: DbExecutor = db) {
    const [row] = await executor
      .select({ id: supplierMaster.id, isActive: supplierMaster.isActive })
      .from(supplierMaster)
      .where(eq(supplierMaster.id, supplierId))
      .limit(1);
    return row;
  },

  async findItemsByIds(itemIds: number[], executor: DbExecutor = db) {
    if (itemIds.length === 0) return [];
    return executor
      .select({
        id: itemMaster.id,
        uom: itemMaster.uom,
        isActive: itemMaster.isActive,
      })
      .from(itemMaster)
      .where(inArray(itemMaster.id, itemIds));
  },

  async lockById(id: number, tx: DbTransaction) {
    const [row] = await tx
      .select(getTableColumns(rateContracts))
      .from(rateContracts)
      .where(eq(rateContracts.id, id))
      .for("update");
    return row;
  },

  // BR-RFQ-46: one activation per supplier at a time (two-key advisory lock).
  async lockSupplierForActivation(supplierId: number, tx: DbTransaction) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${RFQ_CONTRACT_LOCK_NS}::int, ${supplierId}::int)`,
    );
  },

  async insertContract(data: ContractInsert, tx: DbTransaction) {
    const [row] = await tx
      .insert(rateContracts)
      .values(data)
      .returning({ id: rateContracts.id });
    return row;
  },

  async insertLines(lines: ContractLineInsert[], tx: DbTransaction) {
    if (lines.length === 0) return;
    await tx.insert(rateContractItems).values(lines);
  },

  async deleteLines(contractId: number, tx: DbTransaction) {
    await tx
      .delete(rateContractItems)
      .where(eq(rateContractItems.contractId, contractId));
  },

  async updateContract(
    id: number,
    data: Partial<ContractInsert>,
    tx: DbTransaction,
  ) {
    await tx.update(rateContracts).set(data).where(eq(rateContracts.id, id));
  },

  /** Another active or terminated contract of this supplier sharing an item and dates (BR-RFQ-46). */
  async findOverlap(
    input: {
      contractId: number;
      supplierId: number;
      validFrom: string;
      validTo: string;
    },
    tx: DbTransaction,
  ) {
    const [row] = await tx
      .selectDistinct({ contractNumber: rateContracts.contractNumber })
      .from(rateContracts)
      .innerJoin(
        rateContractItems,
        eq(rateContractItems.contractId, rateContracts.id),
      )
      .where(
        and(
          eq(rateContracts.supplierId, input.supplierId),
          ne(rateContracts.id, input.contractId),
          inArray(rateContracts.status, ["active", "terminated"]),
          sql`${rateContracts.validFrom} <= ${input.validTo}`,
          sql`coalesce(${rateContracts.terminatedOn}, ${rateContracts.validTo}) >= ${input.validFrom}`,
          inArray(
            rateContractItems.itemId,
            sql`(select ${rateContractItems.itemId} from ${rateContractItems} where ${rateContractItems.contractId} = ${input.contractId})`,
          ),
        ),
      )
      .limit(1);
    return row;
  },

  async header(id: number, executor: DbExecutor = db) {
    const [row] = await executor
      .select({
        ...getTableColumns(rateContracts),
        supplierName: supplierMaster.name,
        createdByName: creator.name,
        activatedByName: activator.name,
        terminatedByName: terminator.name,
        cancelledByName: canceller.name,
      })
      .from(rateContracts)
      .innerJoin(
        supplierMaster,
        eq(supplierMaster.id, rateContracts.supplierId),
      )
      .leftJoin(creator, eq(creator.id, rateContracts.createdBy))
      .leftJoin(activator, eq(activator.id, rateContracts.activatedBy))
      .leftJoin(terminator, eq(terminator.id, rateContracts.terminatedBy))
      .leftJoin(canceller, eq(canceller.id, rateContracts.cancelledBy))
      .where(eq(rateContracts.id, id))
      .limit(1);
    return row;
  },

  async lines(contractId: number, executor: DbExecutor = db) {
    return executor
      .select({
        id: rateContractItems.id,
        itemId: rateContractItems.itemId,
        itemCode: itemMaster.sku,
        itemName: itemMaster.name,
        uom: rateContractItems.uom,
        ratePaise: rateContractItems.ratePaise,
        gstPercent: rateContractItems.gstPercent,
        agreedQty: rateContractItems.agreedQty,
      })
      .from(rateContractItems)
      .innerJoin(itemMaster, eq(itemMaster.id, rateContractItems.itemId))
      .where(eq(rateContractItems.contractId, contractId))
      .orderBy(asc(rateContractItems.id));
  },

  /** POs with lines on this contract, with the PR each came from (first link). */
  async pos(contractId: number, executor: DbExecutor = db) {
    return executor
      .select({
        poId: purchaseOrders.id,
        poNumber: purchaseOrders.poNumber,
        status: purchaseOrders.status,
        lineCount: count(),
        prId: sql<number | null>`min(${purchaseRequestItems.prId})`,
      })
      .from(purchaseOrderItems)
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderItems.poId))
      .innerJoin(
        rateContractItems,
        eq(rateContractItems.id, purchaseOrderItems.contractItemId),
      )
      .leftJoin(
        prPoItemLinks,
        eq(prPoItemLinks.poItemId, purchaseOrderItems.id),
      )
      .leftJoin(
        purchaseRequestItems,
        eq(purchaseRequestItems.id, prPoItemLinks.prItemId),
      )
      .where(eq(rateContractItems.contractId, contractId))
      .groupBy(
        purchaseOrders.id,
        purchaseOrders.poNumber,
        purchaseOrders.status,
      )
      .orderBy(desc(purchaseOrders.id));
  },

  async list(
    params: ContractListQuery,
    today: string,
    endsBefore: string | null,
  ) {
    const expired = sql`${rateContracts.validTo} < ${today}`;
    const statusFilter =
      params.status === undefined
        ? undefined
        : params.status === "expired"
          ? and(eq(rateContracts.status, "active"), expired)
          : params.status === "active"
            ? and(eq(rateContracts.status, "active"), sql`not (${expired})`)
            : eq(rateContracts.status, params.status);
    const where = and(
      safeSearch(params.q, rateContracts.contractNumber),
      statusFilter,
      params.supplierId
        ? eq(rateContracts.supplierId, params.supplierId)
        : undefined,
      params.itemId
        ? sql`exists (select 1 from ${rateContractItems} where ${rateContractItems.contractId} = ${rateContracts.id} and ${rateContractItems.itemId} = ${params.itemId})`
        : undefined,
      endsBefore !== null
        ? and(
            eq(rateContracts.status, "active"),
            sql`${rateContracts.validTo} >= ${today}`,
            sql`${rateContracts.validTo} <= ${endsBefore}`,
          )
        : undefined,
    );
    const sortColumn = params.sortBy
      ? sortColumns[params.sortBy]
      : endsBefore !== null
        ? rateContracts.validTo
        : rateContracts.createdAt;
    const dir = params.sortDir ?? (endsBefore !== null ? "asc" : "desc");
    const orderFn = dir === "asc" ? asc : desc;

    const [rows, [totalRow]] = await Promise.all([
      db
        .select({
          id: rateContracts.id,
          contractNumber: rateContracts.contractNumber,
          supplierId: rateContracts.supplierId,
          supplierName: supplierMaster.name,
          status: rateContracts.status,
          validFrom: rateContracts.validFrom,
          validTo: rateContracts.validTo,
          createdAt: rateContracts.createdAt,
          createdByName: creator.name,
        })
        .from(rateContracts)
        .innerJoin(
          supplierMaster,
          eq(supplierMaster.id, rateContracts.supplierId),
        )
        .leftJoin(creator, eq(creator.id, rateContracts.createdBy))
        .where(where)
        .orderBy(orderFn(sortColumn), asc(rateContracts.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db.select({ value: count() }).from(rateContracts).where(where),
    ]);
    return { rows, total: totalRow?.value ?? 0 };
  },

  /** Lines of these contracts (id, agreed qty) for the list's item count and % ordered. */
  async lineSummaries(contractIds: number[]) {
    if (contractIds.length === 0) return [];
    return db
      .select({
        id: rateContractItems.id,
        contractId: rateContractItems.contractId,
        agreedQty: rateContractItems.agreedQty,
      })
      .from(rateContractItems)
      .where(inArray(rateContractItems.contractId, contractIds));
  },

  /** Contract lines behind a PO's lines: line qty, contract line id (BR-RFQ-52, 54). */
  async contractLinesOfPo(poId: number, executor: DbExecutor) {
    return executor
      .select({
        poItemId: purchaseOrderItems.id,
        contractItemId: purchaseOrderItems.contractItemId,
        qty: purchaseOrderItems.qty,
      })
      .from(purchaseOrderItems)
      .where(
        and(
          eq(purchaseOrderItems.poId, poId),
          sql`${purchaseOrderItems.contractItemId} is not null`,
        ),
      )
      .orderBy(asc(purchaseOrderItems.id));
  },

  /**
   * Locks contract lines (id asc, BR-RFQ-72) and returns each with its contract's
   * dates, allowance, agreed qty and the ordered qty at this moment. The lock
   * serialises POs racing for the same contract quantity.
   */
  async lockLinesForCap(
    contractItemIds: number[],
    tx: DbTransaction,
    excludePoId?: number,
  ) {
    const ids = [...new Set(contractItemIds)].sort((a, b) => a - b);
    if (ids.length === 0) return [];
    const rows = await tx
      .select({
        id: rateContractItems.id,
        itemId: rateContractItems.itemId,
        contractId: rateContractItems.contractId,
        contractNumber: rateContracts.contractNumber,
        status: rateContracts.status,
        validFrom: rateContracts.validFrom,
        validTo: rateContracts.validTo,
        terminatedOn: rateContracts.terminatedOn,
        allowancePercent: rateContracts.allowancePercent,
        agreedQty: rateContractItems.agreedQty,
        ratePaise: rateContractItems.ratePaise,
        gstPercent: rateContractItems.gstPercent,
      })
      .from(rateContractItems)
      .innerJoin(
        rateContracts,
        eq(rateContracts.id, rateContractItems.contractId),
      )
      .where(inArray(rateContractItems.id, ids))
      .orderBy(asc(rateContractItems.id))
      .for("update", { of: rateContractItems });
    const fulfilment = await fulfilmentByLine(tx, ids, excludePoId);
    return rows.map((row) => ({
      ...row,
      orderedQty: fulfilment.get(row.id)?.ordered ?? 0,
    }));
  },
};
