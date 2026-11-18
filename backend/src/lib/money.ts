import { BadRequestError } from "./errors";

// BR-STD-16 / BR-STD-39: one stored amount (paise) never exceeds Rs 10,000 crore.
export const MAX_MONEY_PAISE = 10_000_000_000_000;
// BR-STD-43: item stock value (stock x average cost) stays just under 2^53 - 1,
// so the read-only `currentStock x averageCostPaise` is an exact integer.
export const MAX_STOCK_VALUE_PAISE = 9_000_000_000_000_000;

export const AMOUNT_TOO_LARGE = "AMOUNT_TOO_LARGE";
export const AMOUNT_TOO_LARGE_MESSAGE =
  "Amount is above the largest value allowed (₹10,000 crore).";

function tooLarge(message = AMOUNT_TOO_LARGE_MESSAGE) {
  return new BadRequestError(message, AMOUNT_TOO_LARGE);
}

/** Throws 400 AMOUNT_TOO_LARGE when |valuePaise| is above MAX_MONEY_PAISE (or not a finite number). */
export function assertMoneyInRange(valuePaise: number): void {
  if (!Number.isFinite(valuePaise) || Math.abs(valuePaise) > MAX_MONEY_PAISE) {
    throw tooLarge();
  }
}

/**
 * Stock in thousandths must be a safe integer, and stock value
 * (|stockMilli| x average cost / 1,000) must be at most MAX_STOCK_VALUE_PAISE.
 * The product is done in BigInt so the check itself is exact.
 */
export function assertStockValueInRange(
  stockMilli: number,
  averageCostPaise: number,
): void {
  if (
    !Number.isSafeInteger(stockMilli) ||
    !Number.isSafeInteger(averageCostPaise)
  ) {
    throw tooLarge("Stock value is above the largest value allowed.");
  }
  const abs = BigInt(Math.abs(stockMilli));
  const value = (abs * BigInt(Math.abs(averageCostPaise))) / 1000n;
  if (value > BigInt(MAX_STOCK_VALUE_PAISE)) {
    throw tooLarge("Stock value is above the largest value allowed.");
  }
}

/** Driver bigint (text) / bigint / number -> number, only when it is a safe integer. */
export function toSafePaise(value: string | number | bigint): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(n)) {
    throw tooLarge();
  }
  return n;
}
