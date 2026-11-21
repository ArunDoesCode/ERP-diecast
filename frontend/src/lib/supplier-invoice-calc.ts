/**
 * Live "what the server will say" for the invoice entry form (screens.md, Invoice entry).
 * Same rules as BR-SINV-13..16, 19..22, 40, 41; the server result at save/submit is final.
 * All money is integer paise, quantities are compared in milli-units.
 */
import {
	SINV_WEIGHT_UNITS,
	SINV_WHOLE_NUMBER_UNITS,
	type SinvCheck,
	type SinvTaxType,
} from "@/types/supplier-invoice";

/** Rupee text ("241.00", "1,200") to paise; null when empty, negative, or more than 2 decimals. */
export function rupeesToPaise(text: string): number | null {
	const clean = text.replace(/,/g, "").trim();
	if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
	const [whole, frac = ""] = clean.split(".");
	return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

/** Paise to a plain rupee text for an input ("241.00"). */
export function paiseToRupeeText(paise: number): string {
	const abs = Math.abs(paise);
	const sign = paise < 0 ? "-" : "";
	return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Qty text to a number; null when not > 0, over 3 decimals, or fractional for a whole-number unit. */
export function parseQty(text: string, uom: string | null): number | null {
	const clean = text.trim();
	if (!/^\d+(\.\d{1,3})?$/.test(clean)) return null;
	const value = Number(clean);
	if (!(value > 0)) return null;
	const whole = (SINV_WHOLE_NUMBER_UNITS as readonly string[]).includes(
		(uom ?? "").toLowerCase(),
	);
	if (whole && !Number.isInteger(value)) return null;
	return value;
}

export function isWeightUnit(uom: string | null): boolean {
	return (SINV_WEIGHT_UNITS as readonly string[]).includes(
		(uom ?? "").toLowerCase(),
	);
}

export function toMilli(qty: number): number {
	return Math.round(qty * 1000);
}

export function gstPercentToBp(percent: number): number {
	return Math.round(percent * 100);
}

/** Percent text from the tolerance setting to basis points. */
export function percentToBp(percent: number): number {
	return Math.round(percent * 100);
}

/** Half up for non-negative integers. */
function roundDiv(numerator: number, denominator: number): number {
	return Math.floor((numerator * 2 + denominator) / (denominator * 2));
}

export function lineTaxable(qty: number, ratePaise: number): number {
	return Math.round(qty * ratePaise);
}

export type TaxHeads = { cgst: number; sgst: number; igst: number };

export function lineTax(
	taxablePaise: number,
	gstBp: number,
	taxType: SinvTaxType | null,
): TaxHeads {
	if (taxType === "cgst_sgst") {
		const half = roundDiv(taxablePaise * gstBp, 20000);
		return { cgst: half, sgst: half, igst: 0 };
	}
	if (taxType === "igst") {
		return { cgst: 0, sgst: 0, igst: roundDiv(taxablePaise * gstBp, 10000) };
	}
	return { cgst: 0, sgst: 0, igst: 0 };
}

/** Tax type from GSTINs (BR-SINV-14). null = plant state unknown here, the server decides on save. */
export function guessTaxType(
	supplierGstin: string | null,
	plantStateCode: string | null,
): SinvTaxType | null {
	if (!supplierGstin) return "none";
	if (!plantStateCode) return null;
	return supplierGstin.slice(0, 2) === plantStateCode.trim()
		? "cgst_sgst"
		: "igst";
}

export type CalcLine = {
	qty: number;
	ratePaise: number;
	gstBp: number;
};
export type CalcCharge = { taxablePaise: number; gstBp: number };

export type Totals = {
	taxable: number;
	cgst: number;
	sgst: number;
	igst: number;
	total: number;
	/** Total GST at the full rate, whatever the head split; used while the tax type is unknown. */
	gstTotal: number;
};

export function computeTotals(
	lines: CalcLine[],
	charges: CalcCharge[],
	taxType: SinvTaxType | null,
): Totals {
	const totals: Totals = {
		taxable: 0,
		cgst: 0,
		sgst: 0,
		igst: 0,
		total: 0,
		gstTotal: 0,
	};
	const add = (taxable: number, gstBp: number) => {
		totals.taxable += taxable;
		const heads = lineTax(taxable, gstBp, taxType);
		totals.cgst += heads.cgst;
		totals.sgst += heads.sgst;
		totals.igst += heads.igst;
		totals.gstTotal +=
			taxType === "none" ? 0 : roundDiv(taxable * gstBp, 10000);
	};
	for (const line of lines)
		add(lineTaxable(line.qty, line.ratePaise), line.gstBp);
	for (const charge of charges) add(charge.taxablePaise, charge.gstBp);
	totals.total =
		taxType === null
			? totals.taxable + totals.gstTotal
			: totals.taxable + totals.cgst + totals.sgst + totals.igst;
	return totals;
}

export type LineMatchInput = {
	uom: string | null;
	qty: number;
	ratePaise: number;
	gstBp: number;
	billableQty: number;
	poRatePaise: number;
	poGstBp: number;
};

export type LineMatch = { checks: SinvCheck[]; belowPoRate: boolean };

/** Per-line checks (BR-SINV-21, 22, 40) in whole numbers. */
export function matchLine(
	input: LineMatchInput,
	priceTolBp: number,
	weightTolBp: number,
): LineMatch {
	const checks: SinvCheck[] = [];
	const qtyTolBp = isWeightUnit(input.uom) ? weightTolBp : 0;
	if (
		toMilli(input.qty) * 10000 >
		toMilli(input.billableQty) * (10000 + qtyTolBp)
	) {
		checks.push("qty");
	}
	if (input.ratePaise * 10000 > input.poRatePaise * (10000 + priceTolBp)) {
		checks.push("price");
	}
	if (input.gstBp !== input.poGstBp) checks.push("tax_rate");
	return { checks, belowPoRate: input.ratePaise < input.poRatePaise };
}

/** BR-SINV-19, 20: printed vs computed may differ by at most ₹1.00. */
export const PRINTED_TOLERANCE_PAISE = 100;

export function overTolerance(computed: number, printed: number): boolean {
	return Math.abs(computed - printed) > PRINTED_TOLERANCE_PAISE;
}

/** Due date (YYYY-MM-DD) = invoice date + payment terms days. */
export function addDays(isoDate: string, days: number): string | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
	if (!match) return null;
	const date = new Date(
		Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days),
	);
	return date.toISOString().slice(0, 10);
}

/** Today's date in IST as YYYY-MM-DD. */
export function todayIst(): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Kolkata",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
	return parts;
}
