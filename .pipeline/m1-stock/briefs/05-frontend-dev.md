# Brief 05 — frontend-dev — GRN + stock screens against the new contract
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/grn.md (v1, frozen), docs/specs/grn-stock.md (v1, frozen)
BR scope: UI side of BR-GRN-02, 05, 08, 10, 15, 18, 19, 29, 35, 40, 43, 44 (see plan.md "Frontend" column)
## Task
Update the GRN and inventory screens to the new API shapes in `contract.md`:
- GRN create/edit: challan number required; no received-date input; per-line batch/heat number; qty up to
  3 decimals, whole numbers for pieces.
- QA decision modal: accepted + rejected qty (must add up to arrived), remarks, certificate URL; over-receipt
  override reason shown only when needed and the user may override.
- Bypass: reason required, optional accepted qty (rest shown as rejected), override reason when needed.
- Correction: qty + reason; line table shows accepted and net accepted qty; bypass/override info on the line.
- Show API error messages (400/403/409) as toasts.
- Access: floor_supervisor no longer gets the bypass button. Keep today's role helpers in
  `frontend/src/lib/grn-permissions.ts` (the other session replaces them with permission keys later) — change
  only what the spec's "Who can do what" requires, and add `// perm: <key>` next to each helper.
- Inventory manual movement form: only "Stock-take" (`stock_adjustment`, default) and "Opening stock"
  (`opening_stock`); reason required; cost required for stock-in; stock-out cost not sent/ignored.
- Item create/edit form: current stock and average cost read-only (not sent).
- Reconciliation screen: not this round.
## Scope (required — every line filled)
- In: the screens above, their fetchers/queries/types under `frontend/src/lib/api/{grn,asset}`
- Out: backend, tests, auth/sidebar/setup screens, PO/PR screens, new pages
- May edit: frontend/src/** (GRN + inventory screens and their api/lib files only)   May read: anything
- Size: ≤ 15 files, ≤ 700 changed lines
- Stop if: the contract lacks a field you need → BLOCKED with the question
## Inputs
- .pipeline/m1-stock/contract.md, .pipeline/m1-stock/plan.md, docs/modules/grn.md (frontend rows), frontend/CLAUDE.md
## Done when
- `cd frontend && bunx tsc --noEmit && bun run lint` clean (no new warnings)
- Report has a "## Screens touched" section: URL, role(s) to test with, what changed
Write your report to: .pipeline/m1-stock/reports/05-frontend-dev.md
