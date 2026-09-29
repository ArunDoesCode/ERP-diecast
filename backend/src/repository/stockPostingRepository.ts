import { and, desc, eq } from "drizzle-orm";

import type { db } from "../db/client";
import {
  inventoryLedger,
  itemMaster,
} from "../db/schemas/02_procurement-catalog";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type PostStockInput = {
  itemId: number;
  locationId: number;
  transactionType: (typeof inventoryLedger.$inferInsert)["transactionType"];
  referenceType: (typeof inventoryLedger.$inferInsert)["referenceType"];
  referenceId: number;
  referenceLineId?: number | null;
  batchNumber?: string | null | undefined;
  quantityChange: number;
  unitCostPaise: number;
  notes?: string | null | undefined;
  createdBy: number;
  // How the posting moves the item's moving average (BR-GRN-38, 39):
  //  - "in": weighted into the average (default for a positive quantity)
  //  - "out_at_cost": value removed at unitCostPaise (GRN correction)
  //  - "none": average untouched (default for a negative quantity)
  // Value the row at the item's current average instead of unitCostPaise
  // (manual stock-out, BR-GRN-44).
  valueAtAverage?: boolean;
  // Refuse a posting that takes the item+location balance below zero (BR-GRN-33).
  blockNegative?: boolean;
  averageEffect?: "in" | "out_at_cost" | "none";
};

// Quantities are exact to 3 decimals: all math runs on integer thousandths.
const toMilli = (qty: number) => Math.round(qty * 1000);
const fromMilli = (milli: number) => milli / 1000;

const INT4_MAX = 2_147_483_647; // ledger value columns are integer

// qty x cost in paise, rounded half away from zero (BR-GRN-24).
function rowValuePaise(qtyMilli: number, unitCostPaise: number) {
  const magnitude = Math.round(Math.abs(qtyMilli * unitCostPaise) / 1000);
  if (magnitude > INT4_MAX) {
    throw new BadRequestError("Row value is too large");
  }
  return qtyMilli < 0 ? -magnitude : magnitude;
}

// Runs inside the caller's transaction. The item row is locked first (also for
// the first posting of a new item+location), so postings of one item are
// serialised (BR-GRN-42). Writes one ledger row and updates the item's current
// stock and moving average (BR-GRN-37, 38, 39).
export async function postStock(tx: Tx, input: PostStockInput) {
  const [item] = await tx
    .select({
      currentStock: itemMaster.currentStock,
      averageCostPaise: itemMaster.averageCostPaise,
    })
    .from(itemMaster)
    .where(eq(itemMaster.id, input.itemId))
    .limit(1)
    .for("update");
  if (!item) {
    throw new NotFoundError("Item not found");
  }

  // id order, not createdAt: created_at is the transaction start time.
  const [lastRow] = await tx
    .select({ balanceAfter: inventoryLedger.balanceAfter })
    .from(inventoryLedger)
    .where(
      and(
        eq(inventoryLedger.itemId, input.itemId),
        eq(inventoryLedger.locationId, input.locationId),
      ),
    )
    .orderBy(desc(inventoryLedger.id))
    .limit(1);

  const qtyMilli = toMilli(input.quantityChange);
  const balanceMilli = toMilli(lastRow?.balanceAfter ?? 0) + qtyMilli;
  if (input.blockNegative && balanceMilli < 0) {
    throw new ConflictError("Insufficient stock at this location");
  }
  const balanceAfter = fromMilli(balanceMilli);
  const unitCostPaise = input.valueAtAverage
    ? item.averageCostPaise
    : input.unitCostPaise;

  const [created] = await tx
    .insert(inventoryLedger)
    .values({
      itemId: input.itemId,
      locationId: input.locationId,
      batchNumber: input.batchNumber ?? null,
      transactionType: input.transactionType,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      referenceLineId: input.referenceLineId ?? null,
      quantityChange: fromMilli(qtyMilli),
      balanceAfter,
      unitCostPaise,
      totalValueChangePaise: rowValuePaise(qtyMilli, unitCostPaise),
      notes: input.notes ?? null,
      createdBy: input.createdBy,
    })
    .returning();

  const oldMilli = toMilli(item.currentStock);
  const newMilli = oldMilli + qtyMilli;
  const effect =
    input.averageEffect ?? (qtyMilli > 0 ? "in" : ("none" as const));

  let averageCostPaise = item.averageCostPaise;
  if (effect === "in") {
    averageCostPaise =
      oldMilli <= 0
        ? input.unitCostPaise
        : Math.round(
            (oldMilli * item.averageCostPaise +
              qtyMilli * input.unitCostPaise) /
              newMilli,
          );
  } else if (effect === "out_at_cost" && newMilli > 0) {
    // BR-GRN-39: a negative result keeps the old average.
    const candidate = Math.round(
      (oldMilli * item.averageCostPaise + qtyMilli * input.unitCostPaise) /
        newMilli,
    );
    if (candidate >= 0) {
      averageCostPaise = candidate;
    }
  }

  await tx
    .update(itemMaster)
    .set({ currentStock: fromMilli(newMilli), averageCostPaise })
    .where(eq(itemMaster.id, input.itemId));

  return created;
}
