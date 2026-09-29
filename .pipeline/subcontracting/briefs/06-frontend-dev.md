# Brief 06 — frontend-dev — S1 screens (order + approval)
Feature: subcontracting  Branch: claude/subcontracting-feature-b19136  Spec: docs/specs/subcontracting.md (v2, frozen)
BR scope: BR-SCO-01..06, 20, 23
## Task
Build S1 screens strictly against `.pipeline/subcontracting/contract.md` and `backend/.contracts/api-manifest.json`; follow the PO frontend pattern (page → view → pages-component, `API_ROUTES`, queries/fetchers).
- Subcontracting nav entry + SCO list; create/edit form (vendor, expected return date, lines: raw item, finished item, service, send/return qty, price/GST editable in draft); detail page (status, totals incl. GST, approval state, submit, cancel with reason 3–500 chars).
- Company settings form (owner only, `company.manage`); HSN field on the item form.
- Show/hide actions by permission keys (`sco.view`, `sco.manage`, `company.manage`); server still enforces.
- Surface backend error messages (400/409) in toasts/inline.
Screens touched list must go in the report under a heading `## Screens touched` (URL, role, purpose).
## Scope (required — every line filled)
- In: S1 frontend only.
- Out: no backend, no tests, no challan/receipt/close screens, no refactors.
- May edit: frontend/** except tests   May read: anything except backend source for shapes (use contract)
- Size: as needed; reuse existing components
- Stop if: contract lacks a field you need → BLOCKED naming it
## Inputs
- spec, contract.md, api-manifest.json
## Done when
- `cd frontend && bunx tsc --noEmit && bun run lint` pass. Do NOT commit.
Write your report to: .pipeline/subcontracting/reports/06-frontend-dev.md
