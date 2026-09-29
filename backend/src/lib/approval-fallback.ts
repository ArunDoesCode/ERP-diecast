/**
 * BR-APR-22: when no active policy matches, the built-in fallback applies. It is an
 * inactive record per doc type kept in seed data (scripts/seed-approval-policies.ts,
 * the only place that names its approver role); code finds it by this name.
 */
export const fallbackPolicyName = (docType: "pr" | "po" | "sco"): string =>
  `Fallback owner chain (${docType})`;
