import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  getTableColumns,
  gte,
  inArray,
  lt,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "../db/client";
import {
  inventoryLedger,
  itemMaster,
  locations,
  stockTransferItems,
  stockTransfers,
} from "../db/schemas/02_procurement-catalog";
import { employees } from "../db/schemas/03_hcm";
import { allocateDocumentSequence } from "../lib/document-number";
import {
  istDayKey,
  istDayStartInstant,
  istNextDayStartInstant,
} from "../lib/ist-day";
import type { StockTransferListQuery } from "../types/stockTransfer.types";
import type { DbExecutor, DbTransaction } from "./executor";

export type Tx = DbTransaction;
export type StockTransferRow = typeof stockTransfers.$inferSelect;
type HeaderUpdate = Partial<typeof stockTransfers.$inferInsert>;

const sourceLoc = alias(locations, "source_loc");
const destinationLoc = alias(locations, "destination_loc");

const sortColumns = {
  createdAt: stockTransfers.createdAt,
  transferNumber: stockTransfers.transferNumber,
  status: stockTransfers.status,
  postedAt: stockTransfers.postedAt,
} as const;

export const stockTransferRepository = {
  transaction<T>(fn: (tx: Tx) => Promise<T>) {
    return db.transaction(fn);
  },

  // BR-STR-27, CR-002. `sortBy` / `sortDir` arrive resolved by the service.
  async list(
    query: StockTransferListQuery,
    sortBy: keyof typeof sortColumns,
    sortDir: "asc" | "desc",
  ) {
    const where = and(
      query.status ? eq(stockTransfers.status, query.status) : undefined,
      query.sourceLocationId !== undefined
        ? eq(stockTransfers.sourceLocationId, query.sourceLocationId)
        : undefined,
      query.destinationLocationId !== undefined
        ? eq(stockTransfers.destinationLocationId, query.destinationLocationId)
        : undefined,
      query.itemId !== undefined
        ? exists(
            db
              .select({ one: sql`1` })
              .from(stockTransferItems)
              .where(
                and(
                  eq(stockTransferItems.transferId, stockTransfers.id),
                  eq(stockTransferItems.itemId, query.itemId),
                ),
              ),
          )
        : undefined,
      query.fromDate
        ? gte(
            stockTransfers.createdAt,
            istDayStartInstant(new Date(`${query.fromDate}T00:00:00.000Z`)),
          )
        : undefined,
      query.toDate
        ? lt(
            stockTransfers.createdAt,
            istNextDayStartInstant(new Date(`${query.toDate}T00:00:00.000Z`)),
          )
        : undefined,
    );
    const orderFn = sortDir === "desc" ? desc : asc;

    const [rows, [totalRow]] = await Promise.all([
      db
        .select({
          id: stockTransfers.id,
          transferNumber: stockTransfers.transferNumber,
          status: stockTransfers.status,
          sourceName: sourceLoc.name,
          destinationName: destinationLoc.name,
          lineCount: sql<number>`(select count(*)::int from ${stockTransferItems} where ${stockTransferItems.transferId} = ${stockTransfers.id})`,
          createdAt: stockTransfers.createdAt,
          postedAt: stockTransfers.postedAt,
        })
        .from(stockTransfers)
        .innerJoin(sourceLoc, eq(sourceLoc.id, stockTransfers.sourceLocationId))
        .innerJoin(
          destinationLoc,
          eq(destinationLoc.id, stockTransfers.destinationLocationId),
        )
        .where(where)
        .orderBy(orderFn(sortColumns[sortBy]), orderFn(stockTransfers.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      db.select({ value: count() }).from(stockTransfers).where(where),
    ]);
    return { rows, total: totalRow?.value ?? 0 };
  },

  async findById(id: number, executor: DbExecutor = db) {
    const [row] = await executor
      .select()
      .from(stockTransfers)
      .where(eq(stockTransfers.id, id))
      .limit(1);
    return row;
  },

  // Header row lock: every edit, cancel, post and reverse starts here (BR-STR-09, 17, 24).
  async lockById(id: number, tx: Tx) {
    const [row] = await tx
      .select(getTableColumns(stockTransfers))
      .from(stockTransfers)
      .where(eq(stockTransfers.id, id))
      .for("update");
    return row;
  },

  // Locations by id; with `lock`, share-locked in ascending id order so a
  // deactivation or type change waits until this transaction ends.
  async findLocations(ids: number[], executor: DbExecutor = db, lock = false) {
    const query = executor
      .select({
        id: locations.id,
        name: locations.name,
        type: locations.type,
        isActive: locations.isActive,
      })
      .from(locations)
      .where(inArray(locations.id, ids))
      .orderBy(asc(locations.id));
    return lock ? query.for("share") : query;
  },

  // Items by id in ascending id order; with `lock`, row-locked in that order.
  async findItems(ids: number[], executor: DbExecutor, lock = false) {
    const query = executor
      .select({
        id: itemMaster.id,
        sku: itemMaster.sku,
        name: itemMaster.name,
        uom: itemMaster.uom,
        isActive: itemMaster.isActive,
        averageCostPaise: itemMaster.averageCostPaise,
      })
      .from(itemMaster)
      .where(inArray(itemMaster.id, ids))
      .orderBy(asc(itemMaster.id));
    return lock ? query.for("update") : query;
  },

  // One batch query: the last balance_after per item at one location (PERF-01).
  async balancesAt(
    locationId: number,
    itemIds: number[],
    executor: DbExecutor = db,
  ) {
    if (itemIds.length === 0) {
      return new Map<number, number>();
    }
    const rows = await executor
      .selectDistinctOn([inventoryLedger.itemId], {
        itemId: inventoryLedger.itemId,
        balanceAfter: inventoryLedger.balanceAfter,
      })
      .from(inventoryLedger)
      .where(
        and(
          eq(inventoryLedger.locationId, locationId),
          inArray(inventoryLedger.itemId, itemIds),
        ),
      )
      .orderBy(inventoryLedger.itemId, desc(inventoryLedger.id));
    return new Map(rows.map((r) => [r.itemId, r.balanceAfter]));
  },

  async findLines(transferId: number, executor: DbExecutor = db) {
    return executor
      .select({
        lineId: stockTransferItems.id,
        itemId: stockTransferItems.itemId,
        sku: itemMaster.sku,
        name: itemMaster.name,
        unit: itemMaster.uom,
        qty: stockTransferItems.qty,
        postedUnitCostPaise: stockTransferItems.postedUnitCostPaise,
        postedValuePaise: stockTransferItems.postedValuePaise,
      })
      .from(stockTransferItems)
      .innerJoin(itemMaster, eq(itemMaster.id, stockTransferItems.itemId))
      .where(eq(stockTransferItems.transferId, transferId))
      .orderBy(asc(stockTransferItems.id));
  },

  async findLedgerRows(lineIds: number[], executor: DbExecutor = db) {
    if (lineIds.length === 0) {
      return [];
    }
    return executor
      .select({
        id: inventoryLedger.id,
        transactionType: inventoryLedger.transactionType,
        referenceType: inventoryLedger.referenceType,
        locationId: inventoryLedger.locationId,
        quantityChange: inventoryLedger.quantityChange,
        unitCostPaise: inventoryLedger.unitCostPaise,
        totalValueChangePaise: inventoryLedger.totalValueChangePaise,
        createdAt: inventoryLedger.createdAt,
      })
      .from(inventoryLedger)
      .where(
        and(
          inArray(inventoryLedger.referenceLineId, lineIds),
          inArray(inventoryLedger.referenceType, [
            "stock_transfer",
            "stock_transfer_reversal",
          ]),
        ),
      )
      .orderBy(asc(inventoryLedger.id));
  },

  async findEmployeeNames(ids: number[]) {
    if (ids.length === 0) {
      return new Map<number, string>();
    }
    const rows = await db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(inArray(employees.id, ids));
    return new Map(rows.map((r) => [r.id, r.name]));
  },

  // BR-STR-08: ST-<IST year>-<seq>, the counter period is the IST year (A-02).
  async insertTransfer(
    data: Omit<typeof stockTransfers.$inferInsert, "transferNumber">,
    lines: { itemId: number; qty: number }[],
    tx: Tx,
  ) {
    const year = istDayKey().slice(0, 4);
    const { seq } = await allocateDocumentSequence(
      tx,
      "stock_transfer",
      data.createdBy,
      new Date(),
      year,
    );
    const transferNumber = `ST-${year}-${String(seq).padStart(4, "0")}`;
    const [row] = await tx
      .insert(stockTransfers)
      .values({ ...data, transferNumber })
      .returning({
        id: stockTransfers.id,
        transferNumber: stockTransfers.transferNumber,
        status: stockTransfers.status,
      });
    if (!row) {
      throw new Error("Stock transfer insert returned no row");
    }
    await tx
      .insert(stockTransferItems)
      .values(lines.map((line) => ({ ...line, transferId: row.id })));
    return row;
  },

  async updateHeader(id: number, data: HeaderUpdate, tx: Tx) {
    await tx.update(stockTransfers).set(data).where(eq(stockTransfers.id, id));
  },

  // A draft edit replaces all lines inside one transaction (the only delete).
  async replaceLines(
    transferId: number,
    lines: { itemId: number; qty: number }[],
    tx: Tx,
  ) {
    await tx
      .delete(stockTransferItems)
      .where(eq(stockTransferItems.transferId, transferId));
    await tx
      .insert(stockTransferItems)
      .values(lines.map((line) => ({ ...line, transferId })));
  },

  // One UPDATE ... FROM (VALUES ...) for all lines (PERF-03).
  async setLinesPostedCost(
    rows: { lineId: number; unitCostPaise: number; valuePaise: number }[],
    tx: Tx,
  ) {
    if (rows.length === 0) {
      return;
    }
    const values = sql.join(
      rows.map(
        (r) =>
          sql`(${r.lineId}::int, ${r.unitCostPaise}::bigint, ${r.valuePaise}::bigint)`,
      ),
      sql`, `,
    );
    await tx.execute(sql`
      update stock_transfer_items as sti
      set posted_unit_cost_paise = v.unit_cost, posted_value_paise = v.value
      from (values ${values}) as v(id, unit_cost, value)
      where sti.id = v.id
    `);
  },
};
