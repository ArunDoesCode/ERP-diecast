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
	const get = (type: string) =>
		IST_PARTS.formatToParts(d).find((p) => p.type === type)?.value ?? "";
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

/** Paise to rupees. `whole: true` drops the paise. */
export function formatMoney(
	paise: number | null | undefined,
	opts?: { whole?: boolean },
): string {
	if (paise === null || paise === undefined || !Number.isFinite(paise)) {
		return EMPTY;
	}
	const negative = paise < 0;
	const abs = Math.abs(Math.round(paise));
	const rupees = Math.floor(abs / 100);
	const rest = abs % 100;
	const body = INR_INT.format(rupees);
	const text = opts?.whole
		? `₹${body}`
		: `₹${body}.${String(rest).padStart(2, "0")}`;
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

/** Document number as shown (trimmed); null or empty -> `–`. */
export function formatDocNo(value: string | null | undefined): string {
	const t = value?.trim();
	return t ? t : EMPTY;
}
