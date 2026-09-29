# Brief 23 — frontend-dev — inventory screens against the new contract
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/inventory.md (v1, frozen)
BR scope: UI side of BR-INV-01..25 (see plan.md part 2 "Frontend" column)
## Task
Update the inventory screens to the "Inventory" section of `contract.md`:
- Items: category + unit dropdowns (fixed lists), standard rate (₹ in the form, paise on the wire), reorder level,
  current stock + average cost read-only, active/inactive toggle, SKU/unit disabled when the API says in use (or show the 409).
- Services: SAC field hint (6 digits, starts 99), active toggle. Machines: code field, status, last maintenance date (no future).
- Locations: type, supplier picker only for vendor_premise, active toggle.
- New stock view screen (per item: unit, stock, average, value, per-location balances, reorder flag, "inactive" tag),
  inside the existing inventory section/tab pattern — no new sidebar entry (screens registry belongs to the auth session).
- Movements: read-only list shows the source document; manual form: "Stock-take" (default; counted qty, cost when
  counted > balance) or "Opening stock" (qty + rate); reason required.
- Show API errors (400/403/409) as toasts with the API message.
## Scope (required — every line filled)
- In: inventory screens + `frontend/src/lib/api/asset/**` + `frontend/src/types/asset.ts`
- Out: backend, tests, sidebar/setup/auth screens, PR/PO/GRN screens
- May edit: frontend/src/components/{pages,views}/inventory/**, frontend/src/app/(protected)/inventory/**, frontend/src/lib/api/asset/**, frontend/src/types/asset.ts
  May read: anything
- Size: ≤ 15 files, ≤ 800 changed lines
- Stop if: the contract lacks a field you need → BLOCKED
## Inputs
- .pipeline/m1-stock/contract.md (Inventory section), .pipeline/m1-stock/plan.md part 2, frontend/CLAUDE.md
## Done when
- `cd frontend && bunx tsc --noEmit && bun run lint` clean
- Report has "## Screens touched": URL, role(s), what changed
Write your report to: .pipeline/m1-stock/reports/23-frontend-dev.md
