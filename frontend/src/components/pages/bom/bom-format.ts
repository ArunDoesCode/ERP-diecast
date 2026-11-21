import { formatQty } from "@/lib/format";

/** pcs and set are whole numbers; kg, ltr and m show 3 decimals (spec: formatQty 3 dec). */
export function qtyDecimals(unit: string | null | undefined): number {
	return unit === "pcs" || unit === "set" ? 0 : 3;
}

export function formatBomQty(value: number | null | undefined, unit: string) {
	return formatQty(value, unit, qtyDecimals(unit));
}

export function formatPct(value: number | null | undefined) {
	if (value === null || value === undefined) return "–";
	return `${formatQty(value, null, 2)} %`;
}

export function formatKg(value: number | null | undefined) {
	return formatQty(value, "kg", 3);
}
