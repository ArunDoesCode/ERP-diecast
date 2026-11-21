/**
 * Shared formatting (BR-DS-18). Dates in IST `28 Nov 2026`, money `₹4,82,000.00`
 * (Indian grouping, integer paise in), null or undefined -> `–`.
 */

const EMPTY = "–";

const IST_PARTS = new Intl.DateTimeFormat("en-US", {
	timeZone: "Asia/Kolkata",
	day: "numeric",
	month: "short",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	hourCycle: "h23",
});

const INR_INT = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

function istParts(iso: string | null | undefined) {
	if (iso === null || iso === undefined || iso === "") return null;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return null;
	const map: Record<string, string> = {};
	for (const part of IST_PARTS.formatToParts(d)) map[part.type] = part.value;
	const get = (type: string) => map[type] ?? "";
	return {
		day: get("day"),
		month: get("month"),
		year: get("year"),
		hour: get("hour"),
		minute: get("minute"),
	};
}

/** `28 Nov 2026` in IST. */
export function formatDate(iso: string | null | undefined): string {
	const p = istParts(iso);
	return p ? `${p.day} ${p.month} ${p.year}` : EMPTY;
}

/** `28 Nov 2026, 14:05` in IST. */
export function formatDateTime(iso: string | null | undefined): string {
	const p = istParts(iso);
	return p ? `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute}` : EMPTY;
}

/** Paise to rupees. `whole: true` rounds to the nearest rupee. */
export function formatMoney(
	paise: number | null | undefined,
	opts?: { whole?: boolean },
): string {
	if (paise === null || paise === undefined || !Number.isFinite(paise)) {
		return EMPTY;
	}
	const whole = opts?.whole === true;
	// Round first so the sign follows the displayed amount (no `-₹0.00`).
	// Halves round away from zero, so -₹2.50 shows -₹3 like ₹2.50 shows ₹3.
	const roundHalfAway = (n: number) => Math.sign(n) * Math.round(Math.abs(n));
	const units = roundHalfAway(whole ? paise / 100 : paise);
	const negative = units < 0;
	const abs = Math.abs(units);
	const rupees = whole ? abs : Math.floor(abs / 100);
	const body = INR_INT.format(rupees);
	const text = whole
		? `₹${body}`
		: `₹${body}.${String(abs % 100).padStart(2, "0")}`;
	return negative ? `-${text}` : text;
}

/** Quantity with `decimals` places and the unit, e.g. `12.500 kg`. */
export function formatQty(
	value: number | string | null | undefined,
	unit: string | null | undefined,
	decimals: number,
): string {
	if (value === null || value === undefined || value === "") return EMPTY;
	const n = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(n)) return EMPTY;
	const text = n.toLocaleString("en-IN", {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	});
	return unit ? `${text} ${unit}` : text;
}

/** Quantity with only the decimals the number needs (1,500 kg; 12.5 kg; 280 pcs; max 3). */
export function formatQtyTrim(
	value: number | string | null | undefined,
	unit: string | null | undefined,
): string {
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

/** Document number as shown (trimmed); null or empty -> `–`. */
export function formatDocNo(value: string | null | undefined): string {
	const t = value?.trim();
	return t ? t : EMPTY;
}

/**
 * Percent from integer tenths (800 -> `80.0 %`). `signed` adds `+` on positives (`+5.0 %`).
 * null or undefined -> `No data` (BR-SRT-23), or `empty` when given.
 */
export function formatPercentTenths(
	tenths: number | null | undefined,
	opts?: { signed?: boolean; empty?: string },
): string {
	if (tenths === null || tenths === undefined || !Number.isFinite(tenths)) {
		return opts?.empty ?? "No data";
	}
	const value = (tenths / 10).toFixed(1);
	const sign = opts?.signed === true && tenths > 0 ? "+" : "";
	return `${sign}${value} %`;
}
