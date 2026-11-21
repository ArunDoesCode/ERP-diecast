import { toMilli } from "./milli";
import { divRoundHalfUp, toPaise } from "./money";

// Pure maths of a purchase return / debit note (BR-PRT-31, 32). The post and the
// draft preview both call this, so the screen and the server agree (BR-PRT-40).

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
  const taxable = divRoundHalfUp(
    BigInt(toMilli(line.qty)) * BigInt(line.ratePaise),
    1000n,
  );
  const taxablePaise = toPaise(taxable);
  const gstHundredths = BigInt(Math.round(line.gstPercent * 100));
  const gstPaise = toPaise(divRoundHalfUp(taxable * gstHundredths, 10_000n));
  if (isInterstate) {
    return {
      taxablePaise,
      gstPaise,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: gstPaise,
    };
  }
  const cgstPaise = toPaise(divRoundHalfUp(BigInt(gstPaise), 2n));
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
