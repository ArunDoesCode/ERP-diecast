import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  inArray,
  or,
  sql,
} from "drizzle-orm";

import { alias } from "drizzle-orm/pg-core";

import { db } from "../db/client";
import {
  itemMaster,
  serviceMaster,
} from "../db/schemas/02_procurement-catalog";
import {
  subcontractingOrderItems,
  subcontractingOrders,
} from "../db/schemas/02_procurement-purchasing";
import {
  supplierMaster,
  supplierServices,
} from "../db/schemas/02_procurement-suppliers";
import { employees } from "../db/schemas/03_hcm";
import { allocateDocumentSequence } from "../lib/document-number";
import type {
  scoListQuerySchemaType,
  scoResponseSchemaType,
} from "../types/sco.types";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ScoInsert = typeof subcontractingOrders.$inferInsert;
type ScoItemInsert = typeof subcontractingOrderItems.$inferInsert;
export type ScoRow = typeof subcontractingOrders.$inferSelect;
export type ScoItemRow = typeof subcontractingOrderItems.$inferSelect;

const scoColumns = {
  ...getTableColumns(subcontractingOrders),
  vendorName: supplierMaster.name,
  cancelledByName: sql<
    string | null
  >`(select ${employees.name} from ${employees} where ${employees.id} = ${subcontractingOrders.cancelledBy})`.as(
    "cancelled_by_name",
  ),
};

const rawItem = itemMaster;
const finishedItem = alias(itemMaster, "finished_item");

const scoSortColumns = {
  id: subcontractingOrders.id,
  scoNumber: subcontractingOrders.scoNumber,
  status: subcontractingOrders.status,
  createdAt: subcontractingOrders.createdAt,
  expectedReturnDate: subcontractingOrders.expectedReturnDate,
} as const;

// BR-SCO-04: line value = round(return qty x price); tax = round(value x GST% / 100),
// GST % turned into whole basis points first so the maths stays integer.
export function computeScoLinePaise(
  returnQty: number,
  unitPricePaise: number,
  gstPercent: number,
) {
  const lineValuePaise = Math.round(returnQty * unitPricePaise);
  const lineTaxPaise = Math.round(
    (lineValuePaise * Math.round(gstPercent * 100)) / 10000,
  );
  return { lineValuePaise, lineTaxPaise };
}

export function computeScoTotalsPaise(
  lines: { lineValuePaise: number; lineTaxPaise: number }[],
) {
  const subtotalPaise = lines.reduce((sum, l) => sum + l.lineValuePaise, 0);
  const taxAmountPaise = lines.reduce((sum, l) => sum + l.lineTaxPaise, 0);
  return {
    subtotalPaise,
    taxAmountPaise,
    totalAmountPaise: subtotalPaise + taxAmountPaise,
  };
}

export type PreparedScoLine = Omit<ScoItemInsert, "scoId">;

export const scoRepository = {
  async list(
    params: scoListQuerySchemaType,
  ): Promise<{ rows: scoResponseSchemaType[]; total: number }> {
    const sortColumn = params.sortBy
      ? scoSortColumns[params.sortBy]
      : subcontractingOrders.id;
    const orderFn = params.sortDir === "desc" ? desc : asc;

    const whereClause = and(
      params.status && params.status.length > 0
        ? inArray(subcontractingOrders.status, params.status)
        : undefined,
      params.vendorId !== undefined
        ? eq(subcontractingOrders.vendorId, params.vendorId)
        : undefined,
      params.q
        ? or(
            ilike(subcontractingOrders.scoNumber, `%${params.q}%`),
            ilike(supplierMaster.name, `%${params.q}%`),
          )
        : undefined,
    );

    const [rows, [totalRow]] = await Promise.all([
      db
        .select(scoColumns)
        .from(subcontractingOrders)
        .innerJoin(
          supplierMaster,
          eq(supplierMaster.id, subcontractingOrders.vendorId),
        )
        .where(whereClause)
        .orderBy(orderFn(sortColumn), asc(subcontractingOrders.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db
        .select({ value: count() })
        .from(subcontractingOrders)
        .innerJoin(
          supplierMaster,
          eq(supplierMaster.id, subcontractingOrders.vendorId),
        )
        .where(whereClause),
    ]);

    return { rows, total: totalRow?.value ?? 0 };
  },

  async findHeader(id: number, tx?: Tx) {
    const executor = tx ?? db;
    const [row] = await executor
      .select(scoColumns)
      .from(subcontractingOrders)
      .innerJoin(
        supplierMaster,
        eq(supplierMaster.id, subcontractingOrders.vendorId),
      )
      .where(eq(subcontractingOrders.id, id))
      .limit(1);
    return row;
  },

  async findLines(scoId: number, tx?: Tx) {
    const executor = tx ?? db;
    return executor
      .select({
        ...getTableColumns(subcontractingOrderItems),
        rawItemSku: rawItem.sku,
        rawItemName: rawItem.name,
        finishedItemSku: finishedItem.sku,
        finishedItemName: finishedItem.name,
      })
      .from(subcontractingOrderItems)
      .innerJoin(rawItem, eq(rawItem.id, subcontractingOrderItems.rawItemId))
      .innerJoin(
        finishedItem,
        eq(finishedItem.id, subcontractingOrderItems.finishedItemId),
      )
      .where(eq(subcontractingOrderItems.scoId, scoId))
      .orderBy(asc(subcontractingOrderItems.id));
  },

  // Row lock: every write to an SCO takes this first (BR-SCO-24, BL-065).
  async lockById(id: number, tx: Tx) {
    const [row] = await tx
      .select(getTableColumns(subcontractingOrders))
      .from(subcontractingOrders)
      .where(eq(subcontractingOrders.id, id))
      .for("update");
    return row;
  },

  async findVendor(id: number, tx?: Tx) {
    const executor = tx ?? db;
    const [row] = await executor
      .select({
        id: supplierMaster.id,
        type: supplierMaster.type,
        isActive: supplierMaster.isActive,
      })
      .from(supplierMaster)
      .where(eq(supplierMaster.id, id))
      .limit(1);
    return row;
  },

  async findItemsByIds(ids: number[], tx?: Tx) {
    if (ids.length === 0) return [];
    const executor = tx ?? db;
    return executor
      .select({ id: itemMaster.id, isActive: itemMaster.isActive })
      .from(itemMaster)
      .where(inArray(itemMaster.id, ids));
  },

  async findServicesByIds(ids: number[], tx?: Tx) {
    if (ids.length === 0) return [];
    const executor = tx ?? db;
    return executor
      .select({
        id: serviceMaster.id,
        name: serviceMaster.name,
        sacCode: serviceMaster.sacCode,
        isActive: serviceMaster.isActive,
      })
      .from(serviceMaster)
      .where(inArray(serviceMaster.id, ids));
  },

  // The vendor's active price-list rows for these services (BR-SCO-02).
  async findVendorServiceRows(vendorId: number, serviceIds: number[], tx?: Tx) {
    if (serviceIds.length === 0) return [];
    const executor = tx ?? db;
    return executor
      .select({
        serviceId: supplierServices.serviceId,
        serviceUnitPricePaise: supplierServices.serviceUnitPricePaise,
        taxPercentage: supplierServices.taxPercentage,
      })
      .from(supplierServices)
      .where(
        and(
          eq(supplierServices.supplierId, vendorId),
          inArray(supplierServices.serviceId, serviceIds),
          eq(supplierServices.isActive, true),
        ),
      );
  },

  async insertOrder(
    data: Omit<ScoInsert, "scoNumber">,
    lines: PreparedScoLine[],
    tx: Tx,
  ) {
    const { periodKey, seq } = await allocateDocumentSequence(
      tx,
      "sco",
      data.createdBy as number,
    );
    const [row] = await tx
      .insert(subcontractingOrders)
      .values({ ...data, scoNumber: `SCO-${periodKey}-${seq}` })
      .returning({ id: subcontractingOrders.id });
    if (!row) {
      throw new Error("SCO insert returned no row");
    }
    await tx
      .insert(subcontractingOrderItems)
      .values(lines.map((line) => ({ ...line, scoId: row.id })));
    return row.id;
  },

  async updateHeader(id: number, data: Partial<ScoInsert>, tx: Tx) {
    await tx
      .update(subcontractingOrders)
      .set(data)
      .where(eq(subcontractingOrders.id, id));
  },

  async replaceLines(scoId: number, lines: PreparedScoLine[], tx: Tx) {
    await tx
      .delete(subcontractingOrderItems)
      .where(eq(subcontractingOrderItems.scoId, scoId));
    await tx
      .insert(subcontractingOrderItems)
      .values(lines.map((line) => ({ ...line, scoId })));
  },
};
