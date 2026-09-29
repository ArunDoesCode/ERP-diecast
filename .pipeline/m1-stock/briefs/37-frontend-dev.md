# Brief 37 — frontend-dev — supplier screens against the new contract
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/suppliers.md (v1, frozen)
BR scope: UI side of BR-SUP-01..24 (plan.md part 3 "Frontend" column)
## Task
Update the supplier screens to the "Suppliers" section of `contract.md`:
- Master form: only name required; GSTIN (caps, 15 chars), PAN (auto-filled from GSTIN chars 3–12 when blank),
  contact/email/phone/address optional and clearable; type default raw material; payment terms 0–365 days.
- List: status filter (active/inactive/all), status badge, search hint (name, contact, email, phone, GSTIN, SKU).
- Deactivate / reactivate action (no delete).
- Price list (items + services): GST % dropdown (0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40), price in ₹ → paise,
  unit fixed to the item's unit, lead time 0–365, qty ≤ 3 dp; inactive rows greyed.
- Batch edit: ≤ 100 rows; on 400 show each row's reason; nothing saved.
- History view per supplier (who, when, field, old → new).
- API errors as toasts with the API message.
## Scope (required — every line filled)
- In: supplier screens + `frontend/src/lib/api/suppliers/**` (or the existing supplier api folder) + supplier types
- Out: backend, tests, PO screens (the PO supplier picker belongs to the auth session), sidebar/setup
- May edit: frontend/src/components/{pages,views}/suppliers/**, frontend/src/app/(protected)/suppliers/**, the supplier api + types files, frontend/src/lib/api/routes.ts (supplier lines only)
  May read: anything
- Size: ≤ 15 files, ≤ 800 changed lines
- Stop if: the contract lacks a field you need → BLOCKED
## Inputs
- .pipeline/m1-stock/contract.md (Suppliers section), .pipeline/m1-stock/plan.md part 3, frontend/CLAUDE.md
## Done when
- `cd frontend && bunx tsc --noEmit && bun run lint` clean
- Report has "## Screens touched": URL, role(s), what changed
Write your report to: .pipeline/m1-stock/reports/37-frontend-dev.md
