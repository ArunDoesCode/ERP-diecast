import { assertMoneyInRange } from "./money";

// Pure maths of a delivery note (BR-DSP-19, 23, 28). Draft save, post and the
// detail read all call this, so the screen and the server agree.

export const toMilli = (qty: number | string) => Math.round(Number(qty) * 1000);
export const fromMilli = (milli: number) => milli / 1000;

/** Intra-state e-way limit applies to same-state supply; other state is fixed Rs 50,000 (BR-DSP-23). */
export const EWAY_INTERSTATE_LIMIT_PAISE = 5_000_000;

// Math.round(n / d) for n >= 0, d > 0: half up, exact in BigInt.
function divRoundPositive(numerator: bigint, divisor: bigint) {
  return (2n * numerator + divisor) / (2n * divisor);
}

function toPaise(value: bigint) {
  const n = Number(value);
  assertMoneyInRange(n);
  return n;
}

export type NoteMathLine = {
  qty: number | string;
  unitPricePaise: number;
  gstPercent: number | string;
};

export type NoteMathLineResult = { taxablePaise: number; gstPaise: number };

/** BR-DSP-19: taxable = qty x price, GST = taxable x GST %, each half up per line, in paise. */
export function computeNoteLine(line: NoteMathLine): NoteMathLineResult {
  const taxable = divRoundPositive(
    BigInt(toMilli(line.qty)) * BigInt(line.unitPricePaise),
    1000n,
  );
  const taxablePaise = toPaise(taxable);
  const gstHundredths = BigInt(Math.round(Number(line.gstPercent) * 100));
  const gstPaise = toPaise(divRoundPositive(taxable * gstHundredths, 10_000n));
  return { taxablePaise, gstPaise };
}

export type NoteMathTotals = {
  taxablePaise: number;
  gstPaise: number;
  valuePaise: number;
};

/** BR-DSP-19: note value = sum of taxable + sum of GST. */
export function computeNoteTotals(lines: NoteMathLineResult[]): NoteMathTotals {
  let taxable = 0n;
  let gst = 0n;
  for (const l of lines) {
    taxable += BigInt(l.taxablePaise);
    gst += BigInt(l.gstPaise);
  }
  return {
    taxablePaise: toPaise(taxable),
    gstPaise: toPaise(gst),
    valuePaise: toPaise(taxable + gst),
  };
}

/** BR-DSP-23: needed when the value incl. GST is at or above the limit that applies. */
export function isEwayNeeded(input: {
  valuePaise: number;
  sameState: boolean;
  intraLimitPaise: number;
}) {
  const limit = input.sameState
    ? input.intraLimitPaise
    : EWAY_INTERSTATE_LIMIT_PAISE;
  return input.valuePaise >= limit;
}

/**
 * BR-DSP-28: end of day (23:59 IST) of e-way date + ceil(km / 200) days, as an ISO
 * string with the +05:30 offset. Null when the date or the distance is missing.
 */
export function ewayValidUntil(
  ewayBillDate: string | null,
  distanceKm: number | null,
): string | null {
  if (!ewayBillDate || !distanceKm || distanceKm <= 0) return null;
  const [y, m, d] = ewayBillDate.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const days = Math.ceil(distanceKm / 200);
  const end = new Date(Date.UTC(y, m - 1, d + days));
  const two = (n: number) => String(n).padStart(2, "0");
  return `${end.getUTCFullYear()}-${two(end.getUTCMonth() + 1)}-${two(end.getUTCDate())}T23:59:00+05:30`;
}

export function isEwayExpired(validUntil: string | null, now: Date) {
  return validUntil !== null && new Date(validUntil).getTime() < now.getTime();
}
