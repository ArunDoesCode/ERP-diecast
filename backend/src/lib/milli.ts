// Quantities are numeric(14,3): the sale-order code adds and compares them as
// whole thousandths (integers), never as floats.

/** Thousandths of a quantity given as a number or a numeric string. */
export const toMilli = (v: number | string | null | undefined): number =>
  Math.round(Number(v ?? 0) * 1000);

/** A thousandths integer as a numeric(14,3) string. */
export const milliToString = (m: number): string => (m / 1000).toFixed(3);

/** A thousandths integer as a JSON number. */
export const milliToNumber = (m: number): number => m / 1000;
