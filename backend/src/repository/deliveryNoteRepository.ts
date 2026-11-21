import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  ne,
  type SQL,
  sql,
} from "drizzle-orm";

import { db } from "../db/client";
import {
  inventoryLedger,
  itemMaster,
  locations,
} from "../db/schemas/02_procurement-catalog";
import { employees } from "../db/schemas/03_hcm";
import { companySettings } from "../db/schemas/04_company";
import {
  customers,
  saleOrderLines,
  saleOrders,
  salesAuditLog,
} from "../db/schemas/05_sales";
import {
  deliveryNoteLines,
  deliveryNotePackages,
  deliveryNotes,
  deliveryNoteTransportHistory,
} from "../db/schemas/06_dispatch";
import type { NoteListQuery, PendingListQuery } from "../types/dispatch.types";
import type { DbExecutor, DbTransaction } from "./executor";

export type DeliveryNoteRow = typeof deliveryNotes.$inferSelect;
export type DeliveryNoteInsert = typeof deliveryNotes.$inferInsert;
export type DeliveryNoteLineRow = typeof deliveryNoteLines.$inferSelect;
export type DeliveryNoteLineInsert = typeof deliveryNoteLines.$inferInsert;
export type DeliveryNotePackageRow = typeof deliveryNotePackages.$inferSelect;
export type DeliveryNotePackageInsert =
  typeof deliveryNotePackages.$inferInsert;

const pendingFilters = (
  query: Pick<PendingListQuery, "customerId" | "itemId" | "soId">,
  skip?: "customerId" | "itemId",
) => {
  const filters: SQL[] = [
    eq(saleOrders.status, "confirmed"),
    isNull(saleOrderLines.removedAt),
    sql`${saleOrderLines.deliveredQty} < ${saleOrderLines.qty}`,
  ];
  if (query.customerId !== undefined && skip !== "customerId") {
    filters.push(eq(saleOrders.customerId, query.customerId));
  }
  if (query.itemId !== undefined && skip !== "itemId") {
    filters.push(eq(saleOrderLines.itemId, query.itemId));
  }
  if (query.soId !== undefined) filters.push(eq(saleOrders.id, query.soId));
  return and(...filters);
};

export const deliveryNoteRepository = {
  async withTransaction<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
    return db.transaction(fn);
  },

  // ---------- notes ----------

  async findHeader(id: number, ex: DbExecutor = db) {
    const [row] = await ex
      .select()
      .from(deliveryNotes)
      .where(eq(deliveryNotes.id, id))
      .limit(1);
    return row;
  },

  async lockHeader(id: number, tx: DbExecutor) {
    const [row] = await tx
      .select()
      .from(deliveryNotes)
      .where(eq(deliveryNotes.id, id))
      .for("update");
    return row;
  },

  async insertHeader(values: DeliveryNoteInsert, ex: DbExecutor) {
    const [row] = await ex.insert(deliveryNotes).values(values).returning();
    return row;
  },

  async updateHeader(
    id: number,
    set: Partial<DeliveryNoteInsert>,
    ex: DbExecutor,
  ) {
    await ex.update(deliveryNotes).set(set).where(eq(deliveryNotes.id, id));
  },

  /** A live (non-cancelled) note other than `excludeId` holding this e-way no (BR-DSP-26). */
  async findEwayClash(
    ewayBillNo: string,
    excludeId: number | null,
    ex: DbExecutor = db,
  ) {
    const filters: SQL[] = [
      eq(deliveryNotes.ewayBillNo, ewayBillNo),
      ne(deliveryNotes.status, "cancelled"),
    ];
    if (excludeId !== null) filters.push(ne(deliveryNotes.id, excludeId));
    const [row] = await ex
      .select({ id: deliveryNotes.id })
      .from(deliveryNotes)
      .where(and(...filters))
      .limit(1);
    return row;
  },

  // ---------- lines ----------

  /** Note lines with their item, ascending SO line id. */
  async findLines(noteId: number, ex: DbExecutor = db) {
    return ex
      .select({
        line: deliveryNoteLines,
        sku: itemMaster.sku,
        itemName: itemMaster.name,
        itemHsn: itemMaster.hsnCode,
        itemActive: itemMaster.isActive,
      })
      .from(deliveryNoteLines)
      .innerJoin(itemMaster, eq(itemMaster.id, deliveryNoteLines.itemId))
      .where(eq(deliveryNoteLines.noteId, noteId))
      .orderBy(asc(deliveryNoteLines.soLineId));
  },

  async insertLines(values: DeliveryNoteLineInsert[], ex: DbExecutor) {
    if (values.length === 0) return [];
    return ex.insert(deliveryNoteLines).values(values).returning();
  },

  async updateLine(
    id: number,
    set: Partial<DeliveryNoteLineInsert>,
    ex: DbExecutor,
  ) {
    await ex
      .update(deliveryNoteLines)
      .set(set)
      .where(eq(deliveryNoteLines.id, id));
  },

  async deleteLines(ids: number[], ex: DbExecutor) {
    if (ids.length === 0) return;
    await ex
      .delete(deliveryNoteLines)
      .where(inArray(deliveryNoteLines.id, ids));
  },

  // ---------- packages ----------

  async findPackages(noteId: number, ex: DbExecutor = db) {
    return ex
      .select({
        pkg: deliveryNotePackages,
        soLineId: deliveryNoteLines.soLineId,
      })
      .from(deliveryNotePackages)
      .innerJoin(
        deliveryNoteLines,
        eq(deliveryNoteLines.id, deliveryNotePackages.lineId),
      )
      .where(eq(deliveryNotePackages.noteId, noteId))
      .orderBy(asc(deliveryNotePackages.id));
  },

  async deletePackages(noteId: number, ex: DbExecutor) {
    await ex
      .delete(deliveryNotePackages)
      .where(eq(deliveryNotePackages.noteId, noteId));
  },

  async insertPackages(values: DeliveryNotePackageInsert[], ex: DbExecutor) {
    if (values.length === 0) return;
    await ex.insert(deliveryNotePackages).values(values);
  },

  // ---------- transport history ----------

  async insertHistory(
    rows: (typeof deliveryNoteTransportHistory.$inferInsert)[],
    ex: DbExecutor,
  ) {
    if (rows.length === 0) return;
    await ex.insert(deliveryNoteTransportHistory).values(rows);
  },

  async listHistory(noteId: number, page: number, pageSize: number) {
    const [rows, totals] = await Promise.all([
      db
        .select({
          id: deliveryNoteTransportHistory.id,
          field: deliveryNoteTransportHistory.field,
          oldValue: deliveryNoteTransportHistory.oldValue,
          newValue: deliveryNoteTransportHistory.newValue,
          changedBy: deliveryNoteTransportHistory.changedBy,
          changedByName: employees.name,
          changedAt: deliveryNoteTransportHistory.changedAt,
        })
        .from(deliveryNoteTransportHistory)
        .leftJoin(
          employees,
          eq(employees.id, deliveryNoteTransportHistory.changedBy),
        )
        .where(eq(deliveryNoteTransportHistory.noteId, noteId))
        .orderBy(desc(deliveryNoteTransportHistory.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ total: count() })
        .from(deliveryNoteTransportHistory)
        .where(eq(deliveryNoteTransportHistory.noteId, noteId)),
    ]);
    return { rows, total: totals[0]?.total ?? 0 };
  },

  // ---------- sale order reads (no locks; locks go through saleOrderRepository) ----------

  async findSoHeader(soId: number, ex: DbExecutor = db) {
    const [row] = await ex
      .select()
      .from(saleOrders)
      .where(eq(saleOrders.id, soId))
      .limit(1);
    return row;
  },

  /** Every line of the SO (removed too) with the item facts the note needs. */
  async findSoLines(soId: number, ex: DbExecutor = db) {
    return ex
      .select({
        line: saleOrderLines,
        sku: itemMaster.sku,
        itemName: itemMaster.name,
        itemHsn: itemMaster.hsnCode,
        itemActive: itemMaster.isActive,
      })
      .from(saleOrderLines)
      .innerJoin(itemMaster, eq(itemMaster.id, saleOrderLines.itemId))
      .where(eq(saleOrderLines.soId, soId))
      .orderBy(asc(saleOrderLines.id));
  },

  async findCustomer(id: number, ex: DbExecutor = db) {
    const [row] = await ex
      .select()
      .from(customers)
      .where(eq(customers.id, id))
      .limit(1);
    return row;
  },

  async findCompany(ex: DbExecutor = db) {
    const [row] = await ex
      .select()
      .from(companySettings)
      .where(eq(companySettings.id, 1))
      .limit(1);
    return row;
  },

  // ---------- locations, items, ledger ----------

  async findLocation(id: number, ex: DbExecutor = db) {
    const [row] = await ex
      .select({
        id: locations.id,
        name: locations.name,
        type: locations.type,
        isVirtual: locations.isVirtual,
        isActive: locations.isActive,
      })
      .from(locations)
      .where(eq(locations.id, id))
      .limit(1);
    return row;
  },

  /** BR-DSP-08 default: active finished_goods (lowest id), else the main store. */
  async findDefaultSourceLocationId(ex: DbExecutor = db) {
    const [fg] = await ex
      .select({ id: locations.id })
      .from(locations)
      .where(
        and(
          eq(locations.type, "finished_goods"),
          eq(locations.isActive, true),
          eq(locations.isVirtual, false),
        ),
      )
      .orderBy(asc(locations.id))
      .limit(1);
    if (fg) return fg.id;
    const [main] = await ex
      .select({ id: locations.id })
      .from(locations)
      .where(
        and(
          eq(locations.type, "main_store"),
          eq(locations.isActive, true),
          eq(locations.isVirtual, false),
        ),
      )
      .limit(1);
    return main?.id ?? null;
  },

  /** Lock the item rows, ascending id (PERF-02). */
  async lockItems(ids: number[], tx: DbExecutor) {
    if (ids.length === 0) return;
    await tx
      .select({ id: itemMaster.id })
      .from(itemMaster)
      .where(inArray(itemMaster.id, ids))
      .orderBy(asc(itemMaster.id))
      .for("update");
  },

  async findLedgerRows(ids: number[], ex: DbExecutor = db) {
    if (ids.length === 0) return [];
    return ex
      .select({
        id: inventoryLedger.id,
        unitCostPaise: inventoryLedger.unitCostPaise,
        locationId: inventoryLedger.locationId,
      })
      .from(inventoryLedger)
      .where(inArray(inventoryLedger.id, ids));
  },

  /** Latest balance per item at one location, one query (PERF-01). */
  async stockAtLocation(itemIds: number[], locationId: number) {
    if (itemIds.length === 0) return new Map<number, number>();
    const rows = await db.execute<{ item_id: number; balance_after: number }>(
      sql`select distinct on (item_id) item_id, balance_after
        from ${inventoryLedger}
        where location_id = ${locationId}
          and item_id in (${sql.join(
            itemIds.map((i) => sql`${i}`),
            sql`, `,
          )})
        order by item_id, id desc`,
    );
    return new Map(
      [...rows].map((r) => [Number(r.item_id), Number(r.balance_after)]),
    );
  },

  async findEmployeeNames(ids: number[], ex: DbExecutor = db) {
    if (ids.length === 0) return new Map<number, string>();
    const rows = await ex
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(inArray(employees.id, ids));
    return new Map(rows.map((r) => [r.id, r.name]));
  },

  // ---------- activity ----------

  async listActivity(noteId: number, ex: DbExecutor = db) {
    return ex
      .select({
        at: salesAuditLog.at,
        actorName: employees.name,
        action: salesAuditLog.action,
        reason: sql<string | null>`${salesAuditLog.after} ->> 'reason'`,
      })
      .from(salesAuditLog)
      .leftJoin(employees, eq(employees.id, salesAuditLog.actorId))
      .where(
        and(
          eq(salesAuditLog.targetType, "delivery_note"),
          eq(salesAuditLog.targetId, noteId),
        ),
      )
      .orderBy(desc(salesAuditLog.at), desc(salesAuditLog.id))
      .limit(50);
  },

  // ---------- pending list ----------

  async listPending(
    query: PendingListQuery,
    sort: { by: string; dir: "asc" | "desc" },
  ) {
    const where = pendingFilters(query);
    const openSql = sql`(${saleOrderLines.qty} - ${saleOrderLines.deliveredQty})`;
    const dirFn = sort.dir === "asc" ? asc : desc;
    const sortCol =
      sort.by === "customerName"
        ? customers.name
        : sort.by === "itemSku"
          ? itemMaster.sku
          : sort.by === "openQty"
            ? openSql
            : saleOrders.orderDate;
    const [rows, totals] = await Promise.all([
      db
        .select({
          soId: saleOrders.id,
          soNumber: saleOrders.soNumber,
          soLineId: saleOrderLines.id,
          customerId: customers.id,
          customerName: customers.name,
          itemId: itemMaster.id,
          sku: itemMaster.sku,
          itemName: itemMaster.name,
          uom: saleOrderLines.uom,
          deliveryDate: saleOrderLines.deliveryDate,
          qty: saleOrderLines.qty,
          deliveredQty: saleOrderLines.deliveredQty,
          soDate: saleOrders.orderDate,
        })
        .from(saleOrderLines)
        .innerJoin(saleOrders, eq(saleOrders.id, saleOrderLines.soId))
        .innerJoin(customers, eq(customers.id, saleOrders.customerId))
        .innerJoin(itemMaster, eq(itemMaster.id, saleOrderLines.itemId))
        .where(where)
        .orderBy(dirFn(sortCol), asc(saleOrderLines.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      db
        .select({ total: count() })
        .from(saleOrderLines)
        .innerJoin(saleOrders, eq(saleOrders.id, saleOrderLines.soId))
        .where(where),
    ]);
    return { rows, total: totals[0]?.total ?? 0 };
  },

  async pendingCustomerOptions(query: PendingListQuery) {
    return db
      .selectDistinct({ id: customers.id, name: customers.name })
      .from(saleOrderLines)
      .innerJoin(saleOrders, eq(saleOrders.id, saleOrderLines.soId))
      .innerJoin(customers, eq(customers.id, saleOrders.customerId))
      .where(pendingFilters(query, "customerId"))
      .orderBy(asc(customers.name), asc(customers.id))
      .limit(200);
  },

  async pendingItemOptions(query: PendingListQuery) {
    return db
      .selectDistinct({
        id: itemMaster.id,
        sku: itemMaster.sku,
        name: itemMaster.name,
      })
      .from(saleOrderLines)
      .innerJoin(saleOrders, eq(saleOrders.id, saleOrderLines.soId))
      .innerJoin(itemMaster, eq(itemMaster.id, saleOrderLines.itemId))
      .where(pendingFilters(query, "itemId"))
      .orderBy(asc(itemMaster.name), asc(itemMaster.id))
      .limit(200);
  },

  // ---------- register ----------

  async listNotes(
    query: NoteListQuery,
    sort: { by: string; dir: "asc" | "desc" },
  ) {
    const filters: SQL[] = [];
    if (query.dateFrom)
      filters.push(gte(deliveryNotes.noteDate, query.dateFrom));
    if (query.dateTo) filters.push(lte(deliveryNotes.noteDate, query.dateTo));
    if (query.customerId !== undefined) {
      filters.push(eq(deliveryNotes.customerId, query.customerId));
    }
    if (query.soId !== undefined) {
      filters.push(eq(deliveryNotes.soId, query.soId));
    }
    if (query.status) filters.push(eq(deliveryNotes.status, query.status));
    if (query.ewayMissing === true) {
      filters.push(
        eq(deliveryNotes.status, "draft"),
        eq(deliveryNotes.ewayRequired, true),
        isNull(deliveryNotes.ewayBillNo),
      );
    }
    const where = filters.length > 0 ? and(...filters) : undefined;
    const dirFn = sort.dir === "asc" ? asc : desc;
    const sortCol =
      sort.by === "dnNumber"
        ? deliveryNotes.dnNumber
        : sort.by === "customerName"
          ? deliveryNotes.customerName
          : sort.by === "status"
            ? deliveryNotes.status
            : sort.by === "valuePaise"
              ? deliveryNotes.valuePaise
              : deliveryNotes.noteDate;
    const [rows, totals] = await Promise.all([
      db
        .select()
        .from(deliveryNotes)
        .where(where)
        .orderBy(dirFn(sortCol), dirFn(deliveryNotes.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      db.select({ total: count() }).from(deliveryNotes).where(where),
    ]);
    return { rows, total: totals[0]?.total ?? 0 };
  },

  async noteCustomerOptions() {
    return db
      .selectDistinct({
        id: deliveryNotes.customerId,
        name: deliveryNotes.customerName,
      })
      .from(deliveryNotes)
      .orderBy(asc(deliveryNotes.customerName), asc(deliveryNotes.customerId))
      .limit(200);
  },

  async totalQtyByNote(noteIds: number[]) {
    if (noteIds.length === 0) return new Map<number, number>();
    const rows = await db
      .select({
        noteId: deliveryNoteLines.noteId,
        total: sql<string>`sum(${deliveryNoteLines.qty})`,
      })
      .from(deliveryNoteLines)
      .where(inArray(deliveryNoteLines.noteId, noteIds))
      .groupBy(deliveryNoteLines.noteId);
    return new Map(rows.map((r) => [r.noteId, Number(r.total)]));
  },

  /** Customer header of an SO for the pending list's `meta.so`. */
  async findSoPickerHeader(soId: number) {
    const [row] = await db
      .select({
        soNumber: saleOrders.soNumber,
        customerPoNumber: saleOrders.customerPoNumber,
        shipToAddress: saleOrders.shipToAddress,
        shipToStateCode: saleOrders.shipToStateCode,
        customerId: customers.id,
        customerName: customers.name,
        customerAddress: customers.address,
        customerStateCode: customers.stateCode,
        customerGstin: customers.gstin,
      })
      .from(saleOrders)
      .innerJoin(customers, eq(customers.id, saleOrders.customerId))
      .where(eq(saleOrders.id, soId))
      .limit(1);
    return row;
  },
};
