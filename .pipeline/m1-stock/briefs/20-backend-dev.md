# Brief 20 — backend-dev — contract for inventory (interfaces only)
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/inventory.md (v1, frozen)
BR scope: BR-INV-01..25
## Task
Contract step only — no business logic. Define every request/response shape and schema change the spec needs
(plan.md part 2, slices S6–S10):
- Items: fixed category + unit lists, `standardRatePaise`, active/deactivate, who/when fields.
- Services: SAC format; machines: `code` column, status, who/when; locations: `isActive`, who/when.
- Stock view endpoint (per item + per-location balances, value, reorder flag, inactive mark) — paginated.
- Movement list row names its source document; no edit/delete routes on movements.
- Manual movement: stock-take takes counted qty; opening stock takes qty + rate (shape change on the existing route).
- Last rate response includes `source`.
- Error codes per rule (400/403/404/409, incl. `ITEM_IN_USE`, `LOCATION_IN_USE`) in `contract.md` → new section "Inventory".
- Guards per plan.md part 2 "Decisions" + ENV.md (`requireRole` + `// perm:`).
New columns must be `db:push`-safe on a dev DB that already has rows. Then `contract:generate` and `db:test:prepare`.
## Scope (required — every line filled)
- In: Zod schemas, route descriptors, route guards, schema columns/indexes, manifest, contract.md
- Out: service/repository logic, tests, frontend, ENV.md off-limits files, PR/PO code
- May edit: backend/src/types/**, backend/src/routes/**, backend/src/db/schemas/02_*.ts, backend/src/controller/assetController.ts (501 stubs only), backend/.contracts/**, .pipeline/m1-stock/contract.md
  May read: anything
- Size: ≤ 8 files, ≤ 450 changed lines
- Stop if: a shape needs a business decision the spec doesn't answer → BLOCKED with options + recommendation
## Inputs
- .pipeline/m1-stock/{plan.md,contract.md,ENV.md}, reports/19-explorer.md, docs/modules/inventory.md
## Done when
- typecheck passes; full `bun test` has no newly red test except ones the new shapes necessarily break (list them); contract.md Inventory section complete
Write your report to: .pipeline/m1-stock/reports/20-backend-dev.md
