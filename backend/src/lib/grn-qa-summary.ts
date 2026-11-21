// BR-FF-115: a goods receipt's QA status is one value from its lines. The only
// definition; the GRN list and the document view's linked GRNs both use it.
export type GrnQaSummary = "pending" | "passed" | "failed" | "mixed";

export type GrnQaCounts = {
  lines: number;
  pending: number;
  /** passed and waived (waived counts as passed). */
  passed: number;
  failed: number;
};

/**
 * pending if any line is pending; else passed if every line is passed/waived;
 * else failed if every line failed; else mixed ("Partly accepted").
 * No lines -> null (no QA status): BR-FF-115 speaks only of lines, so a
 * receipt without lines has nothing to summarise (and cannot be "pending").
 */
export function grnQaSummary(counts: GrnQaCounts): GrnQaSummary | null {
  if (counts.lines === 0) return null;
  if (counts.pending > 0) return "pending";
  if (counts.passed === counts.lines) return "passed";
  if (counts.failed === counts.lines) return "failed";
  return "mixed";
}

/** Same rule from raw line statuses (a null status counts as pending). */
export function grnQaSummaryOfStatuses(
  statuses: (string | null)[],
): GrnQaSummary | null {
  const all = statuses.map((s) => s ?? "pending");
  return grnQaSummary({
    lines: all.length,
    pending: all.filter((s) => s === "pending").length,
    passed: all.filter((s) => s === "passed" || s === "waived").length,
    failed: all.filter((s) => s === "failed").length,
  });
}
