import { PRT_WHOLE_NUMBER_UNITS } from "@/types/purchase-return";

/** Whole numbers for piece-like units, 3 decimals otherwise (BR-PRT-04). */
export function prtQtyDecimals(uom: string | null | undefined) {
	return (PRT_WHOLE_NUMBER_UNITS as readonly string[]).includes(
		(uom ?? "").toLowerCase(),
	)
		? 0
		: 3;
}

/** Round half away from zero, as the server does (BR-PRT-31). */
function roundPaise(value: number) {
	return Math.sign(value) * Math.round(Math.abs(value));
}

/** Preview of one line's debit note value in paise; the server stays the judge. */
export function previewLineTotalPaise(
	qty: number,
	ratePaise: number,
	gstPercent: number,
) {
	const taxable = roundPaise(qty * ratePaise);
	return taxable + roundPaise((taxable * gstPercent) / 100);
}

/** Why a typed quantity is wrong, or null when it is fine. */
export function qtyError(
	text: string,
	uom: string,
	cap: number,
): string | null {
	const t = text.trim();
	if (t === "") return "Enter a quantity";
	const n = Number(t);
	if (!Number.isFinite(n) || n <= 0) return "Quantity must be more than 0";
	const decimals = prtQtyDecimals(uom);
	if (decimals === 0 && !Number.isInteger(n)) {
		return `${uom} must be a whole number`;
	}
	const places = t.split(".")[1]?.length ?? 0;
	if (places > 3) return "Up to 3 decimals";
	if (n > cap + 1e-9) return `Only ${cap} ${uom} left to return`;
	return null;
}
