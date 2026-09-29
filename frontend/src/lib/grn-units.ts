// Whole-number units — must match the backend list (pcs, set, sets, nos).
export const WHOLE_UOMS = ["pcs", "set", "sets", "nos"];

export function isWholeUom(uom?: string | null) {
	return !!uom && WHOLE_UOMS.includes(uom.trim().toLowerCase());
}

export function qtyStep(uom?: string | null): number | "any" {
	return isWholeUom(uom) ? 1 : "any";
}
