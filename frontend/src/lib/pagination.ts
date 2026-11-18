/** "1 to 25 of 41"; total 0 → "0 of 0". */
export function formatPageRange(
	page: number,
	pageSize: number,
	total: number,
): string {
	if (total <= 0) return "0 of 0";
	const from = (page - 1) * pageSize + 1;
	const to = Math.min(page * pageSize, total);
	return `${from} to ${to} of ${total}`;
}

/** Page numbers to render, with null for an ellipsis gap. First, last and current are always present. */
export function getPageNumbers(
	page: number,
	pageCount: number,
): Array<number | null> {
	if (pageCount <= 7) {
		return Array.from({ length: Math.max(pageCount, 1) }, (_, i) => i + 1);
	}
	const wanted = new Set<number>([1, pageCount, page - 1, page, page + 1]);
	const sorted = [...wanted]
		.filter((n) => n >= 1 && n <= pageCount)
		.sort((a, b) => a - b);
	const out: Array<number | null> = [];
	let prev = 0;
	for (const n of sorted) {
		if (prev !== 0 && n - prev === 2) out.push(prev + 1);
		else if (prev !== 0 && n - prev > 2) out.push(null);
		out.push(n);
		prev = n;
	}
	return out;
}
