import { MAX_MONEY_PAISE } from "@/lib/money";
import type { QuoteLine, QuoteLineInput, RfqLine } from "@/types/rfq";

/** One editable row of the quote form; money fields hold rupees as typed. */
export type QuoteRow = {
	rfqItemId: number;
	itemCode: string;
	itemName: string;
	qty: number;
	uom: string;
	notQuoted: boolean;
	rate: string;
	gst: string;
	lead: string;
	freight: string;
};

export function emptyRows(lines: RfqLine[]): QuoteRow[] {
	return lines
		.filter((line) => line.lineStatus === "open" && !line.prLineCancelled)
		.map((line) => ({
			rfqItemId: line.id,
			itemCode: line.itemCode,
			itemName: line.itemName,
			qty: line.qty,
			uom: line.uom,
			notQuoted: false,
			rate: "",
			gst: "",
			lead: "",
			freight: "",
		}));
}

export function rowsFromQuote(lines: QuoteLine[]): QuoteRow[] {
	return lines.map((line) => ({
		rfqItemId: line.rfqItemId,
		itemCode: line.itemCode,
		itemName: line.itemName,
		qty: line.qty,
		uom: line.uom,
		notQuoted: !line.isQuoted,
		rate: line.ratePaise != null ? String(line.ratePaise / 100) : "",
		gst: line.gstPercent != null ? String(line.gstPercent) : "",
		lead: line.leadDays != null ? String(line.leadDays) : "",
		freight: line.freightPaise ? String(line.freightPaise / 100) : "",
	}));
}

export function toPaise(text: string): number | null {
	const trimmed = text.trim();
	if (trimmed === "" || !/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
	return Math.round(Number(trimmed) * 100);
}

export type RowCalc = {
	valuePaise: number;
	taxPaise: number;
	landedPerUnitPaise: number;
};

/** Display only (BR-RFQ-16): landed per unit = rate + whole-line freight / qty; the server value wins on save. */
export function calcRow(row: QuoteRow): RowCalc | null {
	const rate = toPaise(row.rate);
	if (row.notQuoted || rate === null || row.qty <= 0) return null;
	const freight = toPaise(row.freight) ?? 0;
	const gst = Number(row.gst || 0);
	const valuePaise = Math.round(rate * row.qty);
	return {
		valuePaise,
		taxPaise: Math.round((valuePaise * gst) / 100),
		landedPerUnitPaise: Math.round(rate + freight / row.qty),
	};
}

/** Error text per row for the typed values, or null when the row is fine. */
export function rowError(row: QuoteRow): string | null {
	if (row.notQuoted) return null;
	const rate = toPaise(row.rate);
	if (rate === null || rate < 1)
		return "Enter the rate in rupees (up to 2 decimals).";
	if (rate > MAX_MONEY_PAISE) return "Rate is too large.";
	if (row.gst === "") return "Pick the GST %.";
	if (row.lead !== "") {
		const lead = Number(row.lead);
		if (!Number.isInteger(lead) || lead < 0 || lead > 365)
			return "Lead days: a whole number from 0 to 365.";
	}
	if (row.freight !== "") {
		const freight = toPaise(row.freight);
		if (freight === null || freight > 1_000_000_000_000)
			return "Freight: rupees, up to 2 decimals.";
	}
	return null;
}

export function toLineInputs(rows: QuoteRow[]): QuoteLineInput[] {
	return rows.map((row) => {
		if (row.notQuoted) return { rfqItemId: row.rfqItemId, isQuoted: false };
		const input: QuoteLineInput = {
			rfqItemId: row.rfqItemId,
			isQuoted: true,
			ratePaise: toPaise(row.rate) ?? 0,
			gstPercent: Number(row.gst),
		};
		if (row.lead !== "") input.leadDays = Number(row.lead);
		if (row.freight !== "") input.freightPaise = toPaise(row.freight) ?? 0;
		return input;
	});
}
