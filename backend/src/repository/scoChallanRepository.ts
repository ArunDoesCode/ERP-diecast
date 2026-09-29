import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  inArray,
  sql,
} from "drizzle-orm";

import { db } from "../db/client";
import { itemMaster, locations } from "../db/schemas/02_procurement-catalog";
import {
  scoChallanLines,
  scoChallans,
  subcontractingOrderItems,
  subcontractingOrders,
} from "../db/schemas/02_procurement-purchasing";
import { supplierMaster } from "../db/schemas/02_procurement-suppliers";
import { employees } from "../db/schemas/03_hcm";
import { companySettings } from "../db/schemas/04_company";
import { ConflictError } from "../lib/errors";
import type { openChallanListQuerySchemaType } from "../types/scoChallan.types";
import type { Tx } from "./scoRepository";

export type ChallanInsert = typeof scoChallans.$inferInsert;
export type ChallanRow = typeof scoChallans.$inferSelect;
export type ChallanLineInsert = typeof scoChallanLines.$inferInsert;
export type ChallanLineRow = typeof scoChallanLines.$inferSelect;

// Whole days from `today` (YYYY-MM-DD) to the due date (BR-SCO-11); negative = overdue.
function daysLeftExpr(today: string) {
  return sql<number>`(${scoChallans.returnDueDate}::date - ${today}::date)::int`;
}

const challanSortColumns = {
  id: scoChallans.id,
  challanNumber: scoChallans.challanNumber,
  challanDate: scoChallans.challanDate,
  returnDueDate: scoChallans.returnDueDate,
} as const;

const OPEN_CHALLAN = sql`exists (select 1 from ${scoChallanLines} where ${scoChallanLines.challanId} = ${scoChallans.id} and ${scoChallanLines.settledQty} < ${scoChallanLines.qty})`;

function challanSelect(today: string) {
  return {
    ...getTableColumns(scoChallans),
    scoNumber: subcontractingOrders.scoNumber,
    vendorName: supplierMaster.name,
    daysLeft: daysLeftExpr(today).as("days_left"),
    createdByName: employees.name,
  };
}

export const scoChallanRepository = {
  async findById(id: number, today: string) {
    const [row] = await db
      .select(challanSelect(today))
      .from(scoChallans)
      .innerJoin(
        subcontractingOrders,
        eq(subcontractingOrders.id, scoChallans.scoId),
      )
      .innerJoin(supplierMaster, eq(supplierMaster.id, scoChallans.vendorId))
      .leftJoin(employees, eq(employees.id, scoChallans.createdBy))
      .where(eq(scoChallans.id, id))
      .limit(1);
    return row;
  },

  async findByIdInTx(id: number, today: string, tx: Tx) {
    const [row] = await tx
      .select(challanSelect(today))
      .from(scoChallans)
      .innerJoin(
        subcontractingOrders,
        eq(subcontractingOrders.id, scoChallans.scoId),
      )
      .innerJoin(supplierMaster, eq(supplierMaster.id, scoChallans.vendorId))
      .leftJoin(employees, eq(employees.id, scoChallans.createdBy))
      .where(eq(scoChallans.id, id))
      .limit(1);
    return row;
  },

  async listBySco(scoId: number, today: string) {
    return db
      .select(challanSelect(today))
      .from(scoChallans)
      .innerJoin(
        subcontractingOrders,
        eq(subcontractingOrders.id, scoChallans.scoId),
      )
      .innerJoin(supplierMaster, eq(supplierMaster.id, scoChallans.vendorId))
      .leftJoin(employees, eq(employees.id, scoChallans.createdBy))
      .where(eq(scoChallans.scoId, scoId))
      .orderBy(desc(scoChallans.id));
  },

  async listOpen(params: openChallanListQuerySchemaType, today: string) {
    const days = daysLeftExpr(today);
    const whereClause = and(
      OPEN_CHALLAN,
      params.vendorId !== undefined
        ? eq(scoChallans.vendorId, params.vendorId)
        : undefined,
      params.scoId !== undefined
        ? eq(scoChallans.scoId, params.scoId)
        : undefined,
      params.dueStatus === "overdue" ? sql`${days} < 0` : undefined,
      params.dueStatus === "warning"
        ? sql`${days} between 0 and 60`
        : undefined,
      params.dueStatus === "ok" ? sql`${days} > 60` : undefined,
    );
    const orderFn = params.sortDir === "desc" ? desc : asc;
    const [rows, [totalRow]] = await Promise.all([
      db
        .select(challanSelect(today))
        .from(scoChallans)
        .innerJoin(
          subcontractingOrders,
          eq(subcontractingOrders.id, scoChallans.scoId),
        )
        .innerJoin(supplierMaster, eq(supplierMaster.id, scoChallans.vendorId))
        .leftJoin(employees, eq(employees.id, scoChallans.createdBy))
        .where(whereClause)
        .orderBy(
          orderFn(challanSortColumns[params.sortBy]),
          asc(scoChallans.id),
        )
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db.select({ value: count() }).from(scoChallans).where(whereClause),
    ]);
    return { rows, total: totalRow?.value ?? 0 };
  },

  async findLines(challanId: number, tx?: Tx) {
    const executor = tx ?? db;
    return executor
      .select({
        ...getTableColumns(scoChallanLines),
        itemSku: itemMaster.sku,
        itemName: itemMaster.name,
      })
      .from(scoChallanLines)
      .innerJoin(itemMaster, eq(itemMaster.id, scoChallanLines.itemId))
      .where(eq(scoChallanLines.challanId, challanId))
      .orderBy(asc(scoChallanLines.id));
  },

  async getCompanySettings(tx: Tx) {
    const [row] = await tx.select().from(companySettings).limit(1);
    return row;
  },

  async findVendor(id: number, tx: Tx) {
    const [row] = await tx
      .select({
        id: supplierMaster.id,
        name: supplierMaster.name,
        gstNumber: supplierMaster.gstNumber,
      })
      .from(supplierMaster)
      .where(eq(supplierMaster.id, id))
      .limit(1);
    return row;
  },

  async findVendorForPrint(id: number) {
    const [row] = await db
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

  async getCompanySettingsPlain() {
    const [row] = await db.select().from(companySettings).limit(1);
    return row;
  },

  // Items locked in id order so concurrent challans cannot deadlock; the
  // average cost read here is the one postStock will see (it locks the same row).
  async lockItems(ids: number[], tx: Tx) {
    if (ids.length === 0) return [];
    return tx
      .select({
        id: itemMaster.id,
        hsnCode: itemMaster.hsnCode,
        averageCostPaise: itemMaster.averageCostPaise,
      })
      .from(itemMaster)
      .where(inArray(itemMaster.id, ids))
      .orderBy(asc(itemMaster.id))
      .for("update");
  },

  // BR-SCO-08: one job-work location per vendor, created on first use. The
  // unique index (one vendor_premise per supplier) makes concurrent creators
  // wait for each other; the loser inserts nothing and re-selects.
  async ensureVendorLocation(
    vendorId: number,
    vendorName: string,
    actorId: number,
    tx: Tx,
  ) {
    const find = async () => {
      const [row] = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(
          and(
            eq(locations.linkedVendorId, vendorId),
            eq(locations.type, "vendor_premise"),
          ),
        )
        .limit(1);
      return row;
    };
    const existing = await find();
    if (existing) return existing.id;
    await tx
      .insert(locations)
      .values({
        name: `${vendorName} (job work)`,
        type: "vendor_premise",
        isVirtual: true,
        linkedVendorId: vendorId,
        createdBy: actorId,
        lastUpdatedBy: actorId,
      })
      .onConflictDoNothing();
    const created = await find();
    if (!created) {
      throw new ConflictError(
        "Could not create the vendor's job-work location (name already in use)",
        "VENDOR_LOCATION_CONFLICT",
      );
    }
    return created.id;
  },

  async findMainStore(tx: Tx) {
    const [row] = await tx
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.type, "main_store"))
      .orderBy(asc(locations.id))
      .limit(1);
    return row;
  },

  async insertChallan(data: ChallanInsert, tx: Tx) {
    const [row] = await tx
      .insert(scoChallans)
      .values(data)
      .returning({ id: scoChallans.id });
    if (!row) throw new Error("Challan insert returned no row");
    return row.id;
  },

  async insertLine(data: ChallanLineInsert, tx: Tx) {
    const [row] = await tx
      .insert(scoChallanLines)
      .values(data)
      .returning({ id: scoChallanLines.id });
    if (!row) throw new Error("Challan line insert returned no row");
    return row.id;
  },

  async addIssuedQty(scoItemId: number, qty: number, tx: Tx) {
    await tx
      .update(subcontractingOrderItems)
      .set({ issuedQty: sql`${subcontractingOrderItems.issuedQty} + ${qty}` })
      .where(eq(subcontractingOrderItems.id, scoItemId));
  },
};
