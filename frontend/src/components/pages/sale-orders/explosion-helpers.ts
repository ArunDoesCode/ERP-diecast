import type { SoExplosionRow } from "@/types/sale-order";

export type RowPick = {
	qty: string;
	vendorId?: number;
	returnDate: string;
};

/** Key into `statusTone.soRowTag` for a row, or null when the row has no tag. */
export function soRowTagKey(row: SoExplosionRow) {
	if (row.blockReason === "inactive_item") return "inactive";
	if (row.blockReason === "bom_loop") return "loop";
	if (row.blockReason === "no_active_bom") return "no_bom";
	return row.tag;
}

export type CanRaise = { pr: boolean; sco: boolean };

/** A pick box shows when the server says so, the row is not raised yet and the user holds the key. */
export function isPickable(
	row: SoExplosionRow,
	allowed: CanRaise,
	runOpen: boolean,
) {
	if (!runOpen || !row.selectable || row.raised) return false;
	if (row.type === "buy") return allowed.pr;
	if (row.type === "job_work") return allowed.sco;
	return false;
}

export function planText(row: SoExplosionRow) {
	if (row.type === "cast") {
		return row.pourQty !== null
			? `Plan: cast ${row.netQty}, pour ${row.pourQty}`
			: `Plan: cast ${row.netQty}`;
	}
	if (row.type === "assemble") return `Plan: assemble ${row.netQty}`;
	return null;
}
