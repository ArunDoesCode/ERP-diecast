# Brief 08 — backend-dev — S2 create & draft
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/grn.md (v1, frozen)
BR scope: BR-GRN-01 (create part), BR-GRN-02, BR-GRN-04, BR-GRN-05, BR-GRN-06, BR-GRN-08, BR-GRN-19
## Task
Implement slice S2 from plan.md until the tests for these BR ids in `grnService.test.ts` pass.
Duplicate challan (same supplier) → 409 with a plain message (never raw DB text), not 500.
## Scope (required — every line filled)
- In: S2 only
- Out: tests (never edit), frontend, S3/S4 rules, ENV.md off-limits files, PO/PR code
- May edit: backend/src/** except *.test.ts        May read: anything
- Size: ≤ 5 files, ≤ 250 changed lines
- Stop if: a test seems to contradict the spec → BLOCKED, quote the spec rule
## Inputs
- .pipeline/m1-stock/{plan.md,contract.md,ENV.md}, reports/07-backend-dev.md
## Done when
- S2 BR tests green; typecheck + lint no new warnings; no green test turned red
- Report: files changed, test counts, "Map updates"
Write your report to: .pipeline/m1-stock/reports/08-backend-dev.md
