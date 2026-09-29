# Brief 30 — frontend-dev — review fixes CR-2, CR-3
Feature: subcontracting  Branch: claude/subcontracting-feature-b19136  Spec: docs/specs/subcontracting.md (v2, frozen)
BR scope: display only
## Task
- CR-2: invalidate `["subcontracting","vendor-stock"]` in the issue-challan, receipt and QA mutations (`frontend/src/lib/api/subcontracting/queries.ts`).
- CR-3: approval submit/action mutations (`frontend/src/lib/api/approval/queries.ts`) also invalidate `["subcontracting"]`.
## Scope (required — every line filled)
- In: those two invalidation fixes only.
- Out: everything else; no backend; no tests.
- May edit: frontend/src/lib/api/subcontracting/queries.ts, frontend/src/lib/api/approval/queries.ts   May read: anything
- Size: ≤ 2 files, ≤ 20 lines
- Stop if: needs anything else → BLOCKED
## Done when
- `cd frontend && bunx tsc --noEmit && bun run lint` pass. Do NOT commit.
Write your report to: .pipeline/subcontracting/reports/30-frontend-dev.md
