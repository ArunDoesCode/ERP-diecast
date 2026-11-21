import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
  type SQL,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db/client";
import { boms } from "../db/schemas/02_procurement-bom";
import { itemMaster } from "../db/schemas/02_procurement-catalog";
import {
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
  subcontractingOrderItems,
  subcontractingOrders,
} from "../db/schemas/02_procurement-purchasing";
import {
  supplierMaster,
  supplierServices,
} from "../db/schemas/02_procurement-suppliers";
import { employees } from "../db/schemas/03_hcm";
import {
  saleExplosionRows,
  saleExplosionSources,
  saleExplosions,
  saleOrderLines,
  saleOrders,
  saleReservations,
} from "../db/schemas/05_sales";
import type {
  ExplosionRowsQuery,
  explosionListQuerySchema,
} from "../types/saleOrder.types";
import type { DbExecutor, DbTransaction } from "./executor";
import {
  bomChangedSql,
  deliveryChangedSql,
  explosionOutOfDate,
  soChangedSql,
} from "./saleOrderRepository";

export type ExplosionInsert = typeof saleExplosions.$inferInsert;
export type ExplosionRowInsert = typeof saleExplosionRows.$inferInsert;
export type ExplosionRowRecord = typeof saleExplosionRows.$inferSelect;
export type SourceInsert = typeof saleExplosionSources.$inferInsert;
export type ReservationInsert = typeof saleReservations.$inferInsert;
export type ExplosionListQuery = ReturnType<
  typeof explosionListQuerySchema.parse
>;

// Advisory-lock classes of the run (data.md "Volumes and locks").
const LOCK_CLASS_PER_SO = 7101;
const LOCK_CLASS_GLOBAL = 7100;

/** A supply line (PR line, PO line, SCO line) with what is still open on it. */
export type SupplyLine = {
  lineId: number;
  itemId: number;
  /** open qty in thousandths, before other orders' claims */
  openMilli: number;
  /** thousandths claimed by other SOs' current snapshots (BR-SO-33) */
  claimedMilli: number;
  /** IST day the supply is due, null when undated (BR-SO-32) */
  due: string | null;
};

const milli = (v: number | string | null | undefined) =>
  Math.round(Number(v ?? 0) * 1000);

// IST plant day of a `timestamp` column (stored as UTC wall time, D-022).
const istDay = (col: SQL | { name: string }) =>
  sql<
    string | null
  >`((${col} at time zone 'UTC') at time zone 'Asia/Kolkata')::date::text`;

export const saleExplosionRepository = {
  // ---- run locks (BR-SO-37) ----

  /** Same SO already running -> false (409 EXPLOSION_IN_PROGRESS). */
  async tryLockSoRun(soId: number, tx: DbTransaction) {
    const rows = (await tx.execute(
      sql`select pg_try_advisory_xact_lock(${LOCK_CLASS_PER_SO}::int, ${soId}::int) as ok`,
    )) as unknown as Array<{ ok: boolean }>;
    return rows[0]?.ok === true;
  },

  /** One run at a time across all SOs; busy -> false at once (409 EXPLOSION_BUSY). */
  async tryLockGlobalRun(tx: DbTransaction) {
    const rows = (await tx.execute(
      sql`select pg_try_advisory_xact_lock(${LOCK_CLASS_GLOBAL}::int, 0::int) as ok`,
    )) as unknown as Array<{ ok: boolean }>;
    return rows[0]?.ok === true;
  },

  /** A wait on any later lock in the run (SO row) gives up after 15 s (55P03). */
  async setRunLockTimeout(tx: DbTransaction) {
    await tx.execute(sql`set local lock_timeout = '15s'`);
  },

  // ---- run: writes ----

  async nextRunNo(soId: number, tx: DbTransaction) {
    const [row] = await tx
      .select({
        n: sql<number>`coalesce(max(${saleExplosions.runNo}), 0)::int`,
      })
      .from(saleExplosions)
      .where(eq(saleExplosions.soId, soId));
    return (row?.n ?? 0) + 1;
  },

  /** BR-SO-36: the previous current snapshot becomes superseded. Returns its run no. */
  async supersedeCurrent(soId: number, now: Date, tx: DbTransaction) {
    const [row] = await tx
      .update(saleExplosions)
      .set({ status: "superseded", supersededAt: now })
      .where(
        and(
          eq(saleExplosions.soId, soId),
          eq(saleExplosions.status, "current"),
        ),
      )
      .returning({ runNo: saleExplosions.runNo });
    return row?.runNo ?? null;
  },

  async insertExplosion(data: ExplosionInsert, tx: DbTransaction) {
    const [row] = await tx.insert(saleExplosions).values(data).returning();
    return row;
  },

  async insertRows(rows: ExplosionRowInsert[], tx: DbTransaction) {
    if (rows.length === 0) return [];
    return tx.insert(saleExplosionRows).values(rows).returning({
      id: saleExplosionRows.id,
      itemId: saleExplosionRows.itemId,
    });
  },

  async insertSources(rows: SourceInsert[], tx: DbTransaction) {
    if (rows.length === 0) return;
    await tx.insert(saleExplosionSources).values(rows);
  },

  async insertReservations(rows: ReservationInsert[], tx: DbTransaction) {
    if (rows.length === 0) return;
    await tx.insert(saleReservations).values(rows);
  },

  // ---- run: supply and claims (one batched query per kind per level) ----

  /** Stock claimed by other SOs, per item, in thousandths (BR-SO-30). */
  async reservedStockByItems(
    itemIds: number[],
    exceptSoId: number,
    tx: DbExecutor,
  ) {
    const out = new Map<number, number>();
    if (itemIds.length === 0) return out;
    const rows = await tx
      .select({
        itemId: saleReservations.itemId,
        qty: sql<string>`sum(${saleReservations.qty})`,
      })
      .from(saleReservations)
      .where(
        and(
          eq(saleReservations.kind, "stock"),
          isNull(saleReservations.releasedAt),
          ne(saleReservations.soId, exceptSoId),
          inArray(saleReservations.itemId, itemIds),
        ),
      )
      .groupBy(saleReservations.itemId);
    for (const r of rows) out.set(r.itemId, milli(r.qty));
    return out;
  },

  /** BR-SO-31: PR lines not yet fully on a PO (draft PRs and draft POs count). */
  async openPrLines(
    itemIds: number[],
    exceptSoId: number,
    tx: DbExecutor,
  ): Promise<SupplyLine[]> {
    if (itemIds.length === 0) return [];
    const rows = await tx
      .select({
        lineId: purchaseRequestItems.id,
        itemId: purchaseRequestItems.itemId,
        requested: purchaseRequestItems.requestedQty,
        issued: purchaseRequestItems.issuedQty,
        due: istDay(sql`${purchaseRequestItems.expectedDate}`),
        claimed: sql<string>`coalesce((
          select sum(${saleReservations.qty}) from ${saleReservations}
          where ${saleReservations.prItemId} = ${purchaseRequestItems.id}
            and ${saleReservations.releasedAt} is null
            and ${saleReservations.soId} <> ${exceptSoId}
        ), 0)`,
      })
      .from(purchaseRequestItems)
      .innerJoin(
        purchaseRequests,
        eq(purchaseRequests.id, purchaseRequestItems.prId),
      )
      .where(
        and(
          inArray(purchaseRequestItems.itemId, itemIds),
          inArray(purchaseRequestItems.status, ["pending", "po_draft"]),
          notInArray(purchaseRequests.status, ["rejected", "cancelled"]),
          sql`${purchaseRequestItems.requestedQty} > ${purchaseRequestItems.issuedQty}`,
        ),
      )
      .orderBy(asc(purchaseRequestItems.id));
    return rows.map((r) => ({
      lineId: r.lineId,
      itemId: r.itemId,
      openMilli: Math.max(0, milli(r.requested) - milli(r.issued)),
      claimedMilli: milli(r.claimed),
      due: r.due,
    }));
  },

  /** BR-SO-31: PO lines ordered but not received (PO not cancelled / closed). */
  async openPoLines(
    itemIds: number[],
    exceptSoId: number,
    tx: DbExecutor,
  ): Promise<SupplyLine[]> {
    if (itemIds.length === 0) return [];
    const rows = await tx
      .select({
        lineId: purchaseOrderItems.id,
        itemId: purchaseOrderItems.itemId,
        qty: purchaseOrderItems.qty,
        received: purchaseOrderItems.receivedQty,
        due: istDay(
          sql`coalesce(${purchaseOrders.revisedDeliveryDate}, ${purchaseOrders.expectedDeliveryDate})`,
        ),
        claimed: sql<string>`coalesce((
          select sum(${saleReservations.qty}) from ${saleReservations}
          where ${saleReservations.poItemId} = ${purchaseOrderItems.id}
            and ${saleReservations.releasedAt} is null
            and ${saleReservations.soId} <> ${exceptSoId}
        ), 0)`,
      })
      .from(purchaseOrderItems)
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderItems.poId))
      .where(
        and(
          inArray(purchaseOrderItems.itemId, itemIds),
          notInArray(purchaseOrders.status, ["cancelled", "closed"]),
          sql`${purchaseOrderItems.qty} > ${purchaseOrderItems.receivedQty}`,
        ),
      )
      .orderBy(asc(purchaseOrderItems.id));
    return rows.map((r) => ({
      lineId: r.lineId,
      itemId: r.itemId,
      openMilli: Math.max(0, milli(r.qty) - milli(r.received)),
      claimedMilli: milli(r.claimed),
      due: r.due,
    }));
  },

  /** BR-SO-31: finished-item qty still to come back from a job worker. */
  async openScoLines(
    itemIds: number[],
    exceptSoId: number,
    tx: DbExecutor,
  ): Promise<SupplyLine[]> {
    if (itemIds.length === 0) return [];
    const rows = await tx
      .select({
        lineId: subcontractingOrderItems.id,
        itemId: subcontractingOrderItems.finishedItemId,
        open: sql<number>`(${subcontractingOrderItems.expectedReturnQty} - ${subcontractingOrderItems.acceptedQty} - ${subcontractingOrderItems.rejectedQty} - ${subcontractingOrderItems.lossQty})`,
        due: istDay(sql`${subcontractingOrders.expectedReturnDate}`),
        claimed: sql<string>`coalesce((
          select sum(${saleReservations.qty}) from ${saleReservations}
          where ${saleReservations.scoItemId} = ${subcontractingOrderItems.id}
            and ${saleReservations.releasedAt} is null
            and ${saleReservations.soId} <> ${exceptSoId}
        ), 0)`,
      })
      .from(subcontractingOrderItems)
      .innerJoin(
        subcontractingOrders,
        eq(subcontractingOrders.id, subcontractingOrderItems.scoId),
      )
      .where(
        and(
          inArray(subcontractingOrderItems.finishedItemId, itemIds),
          notInArray(subcontractingOrders.status, [
            "rejected",
            "cancelled",
            "closed",
          ]),
          sql`(${subcontractingOrderItems.expectedReturnQty} - ${subcontractingOrderItems.acceptedQty} - ${subcontractingOrderItems.rejectedQty} - ${subcontractingOrderItems.lossQty}) > 0`,
        ),
      )
      .orderBy(asc(subcontractingOrderItems.id));
    return rows.map((r) => ({
      lineId: r.lineId,
      itemId: r.itemId,
      openMilli: Math.max(0, Number(r.open) * 1000),
      claimedMilli: milli(r.claimed),
      due: r.due,
    }));
  },

  /** Active BOM id per item (rows that were not walked still record it, BR-SO-38). */
  async activeBomIds(itemIds: number[], tx: DbExecutor) {
    if (itemIds.length === 0) return new Map<number, number>();
    const rows = await tx
      .select({ partId: boms.partId, id: boms.id })
      .from(boms)
      .where(and(inArray(boms.partId, itemIds), eq(boms.status, "active")));
    return new Map(rows.map((r) => [r.partId, r.id]));
  },

  // ---- reads ----

  async findHeader(soId: number, eid: number, executor: DbExecutor = db) {
    const creator = alias(employees, "creator_emp");
    const [row] = await executor
      .select({
        id: saleExplosions.id,
        soId: saleExplosions.soId,
        soNumber: saleOrders.soNumber,
        soStatus: saleOrders.status,
        runNo: saleExplosions.runNo,
        status: saleExplosions.status,
        createdBy: saleExplosions.createdBy,
        createdByName: creator.name,
        createdAt: saleExplosions.createdAt,
        supersededAt: saleExplosions.supersededAt,
        soChanged: sql<boolean>`${soChangedSql}`,
        deliveryChanged: sql<boolean>`${deliveryChangedSql}`,
        bomChanged: sql<boolean>`${bomChangedSql}`,
      })
      .from(saleExplosions)
      .innerJoin(saleOrders, eq(saleOrders.id, saleExplosions.soId))
      .leftJoin(creator, eq(creator.id, saleExplosions.createdBy))
      .where(and(eq(saleExplosions.id, eid), eq(saleExplosions.soId, soId)))
      .limit(1);
    return row;
  },

  async totals(eid: number, executor: DbExecutor = db) {
    const [row] = await executor
      .select({
        rowCount: sql<number>`count(*)::int`,
        flaggedCount: sql<number>`(count(*) filter (where ${saleExplosionRows.blockReason} is not null))::int`,
        shortCount: sql<number>`(count(*) filter (where ${saleExplosionRows.netQty} > 0))::int`,
        raisedCount: sql<number>`(count(*) filter (where ${saleExplosionRows.prItemId} is not null or ${saleExplosionRows.scoItemId} is not null))::int`,
      })
      .from(saleExplosionRows)
      .where(eq(saleExplosionRows.explosionId, eid));
    return {
      rowCount: row?.rowCount ?? 0,
      flaggedCount: row?.flaggedCount ?? 0,
      shortCount: row?.shortCount ?? 0,
      raisedCount: row?.raisedCount ?? 0,
    };
  },

  /** BOM revision used per walked part (header `bomRevisions`). */
  async bomRevisions(eid: number, executor: DbExecutor = db) {
    return executor
      .select({ partSku: itemMaster.sku, revisionNo: boms.revisionNo })
      .from(saleExplosionRows)
      .innerJoin(boms, eq(boms.id, saleExplosionRows.bomRevisionId))
      .innerJoin(itemMaster, eq(itemMaster.id, saleExplosionRows.itemId))
      .where(eq(saleExplosionRows.explosionId, eid))
      .orderBy(asc(itemMaster.sku));
  },

  async list(soId: number, query: ExplosionListQuery) {
    const creator = alias(employees, "creator_emp");
    const filters: SQL[] = [eq(saleExplosions.soId, soId)];
    if (query.status) filters.push(eq(saleExplosions.status, query.status));
    const where = and(...filters);
    const sortColumn = {
      runNo: saleExplosions.runNo,
      createdAt: saleExplosions.createdAt,
    }[query.sortBy];
    const dir = query.sortDir === "asc" ? asc : desc;

    const [rows, totals] = await Promise.all([
      db
        .select({
          id: saleExplosions.id,
          runNo: saleExplosions.runNo,
          soNumber: saleOrders.soNumber,
          status: saleExplosions.status,
          // only a current snapshot can be out of date (BR-SO-38)
          outOfDate: sql<boolean>`(${saleExplosions.status} = 'current' and ${explosionOutOfDate})`,
          createdByName: creator.name,
          createdAt: saleExplosions.createdAt,
          supersededAt: saleExplosions.supersededAt,
          rowCount: sql<number>`(select count(*)::int from ${saleExplosionRows} where ${saleExplosionRows.explosionId} = ${saleExplosions.id})`,
          flaggedCount: sql<number>`(select count(*)::int from ${saleExplosionRows} where ${saleExplosionRows.explosionId} = ${saleExplosions.id} and ${saleExplosionRows.blockReason} is not null)`,
        })
        .from(saleExplosions)
        .innerJoin(saleOrders, eq(saleOrders.id, saleExplosions.soId))
        .leftJoin(creator, eq(creator.id, saleExplosions.createdBy))
        .where(where)
        .orderBy(dir(sortColumn), dir(saleExplosions.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      db.select({ total: count() }).from(saleExplosions).where(where),
    ]);
    return { rows, total: totals[0]?.total ?? 0 };
  },

  async listRows(eid: number, query: ExplosionRowsQuery) {
    const filters: SQL[] = [eq(saleExplosionRows.explosionId, eid)];
    if (query.type) filters.push(eq(saleExplosionRows.rowType, query.type));
    if (query.net === "short")
      filters.push(sql`${saleExplosionRows.netQty} > 0`);
    if (query.flagged === true)
      filters.push(isNotNull(saleExplosionRows.blockReason));
    if (query.flagged === false)
      filters.push(isNull(saleExplosionRows.blockReason));
    const where = and(...filters);

    const dir = query.sortDir === "asc" ? asc : desc;
    const orderBy =
      query.sortBy === "level"
        ? [
            dir(saleExplosionRows.level),
            asc(itemMaster.sku),
            asc(saleExplosionRows.id),
          ]
        : query.sortBy === "sku"
          ? [dir(itemMaster.sku), dir(saleExplosionRows.id)]
          : query.sortBy === "netQty"
            ? [
                dir(saleExplosionRows.netQty),
                asc(itemMaster.sku),
                asc(saleExplosionRows.id),
              ]
            : [
                dir(saleExplosionRows.rowType),
                asc(itemMaster.sku),
                asc(saleExplosionRows.id),
              ];

    const [rows, totals] = await Promise.all([
      db
        .select({
          row: saleExplosionRows,
          sku: itemMaster.sku,
          name: itemMaster.name,
          bomRevisionNo: boms.revisionNo,
          bomJobWorkerId: boms.jobWorkerId,
          bomServiceId: boms.serviceId,
          prId: purchaseRequests.id,
          prNumber: purchaseRequests.prNumber,
          scoId: subcontractingOrders.id,
          scoNumber: subcontractingOrders.scoNumber,
        })
        .from(saleExplosionRows)
        .innerJoin(itemMaster, eq(itemMaster.id, saleExplosionRows.itemId))
        .leftJoin(boms, eq(boms.id, saleExplosionRows.bomRevisionId))
        .leftJoin(
          purchaseRequestItems,
          eq(purchaseRequestItems.id, saleExplosionRows.prItemId),
        )
        .leftJoin(
          purchaseRequests,
          eq(purchaseRequests.id, purchaseRequestItems.prId),
        )
        .leftJoin(
          subcontractingOrderItems,
          eq(subcontractingOrderItems.id, saleExplosionRows.scoItemId),
        )
        .leftJoin(
          subcontractingOrders,
          eq(subcontractingOrders.id, subcontractingOrderItems.scoId),
        )
        .where(where)
        .orderBy(...orderBy)
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      db
        .select({ total: count() })
        .from(saleExplosionRows)
        .innerJoin(itemMaster, eq(itemMaster.id, saleExplosionRows.itemId))
        .where(where),
    ]);
    return { rows, total: totals[0]?.total ?? 0 };
  },

  /** Sources of these rows with the needing item and its level (one query per page). */
  async sourcesForRows(eid: number, rowIds: number[]) {
    if (rowIds.length === 0) return [];
    const lineItem = alias(itemMaster, "line_item");
    const viaItem = alias(itemMaster, "via_item");
    const viaRow = alias(saleExplosionRows, "via_row");
    return db
      .select({
        rowId: saleExplosionSources.rowId,
        soLineId: saleExplosionSources.soLineId,
        lineNo: saleOrderLines.lineNo,
        qty: saleExplosionSources.qty,
        lineSku: lineItem.sku,
        viaSku: viaItem.sku,
        viaLevel: viaRow.level,
      })
      .from(saleExplosionSources)
      .innerJoin(
        saleOrderLines,
        eq(saleOrderLines.id, saleExplosionSources.soLineId),
      )
      .innerJoin(lineItem, eq(lineItem.id, saleOrderLines.itemId))
      .leftJoin(viaItem, eq(viaItem.id, saleExplosionSources.viaItemId))
      .leftJoin(
        viaRow,
        and(
          eq(viaRow.explosionId, eid),
          eq(viaRow.itemId, saleExplosionSources.viaItemId),
        ),
      )
      .where(inArray(saleExplosionSources.rowId, rowIds))
      .orderBy(asc(saleExplosionSources.id));
  },

  /** Active job workers that offer these services (job-worker candidates). */
  async candidatesForServices(serviceIds: number[]) {
    if (serviceIds.length === 0) return [];
    const rows = await db
      .select({
        serviceId: supplierServices.serviceId,
        vendorId: supplierMaster.id,
        name: supplierMaster.name,
        type: supplierMaster.type,
      })
      .from(supplierServices)
      .innerJoin(
        supplierMaster,
        eq(supplierMaster.id, supplierServices.supplierId),
      )
      .where(
        and(
          inArray(supplierServices.serviceId, serviceIds),
          eq(supplierServices.isActive, true),
          eq(supplierMaster.isActive, true),
        ),
      )
      .orderBy(asc(supplierMaster.name), asc(supplierMaster.id));
    // a job worker is a service provider (BR-SCO-01): filtered here, the rows are few
    return rows.filter(
      (r) => r.type === "service_provider" || r.type === "both",
    );
  },

  // ---- drafts (BR-SO-39..46) ----

  /** Picked rows of one snapshot with their item; `lock` = `for update` by id (BR-SO-46). */
  async findRowsForPick(
    eid: number,
    rowIds: number[],
    executor: DbExecutor,
    lock: boolean,
  ) {
    const query = executor
      .select({
        row: saleExplosionRows,
        sku: itemMaster.sku,
      })
      .from(saleExplosionRows)
      .innerJoin(itemMaster, eq(itemMaster.id, saleExplosionRows.itemId))
      .where(
        and(
          eq(saleExplosionRows.explosionId, eid),
          inArray(saleExplosionRows.id, rowIds),
        ),
      )
      .orderBy(asc(saleExplosionRows.id));
    return lock ? query.for("update", { of: saleExplosionRows }) : query;
  },

  /** Records the PR / SCO line each picked row became (BR-SO-46). */
  async markRaised(
    entries: Array<{
      rowId: number;
      prItemId: number | null;
      scoItemId: number | null;
      qty: string;
    }>,
    actorId: number,
    now: Date,
    tx: DbTransaction,
  ) {
    if (entries.length === 0) return;
    const pick = <T>(f: (e: (typeof entries)[number]) => T, cast: string) =>
      sql.join(
        entries.map((e) => sql`when ${e.rowId} then ${f(e)}::${sql.raw(cast)}`),
        sql` `,
      );
    await tx
      .update(saleExplosionRows)
      .set({
        prItemId: sql`case ${saleExplosionRows.id} ${pick((e) => e.prItemId, "int")} end`,
        scoItemId: sql`case ${saleExplosionRows.id} ${pick((e) => e.scoItemId, "int")} end`,
        raisedQty: sql`case ${saleExplosionRows.id} ${pick((e) => e.qty, "numeric")} end`,
        raisedBy: actorId,
        raisedAt: now,
      })
      .where(
        inArray(
          saleExplosionRows.id,
          entries.map((e) => e.rowId),
        ),
      );
  },
};
