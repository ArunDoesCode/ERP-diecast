/**
 * Shared formatting (BR-DS-18). Dates in IST `28 Nov 2026`, money `₹4,82,000.00`
 * (Indian grouping, integer paise in), null or undefined -> `–`. Stubs: bodies land in slice B.
 */

/** `28 Nov 2026` in IST. */
export function formatDate(_iso: string | null | undefined): string {
	throw new Error("not implemented");
}

/** `28 Nov 2026, 14:05` in IST. */
export function formatDateTime(_iso: string | null | undefined): string {
	throw new Error("not implemented");
}

/** Paise to rupees. `whole: true` drops the paise. */
export function formatMoney(
	_paise: number | null | undefined,
	_opts?: { whole?: boolean },
): string {
	throw new Error("not implemented");
}

/** Quantity with `decimals` places and the unit, e.g. `12.500 kg`. */
export function formatQty(
	_value: number | string | null | undefined,
	_unit: string | null | undefined,
	_decimals: number,
): string {
	throw new Error("not implemented");
}

/** Document number as shown (trimmed); null or empty -> `–`. */
export function formatDocNo(_value: string | null | undefined): string {
	throw new Error("not implemented");
}
