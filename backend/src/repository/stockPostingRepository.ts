import { and, desc, eq } from "drizzle-orm";

import type { db } from "../db/client";
import {
  inventoryLedger,
  itemMaster,
  locations,
} from "../db/schemas/02_procurement-catalog";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors";
import { assertMoneyInRange, assertStockValueInRange } from "../lib/money";

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

// BR-STD-43: thousandths x paise can pass 2^53, so products run in BigInt and
// are turned into a number only after the range check.
// qty x cost in paise, rounded half away from zero (BR-GRN-24).
function rowValuePaise(qtyMilli: number, unitCostPaise: number) {
  const product = BigInt(qtyMilli) * BigInt(unitCostPaise);
  const abs = product < 0n ? -product : product;
  const value = Number((abs + 500n) / 1000n);
  assertMoneyInRange(value);
  return qtyMilli < 0 ? -value : value;
}

// Math.round(numerator / divisor) (half up) for divisor > 0, exact in BigInt.
function divRound(numerator: bigint, divisor: bigint) {
  const n = 2n * numerator + divisor;
  const d = 2n * divisor;
  const q = n / d;
  return n % d < 0n ? q - 1n : q;
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

  // BR-INV-15: an inactive location takes no new postings (any path)
  const [location] = await tx
    .select({ isActive: locations.isActive })
    .from(locations)
    .where(eq(locations.id, input.locationId))
    .limit(1);
  if (!location) {
    throw new NotFoundError("Location not found");
  }
  if (!location.isActive) {
    throw new BadRequestError("Location is inactive");
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

  const oldMilli = toMilli(item.currentStock);
  const newMilli = oldMilli + qtyMilli;
  const effect =
    input.averageEffect ?? (qtyMilli > 0 ? "in" : ("none" as const));

  let averageCostPaise = item.averageCostPaise;
  const oldValue = BigInt(oldMilli) * BigInt(item.averageCostPaise);
  const inValue = BigInt(qtyMilli) * BigInt(input.unitCostPaise);
  if (effect === "in") {
    if (oldMilli <= 0) {
      averageCostPaise = input.unitCostPaise;
    } else if (newMilli > 0) {
      averageCostPaise = Number(divRound(oldValue + inValue, BigInt(newMilli)));
    }
  } else if (effect === "out_at_cost" && newMilli > 0) {
    // BR-GRN-39: a negative result keeps the old average.
    const candidate = Number(divRound(oldValue + inValue, BigInt(newMilli)));
    assertMoneyInRange(candidate);
    if (candidate >= 0) {
      averageCostPaise = candidate;
    }
  }
  assertMoneyInRange(averageCostPaise);
  assertStockValueInRange(newMilli, averageCostPaise);

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

  await tx
    .update(itemMaster)
    .set({ currentStock: fromMilli(newMilli), averageCostPaise })
    .where(eq(itemMaster.id, input.itemId));

  return created;
}
