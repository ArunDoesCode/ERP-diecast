import { and, asc, count, desc, eq, gte, lt, sql } from "drizzle-orm";

import { db } from "../db/client";
import {
  inventoryLedger,
  itemMaster,
  locations,
} from "../db/schemas/02_procurement-catalog";
import { subcontractingOrders } from "../db/schemas/02_procurement-purchasing";
import { supplierMaster } from "../db/schemas/02_procurement-suppliers";
import { employees } from "../db/schemas/03_hcm";
import type {
  lossLogQuerySchemaType,
  lossLogRowSchemaType,
  vendorStockQuerySchemaType,
  vendorStockRowSchemaType,
} from "../types/scoReport.types";
import { endOfDayBound } from "./scoRepository";

export const scoReportRepository = {
  // Ledger balance of each vendor location per raw item; empty balances are dropped.
  async vendorStock(
    q: vendorStockQuerySchemaType,
  ): Promise<{ rows: vendorStockRowSchemaType[]; total: number }> {
    const qty = sql<number>`sum(${inventoryLedger.quantityChange})::int`;
    const value = sql<number>`sum(${inventoryLedger.totalValueChangePaise})::bigint`;
    const where = and(
      eq(locations.type, "vendor_premise"),
      q.vendorId !== undefined
        ? eq(locations.linkedVendorId, q.vendorId)
        : undefined,
    );
    const grouped = db
      .select({
        vendorId: sql<number>`${supplierMaster.id}`.as("vendor_id"),
        vendorName: sql<string>`${supplierMaster.name}`.as("vendor_name"),
        itemId: sql<number>`${itemMaster.id}`.as("item_id"),
        itemSku: sql<string>`${itemMaster.sku}`.as("item_sku"),
        itemName: sql<string>`${itemMaster.name}`.as("item_name"),
        qty: qty.as("qty"),
        valuePaise: value.as("value_paise"),
      })
      .from(inventoryLedger)
      .innerJoin(locations, eq(locations.id, inventoryLedger.locationId))
      .innerJoin(
        supplierMaster,
        eq(supplierMaster.id, locations.linkedVendorId),
      )
      .innerJoin(itemMaster, eq(itemMaster.id, inventoryLedger.itemId))
      .where(where)
      .groupBy(
        supplierMaster.id,
        supplierMaster.name,
        itemMaster.id,
        itemMaster.sku,
        itemMaster.name,
      )
      .having(sql`sum(${inventoryLedger.quantityChange}) <> 0`)
      .as("vs");

    const sortColumn = grouped[q.sortBy];
    const orderFn = q.sortDir === "desc" ? desc : asc;
    const [rows, [totalRow]] = await Promise.all([
      db
        .select()
        .from(grouped)
        .orderBy(
          orderFn(sortColumn),
          asc(grouped.vendorId),
          asc(grouped.itemId),
        )
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      db.select({ value: count() }).from(grouped),
    ]);
    return {
      rows: rows.map((r) => ({
        ...r,
        qty: Number(r.qty),
        valuePaise: Number(r.valuePaise),
      })),
      total: totalRow?.value ?? 0,
    };
  },

  // One row per `sco_loss` posting at the vendor location.
  async lossLog(
    q: lossLogQuerySchemaType,
  ): Promise<{ rows: lossLogRowSchemaType[]; total: number }> {
    const where = and(
      eq(inventoryLedger.referenceType, "sco_loss"),
      q.vendorId !== undefined
        ? eq(subcontractingOrders.vendorId, q.vendorId)
        : undefined,
      q.scoId !== undefined ? eq(subcontractingOrders.id, q.scoId) : undefined,
      q.createdFrom ? gte(inventoryLedger.createdAt, q.createdFrom) : undefined,
      q.createdTo
        ? lt(inventoryLedger.createdAt, endOfDayBound(q.createdTo))
        : undefined,
    );
    const qtyExpr = sql<number>`abs(${inventoryLedger.quantityChange})::int`;
    const costExpr = sql<number>`abs(${inventoryLedger.totalValueChangePaise})::bigint`;
    const sortColumn = {
      id: inventoryLedger.id,
      createdAt: inventoryLedger.createdAt,
      qty: qtyExpr,
      costPaise: costExpr,
    }[q.sortBy];
    const orderFn = q.sortDir === "desc" ? desc : asc;

    const [rows, [totalRow]] = await Promise.all([
      db
        .select({
          ledgerId: inventoryLedger.id,
          scoId: subcontractingOrders.id,
          scoNumber: subcontractingOrders.scoNumber,
          vendorId: supplierMaster.id,
          vendorName: supplierMaster.name,
          itemId: itemMaster.id,
          itemSku: itemMaster.sku,
          itemName: itemMaster.name,
          qty: qtyExpr,
          costPaise: costExpr,
          batchNumber: inventoryLedger.batchNumber,
          reason: sql<string>`coalesce(${subcontractingOrders.closeReason}, ${inventoryLedger.notes}, '')`,
          createdBy: inventoryLedger.createdBy,
          createdByName: employees.name,
          createdAt: inventoryLedger.createdAt,
        })
        .from(inventoryLedger)
        .innerJoin(
          subcontractingOrders,
          eq(subcontractingOrders.id, inventoryLedger.referenceId),
        )
        .innerJoin(
          supplierMaster,
          eq(supplierMaster.id, subcontractingOrders.vendorId),
        )
        .innerJoin(itemMaster, eq(itemMaster.id, inventoryLedger.itemId))
        .leftJoin(employees, eq(employees.id, inventoryLedger.createdBy))
        .where(where)
        .orderBy(orderFn(sortColumn), asc(inventoryLedger.id))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      db
        .select({ value: count() })
        .from(inventoryLedger)
        .innerJoin(
          subcontractingOrders,
          eq(subcontractingOrders.id, inventoryLedger.referenceId),
        )
        .where(where),
    ]);
    return {
      rows: rows.map((r) => ({ ...r, costPaise: Number(r.costPaise) })),
      total: totalRow?.value ?? 0,
    };
  },
};
