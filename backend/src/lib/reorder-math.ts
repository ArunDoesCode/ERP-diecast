// Reorder order-qty maths on integer thousandths (BR-RO-06, 07, 08).
// Same function for the live list and the run, so the screen shows what the
// run will raise.

/** Units that take whole numbers only (BR-INV-07/08). */
const WHOLE_UNITS = new Set(["pcs", "set"]);

export type OrderQtyInput = {
  /** ceil(reorder level - projected) in thousandths, >= 0 for a low item. */
  shortfallMilli: number;
  reorderQtyMilli: number;
  minOrderMilli: number;
  multipleMilli: number;
  uom: string;
};

/** Final order qty in thousandths: > 0 whenever the shortfall or reorder qty is > 0. */
export function computeOrderMilli(input: OrderQtyInput): number {
  // BR-RO-06 larger of reorder qty and shortfall; BR-RO-07 min order qty.
  let qty = Math.max(
    input.reorderQtyMilli,
    input.shortfallMilli,
    input.minOrderMilli,
  );
  // BR-RO-07 round up to a whole number of the order multiple.
  if (input.multipleMilli > 0) {
    qty = Math.ceil(qty / input.multipleMilli) * input.multipleMilli;
  }
  // BR-RO-08 whole units for pcs / set (rounded up).
  if (WHOLE_UNITS.has(input.uom)) {
    qty = Math.ceil(qty / 1000) * 1000;
  }
  return qty;
}
