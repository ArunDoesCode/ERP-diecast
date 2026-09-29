# Brief 29 — frontend-dev — fix CR-20, CR-21, SPEC-24 (frontend side)
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/inventory.md (v1)
BR scope: BR-INV-19, BR-INV-24 (UI side)
## Task
- CR-20, CR-21 (details: `.pipeline/m1-stock/reports/27-code-reviewer.md`): add the missing cache invalidations
  (stock view after GRN actions and item create; stock + movements after location create/update; movements after item update).
- SPEC-24: the last-rate `source` value `pr_estimate` is renamed `item_average` by backend-dev in parallel — update
  the frontend type and any label that reads it.
## Scope (required — every line filled)
- In: the three findings
- Out: backend, tests, other screens
- May edit: frontend/src/lib/api/{asset,grn}/**, frontend/src/types/asset.ts, frontend/src/components/pages/inventory/**   May read: anything
- Size: ≤ 5 files, ≤ 60 changed lines
- Stop if: needs anything else → BLOCKED
## Done when
- `cd frontend && bunx tsc --noEmit && bun run lint` clean
Write your report to: .pipeline/m1-stock/reports/29-frontend-dev.md
