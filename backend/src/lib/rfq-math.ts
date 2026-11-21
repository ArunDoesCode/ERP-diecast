import { BadRequestError } from "./errors";
import { AMOUNT_TOO_LARGE, assertMoneyInRange } from "./money";

// Freight for a whole quote line: at most 1,000,000,000,000 paise (BR-RFQ-30, 74).
export const MAX_FREIGHT_PAISE = 1_000_000_000_000;

/** Allowed GST % values (BR-SUP-13, same list as PO lines). */
export const GST_SLABS: readonly number[] = [
  0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40,
];

export const isGstSlab = (value: number) => GST_SLABS.includes(value);

/** Rounds a quantity to 3 decimals (numeric(14,3) columns, BR-RFQ-03). */
export const round3 = (value: number) => Math.round(value * 1000) / 1000;

/**
 * BR-PO-04 / BR-RFQ-16: line value = round(qty x rate); tax = round(value x GST% / 100).
 * GST % goes to whole basis points first so the maths is integer only. Throws
 * 400 AMOUNT_TOO_LARGE above MAX_MONEY_PAISE.
 */
export function computeLinePaise(
  qty: number,
  unitPricePaise: number,
  gstPercent: number,
) {
  const lineValuePaise = Math.round(qty * unitPricePaise);
  const lineTaxPaise = Math.round(
    (lineValuePaise * Math.round(gstPercent * 100)) / 10000,
  );
  assertMoneyInRange(lineValuePaise);
  assertMoneyInRange(lineTaxPaise);
  return { lineValuePaise, lineTaxPaise };
}

/** BR-RFQ-16: landed rate per unit = rate + round(freight / qty). */
export function landedRatePaise(
  ratePaise: number,
  freightPaise: number,
  qty: number,
) {
  return ratePaise + Math.round(freightPaise / qty);
}

/** 400 AMOUNT_TOO_LARGE when freight is above 1e12 paise (BR-RFQ-74). */
export function assertFreightInRange(freightPaise: number) {
  if (!Number.isFinite(freightPaise) || freightPaise > MAX_FREIGHT_PAISE) {
    throw new BadRequestError(
      "Freight is above the largest value allowed.",
      AMOUNT_TOO_LARGE,
    );
  }
}

/** Contract cap = agreed qty x (1 + allowance %), floored to 3 decimals (BR-RFQ-52). */
export function contractCapQty(agreedQty: number, allowancePercent: number) {
  // work in thousandths and basis points so the product is exact
  const milli = Math.round(agreedQty * 1000);
  const bp = Math.round(allowancePercent * 100);
  return Math.floor((milli * (10000 + bp)) / 10000) / 1000;
}

/** Percent with one decimal, null when there is nothing to divide by. */
export function percentOf(part: number, whole: number | null) {
  if (whole === null || whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

/** True for a real calendar day written YYYY-MM-DD. */
export function isRealDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Whole rupees with Indian grouping, 2 decimals: 200000 paise -> "2,000.00". */
export function formatRupees(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

/**
 * BR-RFQ-21, 23: the lowest landed rate wins; a tie goes to fewer lead days (no lead
 * days counts as the most), then to the earlier submit time. Returns the winner's key,
 * or null for no candidates.
 */
export function pickLowest<
  T extends {
    landedRatePaise: number;
    leadDays: number | null;
    submittedAt: Date | null;
  },
>(candidates: T[]): T | null {
  let best: T | null = null;
  for (const c of candidates) {
    if (best === null) {
      best = c;
      continue;
    }
    if (c.landedRatePaise !== best.landedRatePaise) {
      if (c.landedRatePaise < best.landedRatePaise) best = c;
      continue;
    }
    const cl = c.leadDays ?? Number.POSITIVE_INFINITY;
    const bl = best.leadDays ?? Number.POSITIVE_INFINITY;
    if (cl !== bl) {
      if (cl < bl) best = c;
      continue;
    }
    const ct = c.submittedAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const bt = best.submittedAt?.getTime() ?? Number.POSITIVE_INFINITY;
    if (ct < bt) best = c;
  }
  return best;
}
