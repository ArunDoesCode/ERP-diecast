import { formatQty } from "@/lib/format";
import { ST_WHOLE_NUMBER_UNITS } from "@/types/stock-transfer";

/** Client check for a typed qty: > 0, <= 1e9, at most 3 decimals, whole for pcs / set. Null = fine. */
export function transferQtyError(raw: string, unit: string | null) {
	const text = raw.trim();
	if (text === "") return "Enter a quantity";
	const qty = Number(text);
	if (!Number.isFinite(qty) || qty <= 0) return "Quantity must be more than 0";
	if (qty > 1e9) return "Quantity is too large";
	if (Math.abs(qty * 1000 - Math.round(qty * 1000)) > 1e-6) {
		return "Use at most 3 decimals";
	}
	if (
		unit &&
		(ST_WHOLE_NUMBER_UNITS as readonly string[]).includes(unit.toLowerCase()) &&
		!Number.isInteger(qty)
	) {
		return `${unit} must be a whole number`;
	}
	return null;
}

/** Quantity through `formatQty`, with only the decimals the number needs (1,500 kg; 12.5 kg; max 3). */
export function transferQty(
	value: number | string | null | undefined,
	unit: string | null,
) {
	const n = Number(value);
	if (value === null || value === undefined || !Number.isFinite(n)) {
		return formatQty(value, unit, 0);
	}
	const decimals = Math.min(
		3,
		(Math.abs(n).toFixed(3).split(".")[1] ?? "").replace(/0+$/, "").length,
	);
	return formatQty(n, unit, decimals);
}
