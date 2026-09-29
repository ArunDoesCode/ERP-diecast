# Brief 35 — backend-dev — contract for suppliers (interfaces only)
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/suppliers.md (v1, frozen)
BR scope: BR-SUP-01..24
## Task
Contract step only — no business logic. Define every request/response shape and schema change the spec needs
(plan.md part 3, slices S11–S12):
- Supplier create/update: only name required; GSTIN/PAN/contact/email/phone/address optional and clearable;
  terms 0–365; status filter on list; pageSize 1–100; search fields per BR-SUP-23.
- Price-list rows (items + services): GST % fixed list, price > 0, lead time 0–365, qty ≤ 3 dp.
- Batch edit: ≤ 100 rows, one target per row, all-or-nothing reply with per-row ok/reason (400 when any row fails).
- History: table (who, when, entity, field, old, new) + a read endpoint for a supplier's history (paginated).
- Error codes per rule in `contract.md` → new section "Suppliers" (fixed plain messages, BR-SUP-22).
- Guards per plan.md part 3 "Decisions" + ENV.md (`requireRole` + `// perm:`).
New columns/tables/indexes must be `db:push`-safe on a dev DB with rows (e.g. a functional unique index on
lower(btrim(name)) fails if dev data already has duplicates — note that risk in the report).
Then `contract:generate` and `db:test:prepare`.
## Scope (required — every line filled)
- In: Zod schemas, route descriptors, guards, schema columns/tables/indexes, manifest, contract.md
- Out: service/repository logic, tests, frontend, ENV.md off-limits files, PO code
- May edit: backend/src/types/**, backend/src/routes/**, backend/src/db/schemas/02_*.ts, backend/src/controller/supplierController.ts (501 stubs only), backend/.contracts/**, .pipeline/m1-stock/contract.md
  May read: anything
- Size: ≤ 8 files, ≤ 400 changed lines
- Stop if: a shape needs a business decision the spec doesn't answer → BLOCKED with options + recommendation
## Inputs
- .pipeline/m1-stock/{plan.md,contract.md,ENV.md}, reports/34-explorer.md, docs/modules/suppliers.md
## Done when
- typecheck passes; list any test the new shapes necessarily break; contract.md Suppliers section complete
Write your report to: .pipeline/m1-stock/reports/35-backend-dev.md
