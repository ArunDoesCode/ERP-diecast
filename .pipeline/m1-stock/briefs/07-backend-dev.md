# Brief 07 — backend-dev — S5 manual movements, item API, reconciliation
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/grn-stock.md (v1, frozen), docs/specs/inventory.md (frozen, for inventory.* keys)
BR scope: BR-GRN-33 (manual part), BR-GRN-40, BR-GRN-41, BR-GRN-43, BR-GRN-44 (+ BR-GRN-37/42 tests that post via movements)
## Task
Implement slice S5 from plan.md until its tests in `stockPosting.test.ts` (and any in `grnService.test.ts`) pass.
Manual movement uses the S1 posting function. Ledger `reference_id` for manual rows: 0 is fine (contract report
note). Reconciliation endpoint returns the mismatch rows (item stock ≠ ledger total; item+location last
balance ≠ ledger total).
## Scope (required — every line filled)
- In: S5 only
- Out: tests (never edit), frontend, S2–S4 rules, ENV.md off-limits files, PO/PR code
- May edit: backend/src/** except *.test.ts        May read: anything
- Size: ≤ 6 files, ≤ 350 changed lines
- Stop if: a test seems to contradict the spec → BLOCKED, quote the spec rule
## Inputs
- .pipeline/m1-stock/{plan.md,contract.md,ENV.md}, reports/06-backend-dev.md
## Done when
- S5 BR tests green; typecheck + lint no new warnings; no green test turned red
- Report: files changed, test counts, "Map updates"
Write your report to: .pipeline/m1-stock/reports/07-backend-dev.md
