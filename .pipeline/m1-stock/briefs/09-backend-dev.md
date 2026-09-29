# Brief 09 — backend-dev — S3 QA decisions
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/grn.md (v1, frozen)
BR scope: BR-GRN-01 (accept/bypass part), BR-GRN-09, BR-GRN-10, BR-GRN-12, BR-GRN-13, BR-GRN-15, BR-GRN-18, BR-GRN-25, BR-GRN-27
## Task
Implement slice S3 from plan.md until the tests for these BR ids pass.
- PO status check for accept/bypass happens before any posting and inside the tx (409).
- Over-receipt check reads PO line received qty under a row lock; override needs the key's roles
  (ow, bo, super-admin — `// perm: grn.over_receipt_override`) and a reason; store actor, reason, excess qty.
- Also (S2 leftover, BR-GRN-02): draft `update` must apply the same whole-number check for pcs lines as create.
## Scope (required — every line filled)
- In: S3 + the one S2 leftover above
- Out: tests (never edit), frontend, S4 correction rules, ENV.md off-limits files; PO code only the smallest change needed (list it)
- May edit: backend/src/** except *.test.ts        May read: anything
- Size: ≤ 6 files, ≤ 400 changed lines
- Stop if: a test seems to contradict the spec → BLOCKED, quote the spec rule
## Inputs
- .pipeline/m1-stock/{plan.md,contract.md,ENV.md}, reports/08-backend-dev.md
## Done when
- S3 BR tests green; typecheck + lint no new warnings; no green test turned red
- Report: files changed, test counts, PO changes, "Map updates"
Write your report to: .pipeline/m1-stock/reports/09-backend-dev.md
