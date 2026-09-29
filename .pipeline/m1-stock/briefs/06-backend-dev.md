# Brief 06 — backend-dev — S1 posting engine
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/grn-stock.md (v1, frozen), docs/specs/grn.md (v1, frozen)
BR scope: BR-GRN-21, BR-GRN-22, BR-GRN-24, BR-GRN-37, BR-GRN-38, BR-GRN-42
## Task
Implement slice S1 from `.pipeline/m1-stock/plan.md` until the tests for these BR ids in
`backend/src/service/stockPosting.test.ts` pass (plus any BR-GRN-21/22/24/37/38/42 tests in `grnService.test.ts`).
One posting function that runs inside the caller's transaction: locks the item row first (also for the first
posting of a new item+location), reads balance, writes one ledger row (reference line id, batch/heat no.,
value = qty × cost rounded half away from zero), updates item current stock and moving average (BR-GRN-38).
GRN accept/bypass must do ledger + item + line + QA row + PO line + PO/GRN status in one transaction.
Keep qty math exact to 3 decimals (plan.md decisions).
## Scope (required — every line filled)
- In: S1 only. Other slices' tests may stay red.
- Out: tests (never edit), frontend, S2–S5 rules, files off-limits in ENV.md, PO/PR code beyond passing `tx` through
- May edit: backend/src/** except *.test.ts        May read: anything
- Size: ≤ 8 files, ≤ 500 changed lines
- Stop if: a test seems to contradict the spec → BLOCKED, quote the spec rule
## Inputs
- .pipeline/m1-stock/{plan.md,contract.md,ENV.md}, reports/01-explorer.md, reports/02-backend-dev.md
## Done when
- S1 BR tests green; typecheck + lint clean (no new warnings); no previously green test turned red
- Report lists: files changed, test result counts, any PO file touched, "Map updates"
Write your report to: .pipeline/m1-stock/reports/06-backend-dev.md
