// Whole-number units (BR-GRN-02). Source of truth: WHOLE_NUMBER_UNITS in
// backend/src/types/grn.types.ts; a backend contract test keeps this copy equal (#31).
export const WHOLE_UOMS = ["pcs", "set", "sets", "nos"];

export function isWholeUom(uom?: string | null) {
	return !!uom && WHOLE_UOMS.includes(uom.trim().toLowerCase());
}

export function qtyStep(uom?: string | null): number | "any" {
	return isWholeUom(uom) ? 1 : "any";
}

// BR-GRN-47: same sum as the server (BR-GRN-15), in thousandths — PO line qty
// accepted so far (all earlier GRNs) + this accepted qty > ordered × 1.05.
export function exceedsOverReceiptTolerance(
	orderedQty: number,
	poReceivedQty: number,
	acceptedQty: number,
) {
	const toMilli = (qty: number) => Math.round(qty * 1000);
	const toleranceMilli = Math.round(toMilli(orderedQty) * 1.05);
	return toMilli(poReceivedQty) + toMilli(acceptedQty) > toleranceMilli;
}
