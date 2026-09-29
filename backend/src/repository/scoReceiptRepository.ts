import { and, asc, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "../db/client";
import { itemMaster, locations } from "../db/schemas/02_procurement-catalog";
import {
  scoChallanLines,
  scoChallans,
  scoReceiptSettlements,
  subcontractingGrnItems,
  subcontractingGrns,
  subcontractingOrderItems,
  subcontractingOrders,
} from "../db/schemas/02_procurement-purchasing";
import { supplierMaster } from "../db/schemas/02_procurement-suppliers";
import { employees } from "../db/schemas/03_hcm";
import type { Tx } from "./scoRepository";

export type ReceiptInsert = typeof subcontractingGrns.$inferInsert;
export type ReceiptLineInsert = typeof subcontractingGrnItems.$inferInsert;
export type ReceiptLineUpdate = Partial<
  typeof subcontractingGrnItems.$inferInsert
>;

const finishedItem = alias(itemMaster, "finished_item");
const rawItem = alias(itemMaster, "raw_item");

const receiptSelect = {
  ...getTableColumns(subcontractingGrns),
  scoNumber: subcontractingOrders.scoNumber,
  vendorName: supplierMaster.name,
  createdByName: employees.name,
};

function receiptQuery(executor: typeof db | Tx) {
  return executor
    .select(receiptSelect)
    .from(subcontractingGrns)
    .innerJoin(
      subcontractingOrders,
      eq(subcontractingOrders.id, subcontractingGrns.scoId),
    )
    .innerJoin(
      supplierMaster,
      eq(supplierMaster.id, subcontractingGrns.vendorId),
    )
    .leftJoin(employees, eq(employees.id, subcontractingGrns.createdBy));
}

const qaDecider = alias(employees, "qa_decider");

function lineQuery(executor: typeof db | Tx) {
  return executor
    .select({
      ...getTableColumns(subcontractingGrnItems),
      finishedItemSku: finishedItem.sku,
      finishedItemName: finishedItem.name,
      rawItemSku: rawItem.sku,
      rawItemName: rawItem.name,
      qaDecidedByName: qaDecider.name,
    })
    .from(subcontractingGrnItems)
    .innerJoin(
      subcontractingOrderItems,
      eq(subcontractingOrderItems.id, subcontractingGrnItems.scoItemId),
    )
    .innerJoin(
      finishedItem,
      eq(finishedItem.id, subcontractingOrderItems.finishedItemId),
    )
    .innerJoin(rawItem, eq(rawItem.id, subcontractingOrderItems.rawItemId))
    .leftJoin(qaDecider, eq(qaDecider.id, subcontractingGrnItems.qaDecidedBy));
}

export const scoReceiptRepository = {
  async findById(receiptId: number, tx?: Tx) {
    const [row] = await receiptQuery(tx ?? db)
      .where(eq(subcontractingGrns.id, receiptId))
      .limit(1);
    return row;
  },

  async listBySco(scoId: number) {
    return receiptQuery(db)
      .where(eq(subcontractingGrns.scoId, scoId))
      .orderBy(desc(subcontractingGrns.id));
  },

  async findLines(receiptId: number, tx?: Tx) {
    return lineQuery(tx ?? db)
      .where(eq(subcontractingGrnItems.scoGrnId, receiptId))
      .orderBy(asc(subcontractingGrnItems.id));
  },

  async findLine(receiptId: number, lineId: number, tx?: Tx) {
    const [row] = await lineQuery(tx ?? db)
      .where(
        and(
          eq(subcontractingGrnItems.id, lineId),
          eq(subcontractingGrnItems.scoGrnId, receiptId),
        ),
      )
      .limit(1);
    return row;
  },

  async findSettlements(receiptId: number, tx?: Tx) {
    const executor = tx ?? db;
    return executor
      .select({
        ...getTableColumns(scoReceiptSettlements),
        challanId: scoChallanLines.challanId,
        challanNumber: scoChallans.challanNumber,
        scoItemId: scoChallanLines.scoItemId,
      })
      .from(scoReceiptSettlements)
      .innerJoin(
        subcontractingGrnItems,
        eq(subcontractingGrnItems.id, scoReceiptSettlements.receiptItemId),
      )
      .innerJoin(
        scoChallanLines,
        eq(scoChallanLines.id, scoReceiptSettlements.challanLineId),
      )
      .innerJoin(scoChallans, eq(scoChallans.id, scoChallanLines.challanId))
      .where(eq(subcontractingGrnItems.scoGrnId, receiptId))
      .orderBy(asc(scoReceiptSettlements.id));
  },

  // Issue cost and settled qty of the challan lines one receipt line settled (BR-SCO-14).
  async findSettledCosts(receiptItemId: number, tx: Tx) {
    return tx
      .select({
        qty: scoReceiptSettlements.qty,
        unitIssueCostPaise: scoChallanLines.unitIssueCostPaise,
      })
      .from(scoReceiptSettlements)
      .innerJoin(
        scoChallanLines,
        eq(scoChallanLines.id, scoReceiptSettlements.challanLineId),
      )
      .where(eq(scoReceiptSettlements.receiptItemId, receiptItemId))
      .orderBy(asc(scoReceiptSettlements.id));
  },

  // Every challan line of an SCO with its settled qty (getscodetails read-out).
  async listChallanLinesForSco(scoId: number) {
    return db
      .select({
        challanId: scoChallans.id,
        challanNumber: scoChallans.challanNumber,
        challanLineId: scoChallanLines.id,
        scoItemId: scoChallanLines.scoItemId,
        qty: scoChallanLines.qty,
        settledQty: scoChallanLines.settledQty,
      })
      .from(scoChallanLines)
      .innerJoin(scoChallans, eq(scoChallans.id, scoChallanLines.challanId))
      .where(eq(scoChallans.scoId, scoId))
      .orderBy(asc(scoChallans.id), asc(scoChallanLines.id));
  },

  // Open challan lines of one SCO line, oldest challan first (BR-SCO-17).
  async lockOpenChallanLines(scoItemId: number, tx: Tx) {
    return tx
      .select({
        id: scoChallanLines.id,
        qty: scoChallanLines.qty,
        settledQty: scoChallanLines.settledQty,
        unitIssueCostPaise: scoChallanLines.unitIssueCostPaise,
        heatNumber: scoChallanLines.heatNumber,
      })
      .from(scoChallanLines)
      .innerJoin(scoChallans, eq(scoChallans.id, scoChallanLines.challanId))
      .where(
        and(
          eq(scoChallanLines.scoItemId, scoItemId),
          sql`${scoChallanLines.settledQty} < ${scoChallanLines.qty}`,
        ),
      )
      .orderBy(
        asc(scoChallans.challanDate),
        asc(scoChallans.id),
        asc(scoChallanLines.id),
      )
      .for("update", { of: scoChallanLines });
  },

  async addSettledQty(challanLineId: number, qty: number, tx: Tx) {
    await tx
      .update(scoChallanLines)
      .set({ settledQty: sql`${scoChallanLines.settledQty} + ${qty}` })
      .where(eq(scoChallanLines.id, challanLineId));
  },

  async vendorChallanExists(vendorId: number, vendorChallanNo: string, tx: Tx) {
    const [row] = await tx
      .select({ id: subcontractingGrns.id })
      .from(subcontractingGrns)
      .where(
        and(
          eq(subcontractingGrns.vendorId, vendorId),
          eq(subcontractingGrns.vendorChallanNo, vendorChallanNo),
        ),
      )
      .limit(1);
    return Boolean(row);
  },

  async insertReceipt(data: ReceiptInsert, tx: Tx) {
    const [row] = await tx
      .insert(subcontractingGrns)
      .values(data)
      .returning({ id: subcontractingGrns.id });
    if (!row) throw new Error("Receipt insert returned no row");
    return row.id;
  },

  async insertLine(data: ReceiptLineInsert, tx: Tx) {
    const [row] = await tx
      .insert(subcontractingGrnItems)
      .values(data)
      .returning({ id: subcontractingGrnItems.id });
    if (!row) throw new Error("Receipt line insert returned no row");
    return row.id;
  },

  async insertSettlement(
    data: typeof scoReceiptSettlements.$inferInsert,
    tx: Tx,
  ) {
    await tx.insert(scoReceiptSettlements).values(data);
  },

  async updateLine(lineId: number, data: ReceiptLineUpdate, tx: Tx) {
    await tx
      .update(subcontractingGrnItems)
      .set(data)
      .where(eq(subcontractingGrnItems.id, lineId));
  },

  async updateStatus(
    receiptId: number,
    status: typeof subcontractingGrns.$inferSelect.status,
    tx: Tx,
  ) {
    await tx
      .update(subcontractingGrns)
      .set({ status })
      .where(eq(subcontractingGrns.id, receiptId));
  },

  // Running counters on the SCO line; moved only by receipt / QA postings.
  async addCounters(
    scoItemId: number,
    delta: {
      unprocessedQty?: number;
      pendingQaQty?: number;
      acceptedQty?: number;
      rejectedQty?: number;
      lossQty?: number;
    },
    tx: Tx,
  ) {
    const t = subcontractingOrderItems;
    await tx
      .update(t)
      .set({
        unprocessedQty: sql`${t.unprocessedQty} + ${delta.unprocessedQty ?? 0}`,
        pendingQaQty: sql`${t.pendingQaQty} + ${delta.pendingQaQty ?? 0}`,
        acceptedQty: sql`${t.acceptedQty} + ${delta.acceptedQty ?? 0}`,
        rejectedQty: sql`${t.rejectedQty} + ${delta.rejectedQty ?? 0}`,
        lossQty: sql`${t.lossQty} + ${delta.lossQty ?? 0}`,
      })
      .where(eq(t.id, scoItemId));
  },

  async findVendorLocation(vendorId: number, tx: Tx) {
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
  },

  async findScrapYard(tx: Tx) {
    const [row] = await tx
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.type, "scrap_yard"))
      .orderBy(asc(locations.id))
      .limit(1);
    return row;
  },
};
