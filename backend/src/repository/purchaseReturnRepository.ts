import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  inArray,
  isNotNull,
  lt,
  ne,
  sql,
} from "drizzle-orm";

import { db } from "../db/client";
import {
  inventoryLedger,
  itemMaster,
} from "../db/schemas/02_procurement-catalog";
import {
  grnCorrections,
  grnItems,
  grns,
  purchaseDebitNotes,
  purchaseOrderItems,
  purchaseOrders,
  purchaseReturnEvents,
  purchaseReturnItems,
  purchaseReturns,
  supplierInvoices,
} from "../db/schemas/02_procurement-purchasing";
import { supplierMaster } from "../db/schemas/02_procurement-suppliers";
import { employees } from "../db/schemas/03_hcm";
import { companySettings } from "../db/schemas/04_company";
import { safeSearch } from "../lib/safe-search";
import type {
  AwaitingReturnQuery,
  PurchaseReturnListQuery,
} from "../types/purchaseReturn.types";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Tx | typeof db;

export type PurchaseReturnLineInsert = typeof purchaseReturnItems.$inferInsert;
export type PurchaseReturnHeaderInsert = typeof purchaseReturns.$inferInsert;
export type PurchaseReturnEventInsert =
  typeof purchaseReturnEvents.$inferInsert;
export type PurchaseReturnLineRow = typeof purchaseReturnItems.$inferSelect;
export type PurchaseReturnHeaderRow = typeof purchaseReturns.$inferSelect;

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

// `YYYY-MM-DD` as an IST day: [start, next day start) in UTC instants.
function istDayStart(day: string) {
  return new Date(Date.parse(`${day}T00:00:00Z`) - IST_OFFSET_MS);
}

const sortColumns = {
  id: purchaseReturns.id,
  proNumber: purchaseReturns.proNumber,
  createdAt: purchaseReturns.createdAt,
  status: purchaseReturns.status,
} as const;

// numeric(14,3) sums come back as text; keep them as exact thousandths.
const sumMilli = (value: string | number | null | undefined) =>
  Math.round(Number(value ?? 0) * 1000);

export type ReservedMilli = { rejected: number; accepted: number };

export const purchaseReturnRepository = {
  async withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return db.transaction(fn);
  },

  // ---------- locks (order: GRN header -> PO header -> GRN lines -> PO lines -> items) ----------

  async findHeader(id: number, executor: Executor = db) {
    const [row] = await executor
      .select()
      .from(purchaseReturns)
      .where(eq(purchaseReturns.id, id))
      .limit(1);
    return row;
  },

  async lockHeader(id: number, tx: Tx) {
    const [row] = await tx
      .select()
      .from(purchaseReturns)
      .where(eq(purchaseReturns.id, id))
      .limit(1)
      .for("update");
    return row;
  },

  // GRN lines with their PO line facts, locked FOR UPDATE in ascending id order.
  async lockGrnLines(ids: number[], tx: Tx) {
    if (ids.length === 0) {
      return [];
    }
    return tx
      .select({
        id: grnItems.id,
        grnId: grnItems.grnId,
        poItemId: grnItems.poItemId,
        qaStatus: grnItems.qaStatus,
        isQaBypassed: grnItems.isQaBypassed,
        acceptedQty: grnItems.acceptedQty,
        rejectedQty: grnItems.rejectedQty,
        batchNumber: grnItems.batchNumber,
        itemId: purchaseOrderItems.itemId,
        uom: purchaseOrderItems.uom,
        ratePaise: purchaseOrderItems.unitPricePaise,
        gstPercent: purchaseOrderItems.gstPercent,
      })
      .from(grnItems)
      .innerJoin(
        purchaseOrderItems,
        eq(purchaseOrderItems.id, grnItems.poItemId),
      )
      .where(inArray(grnItems.id, ids))
      .orderBy(asc(grnItems.id))
      .for("update", { of: grnItems });
  },

  // PO lines locked FOR UPDATE in ascending id order (BR-PRT-13).
  async lockPoLines(ids: number[], tx: Tx) {
    if (ids.length === 0) {
      return [];
    }
    return tx
      .select({
        id: purchaseOrderItems.id,
        qty: purchaseOrderItems.qty,
        receivedQty: purchaseOrderItems.receivedQty,
      })
      .from(purchaseOrderItems)
      .where(inArray(purchaseOrderItems.id, ids))
      .orderBy(asc(purchaseOrderItems.id))
      .for("update");
  },

  // ---------- cap reads (from purchase_return_items, never from the posted counters) ----------

  // Sum of return qty on non-cancelled returns (drafts + posted) per GRN line and source.
  async reservedByGrnLine(
    grnItemIds: number[],
    executor: Executor = db,
    excludeProId?: number,
  ) {
    const result = new Map<number, ReservedMilli>();
    if (grnItemIds.length === 0) {
      return result;
    }
    const rows = await executor
      .select({
        grnItemId: purchaseReturnItems.grnItemId,
        source: purchaseReturnItems.source,
        total: sql<string>`coalesce(sum(${purchaseReturnItems.returnQty}), 0)`,
      })
      .from(purchaseReturnItems)
      .innerJoin(
        purchaseReturns,
        eq(purchaseReturns.id, purchaseReturnItems.proId),
      )
      .where(
        and(
          inArray(purchaseReturnItems.grnItemId, grnItemIds),
          ne(purchaseReturns.status, "cancelled"),
          excludeProId !== undefined
            ? ne(purchaseReturns.id, excludeProId)
            : undefined,
        ),
      )
      .groupBy(purchaseReturnItems.grnItemId, purchaseReturnItems.source);
    for (const row of rows) {
      const entry = result.get(row.grnItemId) ?? { rejected: 0, accepted: 0 };
      entry[row.source] = sumMilli(row.total);
      result.set(row.grnItemId, entry);
    }
    return result;
  },

  // Corrections per GRN line, thousandths (accepted cap = accepted - corrections).
  async correctionsMilliByGrnLine(
    grnItemIds: number[],
    executor: Executor = db,
  ) {
    const result = new Map<number, number>();
    if (grnItemIds.length === 0) {
      return result;
    }
    const rows = await executor
      .select({
        grnItemId: grnCorrections.grnItemId,
        total: sql<string>`coalesce(sum(${grnCorrections.qty}), 0)`,
      })
      .from(grnCorrections)
      .where(inArray(grnCorrections.grnItemId, grnItemIds))
      .groupBy(grnCorrections.grnItemId);
    for (const row of rows) {
      result.set(row.grnItemId, sumMilli(row.total));
    }
    return result;
  },

  // Posted counters on the GRN lines (display and the supplier-invoice read, BR-PRT-43).
  async postedCounters(grnItemIds: number[], executor: Executor = db) {
    if (grnItemIds.length === 0) {
      return [];
    }
    return executor
      .select({
        id: grnItems.id,
        rejectedReturned: grnItems.rejectedReturnedQty,
        acceptedReturned: grnItems.acceptedReturnedQty,
      })
      .from(grnItems)
      .where(inArray(grnItems.id, grnItemIds));
  },

  // ---------- writes ----------

  async insertHeader(values: PurchaseReturnHeaderInsert, tx: Tx) {
    const [row] = await tx.insert(purchaseReturns).values(values).returning();
    return row;
  },

  async updateHeader(
    id: number,
    values: Partial<PurchaseReturnHeaderInsert>,
    tx: Tx,
  ) {
    const [row] = await tx
      .update(purchaseReturns)
      .set(values)
      .where(eq(purchaseReturns.id, id))
      .returning();
    return row;
  },

  async insertLines(values: PurchaseReturnLineInsert[], tx: Tx) {
    if (values.length === 0) {
      return [];
    }
    return tx.insert(purchaseReturnItems).values(values).returning();
  },

  async deleteLines(proId: number, tx: Tx) {
    await tx
      .delete(purchaseReturnItems)
      .where(eq(purchaseReturnItems.proId, proId));
  },

  async updateLine(
    id: number,
    values: Partial<PurchaseReturnLineInsert>,
    tx: Tx,
  ) {
    await tx
      .update(purchaseReturnItems)
      .set(values)
      .where(eq(purchaseReturnItems.id, id));
  },

  async insertEvent(values: PurchaseReturnEventInsert, tx: Tx) {
    await tx.insert(purchaseReturnEvents).values(values);
  },

  async insertDebitNote(
    values: typeof purchaseDebitNotes.$inferInsert,
    tx: Tx,
  ) {
    const [row] = await tx
      .insert(purchaseDebitNotes)
      .values(values)
      .returning();
    return row;
  },

  async cancelDebitNote(proId: number, actorId: number, at: Date, tx: Tx) {
    await tx
      .update(purchaseDebitNotes)
      .set({ status: "cancelled", cancelledBy: actorId, cancelledAt: at })
      .where(eq(purchaseDebitNotes.proId, proId));
  },

  // delta may be negative (cancel). Source picks the GRN line counter.
  async addGrnLineReturned(
    grnItemId: number,
    source: "rejected" | "accepted",
    delta: number,
    tx: Tx,
  ) {
    await tx
      .update(grnItems)
      .set(
        source === "rejected"
          ? {
              rejectedReturnedQty: sql`${grnItems.rejectedReturnedQty} + ${delta}`,
            }
          : {
              acceptedReturnedQty: sql`${grnItems.acceptedReturnedQty} + ${delta}`,
            },
      )
      .where(eq(grnItems.id, grnItemId));
  },

  async addPoLineReturned(poItemId: number, delta: number, tx: Tx) {
    await tx
      .update(purchaseOrderItems)
      .set({ returnedQty: sql`${purchaseOrderItems.returnedQty} + ${delta}` })
      .where(eq(purchaseOrderItems.id, poItemId));
  },

  // ---------- reads for post / cancel ----------

  async findLines(proId: number, executor: Executor = db) {
    return executor
      .select()
      .from(purchaseReturnItems)
      .where(eq(purchaseReturnItems.proId, proId))
      .orderBy(asc(purchaseReturnItems.id));
  },

  // Where and at what cost each GRN line was posted: its grn / grn_bypass ledger row (one batched query).
  async findPostedRows(grnItemIds: number[], tx: Tx) {
    const result = new Map<
      number,
      { locationId: number; unitCostPaise: number }
    >();
    if (grnItemIds.length === 0) {
      return result;
    }
    const rows = await tx
      .select({
        grnItemId: inventoryLedger.referenceLineId,
        locationId: inventoryLedger.locationId,
        unitCostPaise: inventoryLedger.unitCostPaise,
      })
      .from(inventoryLedger)
      .where(
        and(
          inArray(inventoryLedger.referenceLineId, grnItemIds),
          inArray(inventoryLedger.referenceType, ["grn", "grn_bypass"]),
        ),
      )
      .orderBy(asc(inventoryLedger.id));
    for (const row of rows) {
      if (row.grnItemId != null && !result.has(row.grnItemId)) {
        result.set(row.grnItemId, {
          locationId: row.locationId,
          unitCostPaise: row.unitCostPaise,
        });
      }
    }
    return result;
  },

  async findItems(ids: number[], executor: Executor) {
    if (ids.length === 0) {
      return [];
    }
    return executor
      .select({
        id: itemMaster.id,
        name: itemMaster.name,
        hsnCode: itemMaster.hsnCode,
      })
      .from(itemMaster)
      .where(inArray(itemMaster.id, ids));
  },

  async findCompanySettings(tx: Tx) {
    const [row] = await tx.select().from(companySettings).limit(1);
    return row;
  },

  async findSupplier(id: number, executor: Executor) {
    const [row] = await executor
      .select({
        id: supplierMaster.id,
        name: supplierMaster.name,
        address: supplierMaster.address,
        gstNumber: supplierMaster.gstNumber,
      })
      .from(supplierMaster)
      .where(eq(supplierMaster.id, id))
      .limit(1);
    return row;
  },

  async findPoStatus(poId: number, executor: Executor) {
    const [row] = await executor
      .select({
        id: purchaseOrders.id,
        poNumber: purchaseOrders.poNumber,
        status: purchaseOrders.status,
      })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, poId))
      .limit(1);
    return row;
  },

  // ---------- prefill ----------

  async findGrnForReturn(grnId: number, executor: Executor = db) {
    const [row] = await executor
      .select({
        id: grns.id,
        grnNumber: grns.grnNumber,
        poId: grns.poId,
        supplierId: grns.supplierId,
        supplierName: supplierMaster.name,
        poNumber: purchaseOrders.poNumber,
      })
      .from(grns)
      .innerJoin(supplierMaster, eq(supplierMaster.id, grns.supplierId))
      .leftJoin(purchaseOrders, eq(purchaseOrders.id, grns.poId))
      .where(eq(grns.id, grnId))
      .limit(1);
    return row;
  },

  // Every line of a GRN with its item and PO line facts (no lock).
  async findGrnLinesForReturn(grnId: number, executor: Executor = db) {
    return executor
      .select({
        id: grnItems.id,
        qaStatus: grnItems.qaStatus,
        isQaBypassed: grnItems.isQaBypassed,
        acceptedQty: grnItems.acceptedQty,
        rejectedQty: grnItems.rejectedQty,
        batchNumber: grnItems.batchNumber,
        itemId: purchaseOrderItems.itemId,
        itemName: itemMaster.name,
        uom: purchaseOrderItems.uom,
        ratePaise: purchaseOrderItems.unitPricePaise,
        gstPercent: purchaseOrderItems.gstPercent,
      })
      .from(grnItems)
      .innerJoin(
        purchaseOrderItems,
        eq(purchaseOrderItems.id, grnItems.poItemId),
      )
      .innerJoin(itemMaster, eq(itemMaster.id, purchaseOrderItems.itemId))
      .where(eq(grnItems.grnId, grnId))
      .orderBy(asc(grnItems.id));
  },

  // ---------- list ----------

  async list(params: PurchaseReturnListQuery) {
    const baseFilters = [
      safeSearch(params.q, purchaseReturns.proNumber),
      params.supplierId !== undefined
        ? eq(purchaseReturns.supplierId, params.supplierId)
        : undefined,
      params.grnId !== undefined
        ? eq(purchaseReturns.grnId, params.grnId)
        : undefined,
      params.poId !== undefined
        ? eq(purchaseReturns.poId, params.poId)
        : undefined,
      // IST day on created_at
      params.dateFrom
        ? gte(purchaseReturns.createdAt, istDayStart(params.dateFrom))
        : undefined,
      params.dateTo
        ? lt(
            purchaseReturns.createdAt,
            new Date(istDayStart(params.dateTo).getTime() + DAY_MS),
          )
        : undefined,
    ].filter((f) => f !== undefined);
    const filters = [
      ...baseFilters,
      params.status ? eq(purchaseReturns.status, params.status) : undefined,
    ].filter((f) => f !== undefined);

    const whereClause = filters.length > 0 ? and(...filters) : undefined;
    const countWhere = baseFilters.length > 0 ? and(...baseFilters) : undefined;
    const sortColumn = sortColumns[params.sortBy];
    const orderFn = params.sortDir === "desc" ? desc : asc;

    const [rows, [totalRow], statusRows] = await Promise.all([
      db
        .select({
          id: purchaseReturns.id,
          proNumber: purchaseReturns.proNumber,
          status: purchaseReturns.status,
          grnNumber: grns.grnNumber,
          poNumber: purchaseOrders.poNumber,
          supplierName: supplierMaster.name,
          totalPaise: purchaseDebitNotes.totalPaise,
          createdAt: purchaseReturns.createdAt,
        })
        .from(purchaseReturns)
        .innerJoin(grns, eq(grns.id, purchaseReturns.grnId))
        .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseReturns.poId))
        .innerJoin(
          supplierMaster,
          eq(supplierMaster.id, purchaseReturns.supplierId),
        )
        .leftJoin(
          purchaseDebitNotes,
          eq(purchaseDebitNotes.proId, purchaseReturns.id),
        )
        .where(whereClause)
        .orderBy(orderFn(sortColumn), asc(purchaseReturns.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db.select({ value: count() }).from(purchaseReturns).where(whereClause),
      db
        .select({ status: purchaseReturns.status, value: count() })
        .from(purchaseReturns)
        .where(countWhere)
        .groupBy(purchaseReturns.status),
    ]);

    // One grouped query for the page's line counts (no per-row query).
    const ids = rows.map((r) => r.id);
    const lineCounts =
      ids.length === 0
        ? []
        : await db
            .select({ proId: purchaseReturnItems.proId, value: count() })
            .from(purchaseReturnItems)
            .where(inArray(purchaseReturnItems.proId, ids))
            .groupBy(purchaseReturnItems.proId);
    const linesByPro = new Map(lineCounts.map((r) => [r.proId, r.value]));

    const statusCounts = { draft: 0, posted: 0, cancelled: 0 };
    for (const row of statusRows) {
      statusCounts[row.status] = row.value;
    }

    return {
      rows: rows.map((r) => ({ ...r, linesCount: linesByPro.get(r.id) ?? 0 })),
      total: totalRow?.value ?? 0,
      statusCounts,
    };
  },

  // ---------- awaiting return ----------

  // Rows, count and awaitingCount share one predicate: rejected qty minus the
  // qty reserved by non-cancelled returns is still > 0.
  async listAwaiting(params: AwaitingReturnQuery) {
    const reserved = db
      .select({
        grnItemId: purchaseReturnItems.grnItemId,
        qty: sql<string>`sum(${purchaseReturnItems.returnQty})`.as(
          "reserved_qty",
        ),
      })
      .from(purchaseReturnItems)
      .innerJoin(
        purchaseReturns,
        eq(purchaseReturns.id, purchaseReturnItems.proId),
      )
      .where(
        and(
          eq(purchaseReturnItems.source, "rejected"),
          ne(purchaseReturns.status, "cancelled"),
        ),
      )
      .groupBy(purchaseReturnItems.grnItemId)
      .as("reserved");

    const reservedQty = sql<string>`coalesce(${reserved.qty}, 0)`;
    const rejectedQty = sql<string>`round(coalesce(${grnItems.rejectedQty}, 0)::numeric, 3)`;
    const predicate = and(
      gt(grnItems.rejectedQty, 0), // partial index idx_grn_items_awaiting_return
      isNotNull(grns.poId),
      sql`${rejectedQty} - ${reservedQty} > 0`,
      params.supplierId !== undefined
        ? eq(grns.supplierId, params.supplierId)
        : undefined,
    );

    const awaitingSortColumns = {
      grnId: grnItems.grnId,
      grnNumber: grns.grnNumber,
      receivedDate: grns.receivedDate,
    } as const;
    const orderFn = params.sortDir === "desc" ? desc : asc;

    const fromJoins = () =>
      db
        .select({
          grnId: grnItems.grnId,
          grnNumber: grns.grnNumber,
          grnItemId: grnItems.id,
          itemId: purchaseOrderItems.itemId,
          itemName: itemMaster.name,
          batchNumber: grnItems.batchNumber,
          rejectedQty: rejectedQty,
          rejectedReserved: reservedQty,
          receivedDate: grns.receivedDate,
          supplierId: grns.supplierId,
          supplierName: supplierMaster.name,
          uom: purchaseOrderItems.uom,
        })
        .from(grnItems)
        .innerJoin(grns, eq(grns.id, grnItems.grnId))
        .innerJoin(
          purchaseOrderItems,
          eq(purchaseOrderItems.id, grnItems.poItemId),
        )
        .innerJoin(itemMaster, eq(itemMaster.id, purchaseOrderItems.itemId))
        .innerJoin(supplierMaster, eq(supplierMaster.id, grns.supplierId))
        .leftJoin(reserved, eq(reserved.grnItemId, grnItems.id));

    const countQuery = () =>
      db
        .select({ value: count() })
        .from(grnItems)
        .innerJoin(grns, eq(grns.id, grnItems.grnId))
        .leftJoin(reserved, eq(reserved.grnItemId, grnItems.id))
        .where(predicate);

    const [rows, [totalRow]] = await Promise.all([
      fromJoins()
        .where(predicate)
        .orderBy(orderFn(awaitingSortColumns[params.sortBy]), asc(grnItems.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      countQuery(),
    ]);
    return { rows, total: totalRow?.value ?? 0 };
  },

  // The header badge: awaiting lines over every supplier.
  async countAwaiting() {
    const reserved = db
      .select({
        grnItemId: purchaseReturnItems.grnItemId,
        qty: sql<string>`sum(${purchaseReturnItems.returnQty})`.as(
          "reserved_qty",
        ),
      })
      .from(purchaseReturnItems)
      .innerJoin(
        purchaseReturns,
        eq(purchaseReturns.id, purchaseReturnItems.proId),
      )
      .where(
        and(
          eq(purchaseReturnItems.source, "rejected"),
          ne(purchaseReturns.status, "cancelled"),
        ),
      )
      .groupBy(purchaseReturnItems.grnItemId)
      .as("reserved");
    const [row] = await db
      .select({ value: count() })
      .from(grnItems)
      .innerJoin(grns, eq(grns.id, grnItems.grnId))
      .leftJoin(reserved, eq(reserved.grnItemId, grnItems.id))
      .where(
        and(
          gt(grnItems.rejectedQty, 0),
          isNotNull(grns.poId),
          sql`round(coalesce(${grnItems.rejectedQty}, 0)::numeric, 3) - coalesce(${reserved.qty}, 0) > 0`,
        ),
      );
    return row?.value ?? 0;
  },

  // ---------- details ----------

  async getDetailsHeader(id: number) {
    const [row] = await db
      .select({
        ...getTableColumns(purchaseReturns),
        grnNumber: grns.grnNumber,
        grnChallanNo: grns.challanNo,
        grnStatus: grns.status,
        poNumber: purchaseOrders.poNumber,
        poStatus: purchaseOrders.status,
        supplierName: supplierMaster.name,
      })
      .from(purchaseReturns)
      .innerJoin(grns, eq(grns.id, purchaseReturns.grnId))
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseReturns.poId))
      .innerJoin(
        supplierMaster,
        eq(supplierMaster.id, purchaseReturns.supplierId),
      )
      .where(eq(purchaseReturns.id, id))
      .limit(1);
    return row;
  },

  async getDetailsLines(proId: number) {
    return db
      .select({
        ...getTableColumns(purchaseReturnItems),
        itemName: itemMaster.name,
        itemHsn: itemMaster.hsnCode,
        grnRejectedQty: grnItems.rejectedQty,
        grnAcceptedQty: grnItems.acceptedQty,
      })
      .from(purchaseReturnItems)
      .innerJoin(itemMaster, eq(itemMaster.id, purchaseReturnItems.itemId))
      .innerJoin(grnItems, eq(grnItems.id, purchaseReturnItems.grnItemId))
      .where(eq(purchaseReturnItems.proId, proId))
      .orderBy(asc(purchaseReturnItems.id));
  },

  async getDebitNote(proId: number) {
    const [row] = await db
      .select({
        ...getTableColumns(purchaseDebitNotes),
        billNumber: supplierInvoices.invoiceNumber,
        billDate: supplierInvoices.invoiceDate,
      })
      .from(purchaseDebitNotes)
      .leftJoin(
        supplierInvoices,
        eq(supplierInvoices.id, purchaseDebitNotes.supplierInvoiceId),
      )
      .where(eq(purchaseDebitNotes.proId, proId))
      .limit(1);
    return row;
  },

  async getEvents(proId: number) {
    return db
      .select({
        id: purchaseReturnEvents.id,
        action: purchaseReturnEvents.action,
        fromStatus: purchaseReturnEvents.fromStatus,
        toStatus: purchaseReturnEvents.toStatus,
        reason: purchaseReturnEvents.reason,
        actorId: purchaseReturnEvents.actorId,
        actorName: employees.name,
        at: purchaseReturnEvents.at,
      })
      .from(purchaseReturnEvents)
      .leftJoin(employees, eq(employees.id, purchaseReturnEvents.actorId))
      .where(eq(purchaseReturnEvents.proId, proId))
      .orderBy(asc(purchaseReturnEvents.id));
  },

  // Returns of a GRN / PO (document flow on their details pages, BR-PRT-38).
  async listReturnsOfGrn(grnId: number, executor: Executor = db) {
    return executor
      .select({
        id: purchaseReturns.id,
        proNumber: purchaseReturns.proNumber,
        status: purchaseReturns.status,
      })
      .from(purchaseReturns)
      .where(eq(purchaseReturns.grnId, grnId))
      .orderBy(asc(purchaseReturns.id));
  },

  async listReturnsOfPo(poId: number, executor: Executor = db) {
    return executor
      .select({
        id: purchaseReturns.id,
        proNumber: purchaseReturns.proNumber,
        status: purchaseReturns.status,
      })
      .from(purchaseReturns)
      .where(eq(purchaseReturns.poId, poId))
      .orderBy(asc(purchaseReturns.id));
  },
};
