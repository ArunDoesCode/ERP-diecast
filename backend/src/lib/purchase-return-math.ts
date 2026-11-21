import { assertMoneyInRange } from "./money";

// Pure maths of a purchase return / debit note (BR-PRT-31, 32). The post and the
// draft preview both call this, so the screen and the server agree (BR-PRT-40).

export const toMilli = (qty: number) => Math.round(qty * 1000);
export const fromMilli = (milli: number) => milli / 1000;

// Math.round(n / d) for n >= 0, d > 0: half up = half away from zero, exact in BigInt.
function divRoundPositive(numerator: bigint, divisor: bigint) {
  return (2n * numerator + divisor) / (2n * divisor);
}

function toPaise(value: bigint) {
  const n = Number(value);
  assertMoneyInRange(n); // AMOUNT_TOO_LARGE (BR-PRT-18)
  return n;
}

export type ReturnMathLine = {
  qty: number;
  ratePaise: number;
  gstPercent: number;
};

export type ReturnMathLineResult = {
  taxablePaise: number;
  gstPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
};

/** BR-PRT-31 + 32: per-line taxable value, GST and its split. */
export function computeReturnLine(
  line: ReturnMathLine,
  isInterstate: boolean,
): ReturnMathLineResult {
  const taxable = divRoundPositive(
    BigInt(toMilli(line.qty)) * BigInt(line.ratePaise),
    1000n,
  );
  const taxablePaise = toPaise(taxable);
  const gstHundredths = BigInt(Math.round(line.gstPercent * 100));
  const gstPaise = toPaise(divRoundPositive(taxable * gstHundredths, 10_000n));
  if (isInterstate) {
    return {
      taxablePaise,
      gstPaise,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: gstPaise,
    };
  }
  const cgstPaise = toPaise(divRoundPositive(BigInt(gstPaise), 2n));
  return {
    taxablePaise,
    gstPaise,
    cgstPaise,
    sgstPaise: gstPaise - cgstPaise,
    igstPaise: 0,
  };
}

export type ReturnMathTotals = {
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
};

export function computeReturnTotals(
  lines: ReturnMathLineResult[],
): ReturnMathTotals {
  const sum = (pick: (l: ReturnMathLineResult) => number) =>
    toPaise(lines.reduce((acc, l) => acc + BigInt(pick(l)), 0n));
  const taxablePaise = sum((l) => l.taxablePaise);
  const cgstPaise = sum((l) => l.cgstPaise);
  const sgstPaise = sum((l) => l.sgstPaise);
  const igstPaise = sum((l) => l.igstPaise);
  const totalPaise = toPaise(
    BigInt(taxablePaise) +
      BigInt(cgstPaise) +
      BigInt(sgstPaise) +
      BigInt(igstPaise),
  );
  return { taxablePaise, cgstPaise, sgstPaise, igstPaise, totalPaise };
}

/** BR-PRT-32: same state when the first two GSTIN digits match the plant; no GSTIN counts as same state. */
export function isInterstateSupply(
  supplierGstin: string | null | undefined,
  plantStateCode: string,
) {
  const gstin = supplierGstin?.trim();
  if (!gstin || gstin.length < 2) {
    return false;
  }
  return gstin.slice(0, 2) !== plantStateCode.trim();
}

/** Plant-IST month key `YYYY-MM` for the PRT number (BR-PRT-23). */
export function istMonthKey(date: Date) {
  const ist = new Date(date.getTime() + 330 * 60_000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}`;
}
