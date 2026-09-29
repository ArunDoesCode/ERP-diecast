# Brief 37 — frontend-dev — challan date max today
Feature: subcontracting  Branch: claude/subcontracting-feature-b19136  Spec: docs/specs/subcontracting.md (v3, frozen)
BR scope: BR-SCO-09
## Task
In the issue-material dialog, limit the challan date input to today or earlier (max = today) and show the server 400 message if it still comes back.
## Scope (required — every line filled)
- In: that one input.
- Out: everything else; no backend; no tests.
- May edit: frontend/src/components/pages/subcontracting/IssueMaterialDialog.tsx   May read: anything
- Size: ≤ 1 file, ≤ 15 lines
- Stop if: needs more → BLOCKED
## Done when
- `cd frontend && bunx tsc --noEmit && bun run lint` pass. Do NOT commit.
Write your report to: .pipeline/subcontracting/reports/37-frontend-dev.md
