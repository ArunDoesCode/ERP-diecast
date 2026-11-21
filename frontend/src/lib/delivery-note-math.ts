// Delivery note line maths (BR-DSP-19): taxable = qty x price, GST = taxable x GST %, each rounded
// half up to a whole paise per line. BigInt so a qty of up to 3 decimals never loses a paise.

const TWO = BigInt(2);
const QTY_SCALE = BigInt(1000);
const PERCENT_SCALE = BigInt(10000);

/** Qty (up to 3 decimals) as thousandths; null for anything that is not a plain number. */
function toMilli(qty: number): bigint | null {
	if (!Number.isFinite(qty) || qty < 0) return null;
	return BigInt(Math.round(qty * 1000));
}

function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
	return (numerator * TWO + denominator) / (denominator * TWO);
}

export function lineTaxablePaise(qty: number, unitPricePaise: number): number {
	const milli = toMilli(qty);
	if (milli === null || !Number.isFinite(unitPricePaise)) return 0;
	return Number(
		divRoundHalfUp(milli * BigInt(Math.round(unitPricePaise)), QTY_SCALE),
	);
}

export function lineGstPaise(taxablePaise: number, gstPercent: number): number {
	if (!Number.isFinite(taxablePaise) || !Number.isFinite(gstPercent)) return 0;
	// GST % can carry decimals (e.g. 2.5): work in hundredths of a percent.
	const hundredths = BigInt(Math.round(gstPercent * 100));
	return Number(
		divRoundHalfUp(
			BigInt(Math.round(taxablePaise)) * hundredths,
			PERCENT_SCALE,
		),
	);
}

export type NoteTotals = {
	taxablePaise: number;
	gstPaise: number;
	valuePaise: number;
};

/** Σ taxable + Σ GST over the lines. */
export function noteTotals(
	lines: { qty: number; unitPricePaise: number; gstPercent: number }[],
): NoteTotals {
	let taxable = 0;
	let gst = 0;
	for (const line of lines) {
		const lineTaxable = lineTaxablePaise(line.qty, line.unitPricePaise);
		taxable += lineTaxable;
		gst += lineGstPaise(lineTaxable, line.gstPercent);
	}
	return { taxablePaise: taxable, gstPaise: gst, valuePaise: taxable + gst };
}

/** Other-state notes use the fixed ₹50,000 limit; same-state notes use the company limit (BR-DSP-23). */
export const EWAY_OTHER_STATE_LIMIT_PAISE = 5_000_000;

export function ewayNeededFor(args: {
	valuePaise: number;
	limitPaise: number;
	sameState: boolean;
}): boolean {
	const limit = args.sameState ? args.limitPaise : EWAY_OTHER_STATE_LIMIT_PAISE;
	return args.valuePaise >= limit;
}
