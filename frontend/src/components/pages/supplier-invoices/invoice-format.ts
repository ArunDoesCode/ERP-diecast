import { formatMoney, formatQty } from "@/lib/format";
import type { SinvDetail, SinvMismatch } from "@/types/supplier-invoice";

const CHECK_LABEL: Record<SinvMismatch["check"], string> = {
	qty: "Qty",
	price: "Price",
	tax: "Tax",
	tax_rate: "Tax rate",
	total: "Total",
	charge: "Charge not on PO",
};

const HEAD_LABEL = { cgst: "CGST", sgst: "SGST", igst: "IGST" } as const;

function amount(value: number, unit: SinvMismatch["unit"], uom: string | null) {
	if (unit === "paise") return formatMoney(value);
	if (unit === "milli_qty") return formatQty(value / 1000, uom, 3);
	return `${value / 100}%`;
}

/** Plain-words line for one failed check, e.g. "Price: PO ₹240.00, bill ₹241.00 (line 1)". */
export function describeMismatch(
	mismatch: SinvMismatch,
	invoice: Pick<SinvDetail, "lines">,
): string {
	const line =
		mismatch.lineId === null
			? undefined
			: invoice.lines.find((entry) => entry.id === mismatch.lineId);
	const uom = line?.uom ?? null;
	const expected = amount(mismatch.expected, mismatch.unit, uom);
	const billed = amount(mismatch.billed, mismatch.unit, uom);
	const where = line ? ` (line ${line.lineNo})` : "";
	switch (mismatch.check) {
		case "qty":
			return `Qty: billable ${expected}, billed ${billed}${where}`;
		case "price":
			return `Price: PO ${expected}, bill ${billed}${where}`;
		case "tax_rate":
			return `Tax rate: PO ${expected}, bill ${billed}${where}`;
		case "tax": {
			const head = mismatch.head ? ` ${HEAD_LABEL[mismatch.head]}` : "";
			return `Tax${head}: expected ${expected}, printed ${billed}`;
		}
		case "total":
			return `Total: expected ${expected}, printed ${billed}`;
		default:
			return `${CHECK_LABEL.charge}: ${billed}${where}`;
	}
}

export const HISTORY_ACTION_LABEL = {
	create: "Created",
	edit: "Edited",
	submit: "Submitted",
	back_to_draft: "Sent back to draft",
	release: "Released",
	cancel: "Cancelled",
	delete: "Deleted",
} as const;

export function bpText(bp: number | null): string {
	return bp === null ? "–" : `${bp / 100}%`;
}
