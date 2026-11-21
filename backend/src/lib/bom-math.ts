// BOM maths (design/data.md). Exact scaled-integer (BigInt) maths: weights in
// milli-kg, percents in hundredths. Rounding is half up and only for display.

/** BR-BOM-10: a BOM may nest at most this many levels (the root BOM is level 1). */
export const MAX_BOM_LEVELS = 10;
/** BR-BOM-10: every walk of the levels stops at this many nodes. */
export const MAX_BOM_NODES = 1000;

/** BR-BOM-02: 1 = A ... 26 = Z, 27 = AA, 28 = AB (bijective base 26). */
export function revisionLetter(revisionNo: number): string {
  let n = Math.max(1, Math.floor(revisionNo));
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** BR-BOM-02: the number shown for a revision; never stored. */
export function bomNumber(partSku: string, revisionNo: number): string {
  return `BOM-${partSku}-${revisionLetter(revisionNo)}`;
}

/** Decimal (up to 3 / 2 places) to a scaled integer, e.g. toScaled(0.85, 3) = 850n. */
export function toScaled(value: number, decimals: number): bigint {
  return BigInt(Math.round(value * 10 ** decimals));
}

// Half-up integer division for non-negative operands.
function divRound(numerator: bigint, denominator: bigint): bigint {
  return (2n * numerator + denominator) / (2n * denominator);
}

export type CastingFigureInput = {
  netWeightKg: number | null;
  shotWeightKg: number | null;
  cavities: number | null;
  meltLossPct: number | null;
  castingRejectPct: number | null;
};

export type CastingFigures = {
  pouredWeightKg: number | null;
  yieldPct: number | null;
  alloyPerGoodPieceKg: number | null;
};

/**
 * BR-BOM-05: poured weight = shot / cavities; yield % = net x cavities / shot;
 * alloy per good piece = net + poured x melt loss / (1 - reject). Each figure is
 * null while its inputs are missing. Display rounding: 3 decimals, 1 decimal %.
 */
export function castingFigures(c: CastingFigureInput): CastingFigures {
  const { netWeightKg, shotWeightKg, cavities } = c;
  const shot = shotWeightKg === null ? null : toScaled(shotWeightKg, 3);
  const net = netWeightKg === null ? null : toScaled(netWeightKg, 3);
  const cav = cavities === null ? null : BigInt(cavities);

  const poured =
    shot !== null && cav !== null && cav > 0n ? divRound(shot, cav) : null;
  const yieldTenths =
    net !== null && shot !== null && cav !== null && shot > 0n
      ? divRound(net * cav * 1000n, shot)
      : null;

  let alloy: bigint | null = null;
  if (
    net !== null &&
    shot !== null &&
    cav !== null &&
    cav > 0n &&
    c.meltLossPct !== null &&
    c.castingRejectPct !== null
  ) {
    const meltBp = toScaled(c.meltLossPct, 2);
    const keepBp = 10000n - toScaled(c.castingRejectPct, 2);
    if (keepBp > 0n) {
      const denominator = cav * keepBp;
      alloy = divRound(net * denominator + shot * meltBp, denominator);
    }
  }

  return {
    pouredWeightKg: poured === null ? null : Number(poured) / 1000,
    yieldPct: yieldTenths === null ? null : Number(yieldTenths) / 10,
    alloyPerGoodPieceKg: alloy === null ? null : Number(alloy) / 1000,
  };
}

/** BR-BOM-04: shot weight must be at least net weight x cavities (exact). */
export function shotCoversNet(
  netWeightKg: number,
  shotWeightKg: number,
  cavities: number,
): boolean {
  return (
    toScaled(shotWeightKg, 3) >= toScaled(netWeightKg, 3) * BigInt(cavities)
  );
}

// --- Needs maths (BR-BOM-18): whole numbers in, whole numbers out, rounded up ---

/** Ceiling of a / b for non-negative bigints. */
export function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

/** BR-BOM-18: pour = ceil(Q / (1 - reject)). */
export function pourQty(qty: number, castingRejectPct: number | null): number {
  const keepBp = 10000n - toScaled(castingRejectPct ?? 0, 2);
  return Number(ceilDiv(BigInt(qty) * 10000n, keepBp));
}

/**
 * BR-BOM-18: alloy kg = Q x net + pour x poured weight x melt loss, rounded up
 * to the gram (3 decimals). Null while net / shot / cavities are missing.
 */
export function alloyKg(
  qty: number,
  pour: number,
  c: {
    netWeightKg: number | null;
    shotWeightKg: number | null;
    cavities: number | null;
    meltLossPct: number | null;
  },
): number | null {
  if (c.netWeightKg === null || c.shotWeightKg === null) return null;
  if (c.cavities === null || c.cavities < 1) return null;
  const net = toScaled(c.netWeightKg, 3);
  const shot = toScaled(c.shotWeightKg, 3);
  const cav = BigInt(c.cavities);
  const meltBp = toScaled(c.meltLossPct ?? 0, 2);
  const denominator = cav * 10000n;
  const milli = ceilDiv(
    BigInt(qty) * net * denominator + BigInt(pour) * shot * meltBp,
    denominator,
  );
  return Number(milli) / 1000;
}

/** BR-BOM-18: send = ceil(ceil(Q / (1 - loss)) x send / return). */
export function sendNeed(
  qty: number,
  jobWorkLossPct: number | null,
  sendQty: number,
  returnQty: number,
): number {
  const keepBp = 10000n - toScaled(jobWorkLossPct ?? 0, 2);
  const afterLoss = ceilDiv(BigInt(qty) * 10000n, keepBp);
  return Number(ceilDiv(afterLoss * BigInt(sendQty), BigInt(returnQty)));
}

/**
 * BR-BOM-18: a child's need = base qty x qty per piece, rounded up on its own:
 * whole for pcs / set, 3 decimals for kg / ltr / m.
 */
export function childNeed(
  baseQty: number,
  qtyPerPiece: number,
  unit: string,
): number {
  const milli = BigInt(baseQty) * toScaled(qtyPerPiece, 3);
  if (unit === "pcs" || unit === "set") return Number(ceilDiv(milli, 1000n));
  return Number(milli) / 1000;
}
