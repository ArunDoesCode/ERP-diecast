# Brief 25 — backend-dev — S8 locations + S9 stock view & movements
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/inventory.md (v1, frozen), docs/specs/grn-stock.md (v1)
BR scope: BR-INV-06, 07, 10, 11, 12, 13, 14, 15, 19, 20, 21, 22, 23 (+ BR-INV-04 ledger cases; BR-GRN-32..44 manual-movement tests in stockPosting.test.ts)
## Task
Implement S8 then S9 from plan.md part 2 until all remaining tests pass (inventoryMasters, inventoryStock,
stockPosting). Manual movement uses the S1 `postStock` (stock-take posts counted − balance; opening stock only
for an item+location with no rows). Remove the legacy `assetManualMovementCreateSchema`.
Also (questions.md row 3): `GET /locations` read guard → `inventory.view` roles (sa, ow, bo, fs) with `// perm: inventory.view`; writes stay `asset.manage`.
## Scope (required — every line filled)
- In: S8 + S9 + the guard change
- Out: tests (never edit), frontend, S10, ENV.md off-limits files, PR/PO code
- May edit: backend/src/** except *.test.ts, backend/.contracts/**        May read: anything
- Size: ≤ 8 files, ≤ 500 changed lines
- Stop if: a test seems to contradict the spec → BLOCKED, quote the spec rule
## Inputs
- .pipeline/m1-stock/{plan.md,contract.md,questions.md,ENV.md}, reports/24-backend-dev.md
## Done when
- all tests green except BR-INV-24 (S10); typecheck + lint no new warnings; contract:check clean
- Report: files changed, test counts, "Map updates"
Write your report to: .pipeline/m1-stock/reports/25-backend-dev.md
