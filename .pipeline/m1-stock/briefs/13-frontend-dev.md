# Brief 13 — frontend-dev — fix CR-3, CR-4, CR-5
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/grn.md (v1), docs/specs/grn-stock.md (v1)
BR scope: BR-GRN-02, BR-GRN-29, BR-GRN-37 (UI side)
## Task
Fix findings CR-3, CR-4, CR-5 from `.pipeline/m1-stock/reports/11-code-reviewer.md`:
- CR-3: correction mutation invalidates GRN + PO like QA/bypass do; QA, bypass, correction and manual movement
  also invalidate item and movement lists.
- CR-4: one shared whole-number unit list (pcs, set, sets, nos — same as backend) used in Create, Edit, QA, bypass.
- CR-5: correction qty input limited to net accepted qty; submit disabled when out of range.
## Scope (required — every line filled)
- In: CR-3, CR-4, CR-5 only
- Out: backend, tests, other screens
- May edit: frontend/src/lib/api/{grn,asset}/**, frontend/src/components/pages/{grn,inventory}/**, frontend/src/lib/**   May read: anything
- Size: ≤ 8 files, ≤ 150 changed lines
- Stop if: needs a contract change → BLOCKED
## Inputs
- .pipeline/m1-stock/reports/11-code-reviewer.md, .pipeline/m1-stock/contract.md
## Done when
- `cd frontend && bunx tsc --noEmit && bun run lint` clean
Write your report to: .pipeline/m1-stock/reports/13-frontend-dev.md
