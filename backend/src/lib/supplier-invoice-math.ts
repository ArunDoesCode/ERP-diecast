import { BadRequestError } from "./errors";
import { istDayKey } from "./ist-day";

// Pure maths of the supplier invoice and its 3-way match (BR-SINV-13..22, 36, 40, 41).
// BigInt keeps qty x rate and the tax heads exact; every result is checked against
// Number.MAX_SAFE_INTEGER before it becomes a number (BR-SINV-36).

export type TaxType = "cgst_sgst" | "igst" | "none";

const DAY_MS = 86_400_000;

export const toMilli = (qty: number) => Math.round(qty * 1000);
export const fromMilli = (milli: number) => milli / 1000;

/** The plant (IST) calendar day of an instant, `YYYY-MM-DD`. */
export function istDay(date: Date) {
  return istDayKey(date);
}

/** `YYYY-MM` of the plant (IST) day: the SINV number period (BR-SINV-11). */
export function istMonth(date: Date) {
  return istDay(date).slice(0, 7);
}

/** `day` + `days` calendar days, both `YYYY-MM-DD` (BR-SINV-28). */
export function addDays(day: string, days: number) {
  const moved = new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS);
  return istDayKey(moved);
}

/** Financial year `26-27` of a `YYYY-MM-DD` day, April to March (BR-SINV-06). */
export function financialYearOfDay(day: string) {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const start = month >= 4 ? year : year - 1;
  const two = (n: number) => String(n % 100).padStart(2, "0");
  return `${two(start)}-${two(start + 1)}`;
}

/** Math.round(n / d) for n >= 0, d > 0: half up, exact in BigInt. */
export function divRoundHalfUp(numerator: bigint, divisor: bigint) {
  return (2n * numerator + divisor) / (2n * divisor);
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** bigint -> number, 400 SINV_AMOUNT_TOO_LARGE above MAX_SAFE_INTEGER (BR-SINV-36). */
export function safePaise(value: bigint) {
  if (value > MAX_SAFE || value < -MAX_SAFE) {
    throw new BadRequestError(
      "An amount on this invoice is above the largest value allowed",
      "SINV_AMOUNT_TOO_LARGE",
    );
  }
  return Number(value);
}

/** GST percent from the slab list -> basis points (18 -> 1800, 0.1 -> 10). */
export const gstPercentToBp = (percent: number) => Math.round(percent * 100);

/** BR-SINV-13: round(qty x rate) in paise. */
export function itemTaxable(qtyMilli: number, ratePaise: number) {
  return divRoundHalfUp(BigInt(qtyMilli) * BigInt(ratePaise), 1000n);
}

export type TaxHeads = { cgst: bigint; sgst: bigint; igst: bigint };

/** BR-SINV-14, 15, 16: each head rounded half-up per line; CGST and SGST equal. */
export function taxHeadsOf(
  taxable: bigint,
  gstBp: number,
  taxType: TaxType | null,
): TaxHeads {
  if (taxType === "cgst_sgst") {
    const half = divRoundHalfUp(taxable * BigInt(gstBp), 20_000n);
    return { cgst: half, sgst: half, igst: 0n };
  }
  if (taxType === "igst") {
    return {
      cgst: 0n,
      sgst: 0n,
      igst: divRoundHalfUp(taxable * BigInt(gstBp), 10_000n),
    };
  }
  return { cgst: 0n, sgst: 0n, igst: 0n };
}

/** BR-SINV-14, 16: tax type from the supplier GSTIN and the plant state; null = plant state unknown. */
export function resolveTaxType(
  supplierGstin: string | null | undefined,
  plantStateCode: string | null | undefined,
): TaxType | null {
  const gstin = supplierGstin?.trim();
  if (!gstin) {
    return "none";
  }
  const plant = plantStateCode?.trim();
  if (!plant) {
    return null;
  }
  return gstin.slice(0, 2) === plant ? "cgst_sgst" : "igst";
}

export type AmountLineIn = { taxable: bigint; gstBp: number };
export type AmountLineOut = {
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
};
export type InvoiceTotals = {
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
};

/** Per-line and total amounts (BR-SINV-13, 15, 36). */
export function computeAmounts(
  lines: AmountLineIn[],
  taxType: TaxType | null,
): { lines: AmountLineOut[]; totals: InvoiceTotals } {
  let taxable = 0n;
  let cgst = 0n;
  let sgst = 0n;
  let igst = 0n;
  const out = lines.map((line) => {
    const heads = taxHeadsOf(line.taxable, line.gstBp, taxType);
    taxable += line.taxable;
    cgst += heads.cgst;
    sgst += heads.sgst;
    igst += heads.igst;
    return {
      taxablePaise: safePaise(line.taxable),
      cgstPaise: safePaise(heads.cgst),
      sgstPaise: safePaise(heads.sgst),
      igstPaise: safePaise(heads.igst),
    };
  });
  return {
    lines: out,
    totals: {
      taxablePaise: safePaise(taxable),
      cgstPaise: safePaise(cgst),
      sgstPaise: safePaise(sgst),
      igstPaise: safePaise(igst),
      totalPaise: safePaise(taxable + cgst + sgst + igst),
    },
  };
}

// --- the match (BR-SINV-19..22, 40, 41) ---

export type MatchCheck =
  | "qty"
  | "price"
  | "tax"
  | "tax_rate"
  | "total"
  | "charge";
export type MatchUnit = "paise" | "milli_qty" | "bp";

export type MatchMismatch = {
  check: MatchCheck;
  /** index into the item / charge input lists; resolved to a line id by the caller */
  lineKey: string | null;
  head: "cgst" | "sgst" | "igst" | null;
  expected: number;
  billed: number;
  unit: MatchUnit;
};

export type MatchItemLine = {
  key: string;
  qtyMilli: number;
  ratePaise: number;
  gstBp: number;
  weightUnit: boolean;
  poRatePaise: number;
  poGstBp: number;
  billableMilli: number;
};

export type MatchInput = {
  taxType: TaxType;
  items: MatchItemLine[];
  charges: { key: string; taxablePaise: number }[];
  computed: InvoiceTotals;
  printed: {
    cgstPaise: number;
    sgstPaise: number;
    igstPaise: number;
    totalPaise: number;
  };
  priceTolBp: number;
  weightTolBp: number;
};

/** BR-SINV-19, 20: printed tax heads and total may differ by at most Rs 1.00. */
export const TAX_TOLERANCE_PAISE = 100;

export function runMatch(input: MatchInput): {
  mismatches: MatchMismatch[];
  belowPoRate: Set<string>;
} {
  const mismatches: MatchMismatch[] = [];
  const belowPoRate = new Set<string>();

  // BR-SINV-19: a head the tax type does not use must be 0 on the bill; the used heads within Rs 1.
  const heads = [
    ["cgst", input.computed.cgstPaise, input.printed.cgstPaise],
    ["sgst", input.computed.sgstPaise, input.printed.sgstPaise],
    ["igst", input.computed.igstPaise, input.printed.igstPaise],
  ] as const;
  for (const [head, expected, billed] of heads) {
    const used =
      input.taxType === "cgst_sgst"
        ? head !== "igst"
        : input.taxType === "igst"
          ? head === "igst"
          : false;
    const bad = used
      ? Math.abs(billed - expected) > TAX_TOLERANCE_PAISE
      : billed > 0;
    if (bad) {
      mismatches.push({
        check: "tax",
        lineKey: null,
        head,
        expected,
        billed,
        unit: "paise",
      });
    }
  }

  // BR-SINV-20
  if (
    Math.abs(input.printed.totalPaise - input.computed.totalPaise) >
    TAX_TOLERANCE_PAISE
  ) {
    mismatches.push({
      check: "total",
      lineKey: null,
      head: null,
      expected: input.computed.totalPaise,
      billed: input.printed.totalPaise,
      unit: "paise",
    });
  }

  for (const line of input.items) {
    // BR-SINV-21: rate x 10,000 > PO rate x (10,000 + tolerance bp), whole numbers.
    if (
      BigInt(line.ratePaise) * 10_000n >
      BigInt(line.poRatePaise) * BigInt(10_000 + input.priceTolBp)
    ) {
      mismatches.push({
        check: "price",
        lineKey: line.key,
        head: null,
        expected: line.poRatePaise,
        billed: line.ratePaise,
        unit: "paise",
      });
    } else if (line.ratePaise < line.poRatePaise) {
      belowPoRate.add(line.key);
    }
    // BR-SINV-22: qty tolerance is the weight tolerance for weight units, 0 otherwise.
    const qtyTol = line.weightUnit ? input.weightTolBp : 0;
    if (
      BigInt(line.qtyMilli) * 10_000n >
      BigInt(line.billableMilli) * BigInt(10_000 + qtyTol)
    ) {
      mismatches.push({
        check: "qty",
        lineKey: line.key,
        head: null,
        expected: line.billableMilli,
        billed: line.qtyMilli,
        unit: "milli_qty",
      });
    }
    // BR-SINV-40
    if (line.gstBp !== line.poGstBp) {
      mismatches.push({
        check: "tax_rate",
        lineKey: line.key,
        head: null,
        expected: line.poGstBp,
        billed: line.gstBp,
        unit: "bp",
      });
    }
  }

  // BR-SINV-41: any charge line needs a release
  for (const charge of input.charges) {
    mismatches.push({
      check: "charge",
      lineKey: charge.key,
      head: null,
      expected: 0,
      billed: charge.taxablePaise,
      unit: "paise",
    });
  }

  return { mismatches, belowPoRate };
}
