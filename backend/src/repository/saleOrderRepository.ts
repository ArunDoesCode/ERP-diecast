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
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db/client";
import { boms } from "../db/schemas/02_procurement-bom";
import { itemMaster } from "../db/schemas/02_procurement-catalog";
import {
  purchaseRequestItems,
  purchaseRequests,
  subcontractingOrderItems,
  subcontractingOrders,
} from "../db/schemas/02_procurement-purchasing";
import { employees } from "../db/schemas/03_hcm";
import {
  customers,
  saleExplosionRows,
  saleExplosions,
  saleOrderLines,
  saleOrders,
  saleReservations,
} from "../db/schemas/05_sales";
import { safeSearch } from "../lib/safe-search";
import type { SoListQuery } from "../types/saleOrder.types";
import type { DbExecutor } from "./executor";

export type SaleOrderRow = typeof saleOrders.$inferSelect;
export type SaleOrderInsert = typeof saleOrders.$inferInsert;
export type SaleOrderLineRow = typeof saleOrderLines.$inferSelect;
export type SaleOrderLineInsert = typeof saleOrderLines.$inferInsert;
export type SoStatusValue = SaleOrderRow["status"];

export type ItemRef = {
  id: number;
  sku: string;
  name: string;
  uom: string;
  isActive: boolean;
};

export type RaisedDocument = {
  type: "pr" | "sco";
  id: number;
  number: string;
  status: string;
  runNo: number;
};

// BR-SO-38: a snapshot is out of date when the need or delivery version moved,
// or when an item's active BOM revision is no longer the one the row used
// (null-safe: also catches a BOM created for a "no BOM" item). Needs
// sale_explosions and sale_orders in scope.
const explosionOutOfDate = sql`(
  ${saleExplosions.soNeedVersion} <> ${saleOrders.needVersion}
  or ${saleExplosions.soDeliveryVersion} <> ${saleOrders.deliveryVersion}
  or exists (
    select 1 from ${saleExplosionRows}
    where ${saleExplosionRows.explosionId} = ${saleExplosions.id}
      and ${saleExplosionRows.bomRevisionId} is distinct from (
        select ${boms.id} from ${boms}
        where ${boms.partId} = ${saleExplosionRows.itemId}
          and ${boms.status} = 'active'
        limit 1
      )
  )
)`;

const snapshotStatusSql = sql<
  "current" | "out_of_date" | "superseded" | "none"
>`(
  case
    when exists (
      select 1 from ${saleExplosions}
      where ${saleExplosions.soId} = ${saleOrders.id} and ${saleExplosions.status} = 'current'
    ) then (
      case when exists (
        select 1 from ${saleExplosions}
        where ${saleExplosions.soId} = ${saleOrders.id}
          and ${saleExplosions.status} = 'current'
          and ${explosionOutOfDate}
      ) then 'out_of_date' else 'current' end
    )
    when exists (
      select 1 from ${saleExplosions} where ${saleExplosions.soId} = ${saleOrders.id}
    ) then 'superseded'
    else 'none'
  end
)`;

// earliest delivery date among open, non-removed lines (live SOs only)
const nextDeliverySql = sql<string | null>`(
  select min(${saleOrderLines.deliveryDate}) from ${saleOrderLines}
  where ${saleOrderLines.soId} = ${saleOrders.id}
    and ${saleOrderLines.removedAt} is null
    and ${saleOrderLines.deliveredQty} < ${saleOrderLines.qty}
    and ${saleOrders.status} in ('draft', 'confirmed', 'on_hold')
)`;

export const saleOrderRepository = {
  // ---- reads ----

  async lockById(soId: number, tx: DbExecutor) {
    const [row] = await tx
      .select()
      .from(saleOrders)
      .where(eq(saleOrders.id, soId))
      .for("update");
    return row;
  },

  /** BR-SO-48: the status of the SO a PR wants to link to. */
  async findStatusById(soId: number, executor: DbExecutor = db) {
    const [row] = await executor
      .select({ id: saleOrders.id, status: saleOrders.status })
      .from(saleOrders)
      .where(eq(saleOrders.id, soId))
      .limit(1);
    return row;
  },

  async findHeader(soId: number, executor: DbExecutor = db) {
    const createdByEmp = alias(employees, "created_by_emp");
    const [row] = await executor
      .select({
        so: saleOrders,
        customerName: customers.name,
        createdByName: createdByEmp.name,
      })
      .from(saleOrders)
      .innerJoin(customers, eq(customers.id, saleOrders.customerId))
      .leftJoin(createdByEmp, eq(createdByEmp.id, saleOrders.createdBy))
      .where(eq(saleOrders.id, soId))
      .limit(1);
    return row;
  },

  /** Non-removed lines with their item, in line-number order. */
  async findLines(soId: number, executor: DbExecutor = db) {
    return executor
      .select({
        line: saleOrderLines,
        sku: itemMaster.sku,
        itemName: itemMaster.name,
      })
      .from(saleOrderLines)
      .innerJoin(itemMaster, eq(itemMaster.id, saleOrderLines.itemId))
      .where(
        and(eq(saleOrderLines.soId, soId), isNull(saleOrderLines.removedAt)),
      )
      .orderBy(asc(saleOrderLines.lineNo), asc(saleOrderLines.id));
  },

  /** Every line of the SO (removed ones too), locked. Call after the SO lock. */
  async findAllLinesForUpdate(soId: number, tx: DbExecutor) {
    return tx
      .select()
      .from(saleOrderLines)
      .where(eq(saleOrderLines.soId, soId))
      .orderBy(asc(saleOrderLines.id))
      .for("update");
  },

  async findLineById(lineId: number, executor: DbExecutor = db) {
    const [row] = await executor
      .select()
      .from(saleOrderLines)
      .where(eq(saleOrderLines.id, lineId))
      .limit(1);
    return row;
  },

  async findLineByIdForUpdate(lineId: number, tx: DbExecutor) {
    const [row] = await tx
      .select()
      .from(saleOrderLines)
      .where(eq(saleOrderLines.id, lineId))
      .for("update");
    return row;
  },

  async findItemsByIds(ids: number[], executor: DbExecutor = db) {
    if (ids.length === 0) return new Map<number, ItemRef>();
    const rows = await executor
      .select({
        id: itemMaster.id,
        sku: itemMaster.sku,
        name: itemMaster.name,
        uom: itemMaster.uom,
        isActive: itemMaster.isActive,
      })
      .from(itemMaster)
      .where(inArray(itemMaster.id, ids));
    return new Map(rows.map((r) => [r.id, r]));
  },

  /** The other (non-cancelled) SO of this customer carrying the same PO number, BR-SO-06. */
  async findCustomerPoClash(
    customerId: number,
    poNumber: string,
    excludeSoId: number | null,
    executor: DbExecutor = db,
  ) {
    const filters: SQL[] = [
      eq(saleOrders.customerId, customerId),
      ne(saleOrders.status, "cancelled"),
      sql`lower(btrim(${saleOrders.customerPoNumber})) = lower(btrim(${poNumber}))`,
    ];
    if (excludeSoId !== null) filters.push(ne(saleOrders.id, excludeSoId));
    const [row] = await executor
      .select({ id: saleOrders.id, soNumber: saleOrders.soNumber })
      .from(saleOrders)
      .where(and(...filters))
      .limit(1);
    return row;
  },

  /**
   * PR and SCO lines raised from this SO: explosion-linked rows of any
   * snapshot (BR-SO-53). `liveOnly` applies BR-SO-15.
   */
  async findRaisedDocuments(
    soId: number,
    liveOnly: boolean,
    executor: DbExecutor = db,
  ): Promise<RaisedDocument[]> {
    const prFilters: SQL[] = [eq(saleExplosions.soId, soId)];
    const scoFilters: SQL[] = [eq(saleExplosions.soId, soId)];
    if (liveOnly) {
      prFilters.push(
        inArray(purchaseRequestItems.status, ["pending", "po_draft"]),
        sql`${purchaseRequests.status} not in ('rejected', 'cancelled')`,
      );
      scoFilters.push(
        inArray(subcontractingOrders.status, [
          "draft",
          "pending_approval",
          "approved",
        ]),
      );
    }
    const [prs, scos] = await Promise.all([
      executor
        .selectDistinct({
          id: purchaseRequests.id,
          number: purchaseRequests.prNumber,
          status: purchaseRequests.status,
          runNo: saleExplosions.runNo,
        })
        .from(saleExplosionRows)
        .innerJoin(
          saleExplosions,
          eq(saleExplosions.id, saleExplosionRows.explosionId),
        )
        .innerJoin(
          purchaseRequestItems,
          eq(purchaseRequestItems.id, saleExplosionRows.prItemId),
        )
        .innerJoin(
          purchaseRequests,
          eq(purchaseRequests.id, purchaseRequestItems.prId),
        )
        .where(and(...prFilters)),
      executor
        .selectDistinct({
          id: subcontractingOrders.id,
          number: subcontractingOrders.scoNumber,
          status: subcontractingOrders.status,
          runNo: saleExplosions.runNo,
        })
        .from(saleExplosionRows)
        .innerJoin(
          saleExplosions,
          eq(saleExplosions.id, saleExplosionRows.explosionId),
        )
        .innerJoin(
          subcontractingOrderItems,
          eq(subcontractingOrderItems.id, saleExplosionRows.scoItemId),
        )
        .innerJoin(
          subcontractingOrders,
          eq(subcontractingOrders.id, subcontractingOrderItems.scoId),
        )
        .where(and(...scoFilters)),
    ]);
    return [
      ...prs.map((r) => ({ type: "pr" as const, ...r })),
      ...scos.map((r) => ({ type: "sco" as const, ...r })),
    ].sort((a, b) => a.number.localeCompare(b.number));
  },

  async findCurrentSnapshot(soId: number, executor: DbExecutor = db) {
    const [row] = await executor
      .select({
        id: saleExplosions.id,
        runNo: saleExplosions.runNo,
        createdAt: saleExplosions.createdAt,
        outOfDate: sql<boolean>`${explosionOutOfDate}`,
        rowCount: sql<number>`(select count(*)::int from ${saleExplosionRows} where ${saleExplosionRows.explosionId} = ${saleExplosions.id})`,
        flaggedCount: sql<number>`(select count(*)::int from ${saleExplosionRows} where ${saleExplosionRows.explosionId} = ${saleExplosions.id} and ${saleExplosionRows.blockReason} is not null)`,
      })
      .from(saleExplosions)
      .innerJoin(saleOrders, eq(saleOrders.id, saleExplosions.soId))
      .where(
        and(
          eq(saleExplosions.soId, soId),
          eq(saleExplosions.status, "current"),
        ),
      )
      .limit(1);
    return row;
  },

  // ---- list ----

  async list(query: SoListQuery) {
    const common: SQL[] = [];
    const search = safeSearch(
      query.q,
      saleOrders.soNumber,
      saleOrders.customerPoNumber,
      customers.name,
    );
    if (search) common.push(search);
    if (query.customerId !== undefined)
      common.push(eq(saleOrders.customerId, query.customerId));
    if (query.orderDateFrom)
      common.push(gte(saleOrders.orderDate, query.orderDateFrom));
    if (query.orderDateTo)
      common.push(lte(saleOrders.orderDate, query.orderDateTo));
    if (query.deliveryBefore) {
      common.push(sql`exists (
        select 1 from ${saleOrderLines}
        where ${saleOrderLines.soId} = ${saleOrders.id}
          and ${saleOrderLines.removedAt} is null
          and ${saleOrderLines.deliveredQty} < ${saleOrderLines.qty}
          and ${saleOrderLines.deliveryDate} <= ${query.deliveryBefore}
      )`);
    }
    const filters = [...common];
    if (query.status) filters.push(inArray(saleOrders.status, query.status));
    const where = filters.length > 0 ? and(...filters) : undefined;
    const countsWhere = common.length > 0 ? and(...common) : undefined;

    const sortColumn = {
      soNumber: saleOrders.soNumber,
      orderDate: saleOrders.orderDate,
      createdAt: saleOrders.createdAt,
      totalAmountPaise: saleOrders.totalAmountPaise,
    }[query.sortBy];
    const dir = query.sortDir === "asc" ? asc : desc;

    const [rows, totals, counts] = await Promise.all([
      db
        .select({
          id: saleOrders.id,
          soNumber: saleOrders.soNumber,
          customerId: saleOrders.customerId,
          customerName: customers.name,
          customerPoNumber: saleOrders.customerPoNumber,
          status: saleOrders.status,
          orderDate: saleOrders.orderDate,
          totalAmountPaise: saleOrders.totalAmountPaise,
          nextDeliveryDate: nextDeliverySql,
          snapshotStatus: snapshotStatusSql,
          createdAt: saleOrders.createdAt,
        })
        .from(saleOrders)
        .innerJoin(customers, eq(customers.id, saleOrders.customerId))
        .where(where)
        .orderBy(dir(sortColumn), dir(saleOrders.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      db
        .select({ total: count() })
        .from(saleOrders)
        .innerJoin(customers, eq(customers.id, saleOrders.customerId))
        .where(where),
      db
        .select({ status: saleOrders.status, n: count() })
        .from(saleOrders)
        .innerJoin(customers, eq(customers.id, saleOrders.customerId))
        .where(countsWhere)
        .groupBy(saleOrders.status),
    ]);

    const statusCounts = {
      draft: 0,
      confirmed: 0,
      on_hold: 0,
      closed: 0,
      cancelled: 0,
    };
    for (const c of counts) statusCounts[c.status] = c.n;
    return { rows, total: totals[0]?.total ?? 0, statusCounts };
  },

  // ---- writes (always inside the caller's transaction) ----

  async insertSo(data: SaleOrderInsert, tx: DbExecutor) {
    const [row] = await tx.insert(saleOrders).values(data).returning();
    return row;
  },

  async updateSo(soId: number, data: Partial<SaleOrderInsert>, tx: DbExecutor) {
    const [row] = await tx
      .update(saleOrders)
      .set(data)
      .where(eq(saleOrders.id, soId))
      .returning();
    return row;
  },

  async insertLines(rows: SaleOrderLineInsert[], tx: DbExecutor) {
    if (rows.length === 0) return [];
    return tx.insert(saleOrderLines).values(rows).returning();
  },

  async updateLine(
    lineId: number,
    data: Partial<SaleOrderLineInsert>,
    tx: DbExecutor,
  ) {
    await tx
      .update(saleOrderLines)
      .set(data)
      .where(eq(saleOrderLines.id, lineId));
  },

  async softRemoveLines(lineIds: number[], actorId: number, tx: DbExecutor) {
    if (lineIds.length === 0) return;
    const now = new Date();
    await tx
      .update(saleOrderLines)
      .set({
        removedAt: now,
        removedBy: actorId,
        lastUpdatedBy: actorId,
        lastUpdatedAt: now,
      })
      .where(inArray(saleOrderLines.id, lineIds));
  },

  /** BR-SO-11: value = sum of the non-removed lines' amounts. */
  async recomputeTotal(soId: number, tx: DbExecutor) {
    await tx.execute(sql`
      update ${saleOrders}
      set total_amount_paise = (
        select coalesce(sum(${saleOrderLines.lineAmountPaise}), 0)
        from ${saleOrderLines}
        where ${saleOrderLines.soId} = ${soId} and ${saleOrderLines.removedAt} is null
      )
      where ${saleOrders.id} = ${soId}
    `);
  },

  /** BR-SO-17, 20, 35, 54: claims end with the SO. Rows are kept for trace. */
  async releaseReservations(soId: number, tx: DbExecutor) {
    await tx
      .update(saleReservations)
      .set({ releasedAt: new Date() })
      .where(
        and(
          eq(saleReservations.soId, soId),
          isNull(saleReservations.releasedAt),
        ),
      );
  },

  /** Unreleased stock claims of this SO for one item, oldest first (BR-SO-58). */
  async findStockClaims(soId: number, itemId: number, tx: DbExecutor) {
    return tx
      .select({ id: saleReservations.id, qty: saleReservations.qty })
      .from(saleReservations)
      .where(
        and(
          eq(saleReservations.soId, soId),
          eq(saleReservations.itemId, itemId),
          eq(saleReservations.kind, "stock"),
          isNull(saleReservations.releasedAt),
        ),
      )
      .orderBy(asc(saleReservations.id))
      .for("update");
  },

  async setClaimQty(id: number, qty: string, tx: DbExecutor) {
    await tx
      .update(saleReservations)
      .set({ qty })
      .where(eq(saleReservations.id, id));
  },

  async releaseClaim(id: number, tx: DbExecutor) {
    await tx
      .update(saleReservations)
      .set({ releasedAt: new Date() })
      .where(eq(saleReservations.id, id));
  },
};
