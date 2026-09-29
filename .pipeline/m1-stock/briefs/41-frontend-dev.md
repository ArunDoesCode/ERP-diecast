# Brief 41 — frontend-dev — SPEC-43 PAN refill
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/suppliers.md (v1)
BR scope: BR-SUP-04 (UI side)
## Task
SPEC-43 (reports/39-spec-reviewer.md): in the supplier master form, when the GSTIN field changes to a valid
15-char value, refill PAN from GSTIN characters 3–12 (user can still edit PAN after). Also cap free-text inputs
to the new backend limits: name 200, email 254, phone 30, contact 200, address 500, supplier SKU 100.
## Scope (required — every line filled)
- In: SPEC-43 + input maxLength
- Out: backend, tests, other screens
- May edit: frontend/src/components/pages/suppliers/**, frontend/src/types/suppliers.ts   May read: anything
- Size: ≤ 3 files, ≤ 60 changed lines
- Stop if: needs anything else → BLOCKED
## Done when
- `cd frontend && bunx tsc --noEmit && bun run lint` clean
Write your report to: .pipeline/m1-stock/reports/41-frontend-dev.md
