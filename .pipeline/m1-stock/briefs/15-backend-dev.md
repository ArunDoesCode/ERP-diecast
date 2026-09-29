# Brief 15 — backend-dev — COORD-1 ledger value column too small
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/grn-stock.md (v1)
BR scope: BR-GRN-21, BR-GRN-24
## Task
Finding COORD-1 (major): `inventory_ledger.total_value_change_paise` is int4 (max ≈ ₹2.1 crore). A normal
receipt of 100,000 kg @ 21,000 paise = 2.1e9 paise is refused with 400. Change that column to `bigint`
(drizzle `mode: "number"`, safe up to 2^53), raise the row-value cap in `postStock` to Number.MAX_SAFE_INTEGER,
and keep `unit_cost_paise` int4 with its current cap. Check the reconciliation and any sum over this column
still type-check. Then `db:test:prepare`, `contract:generate` if shapes changed.
## Scope (required — every line filled)
- In: COORD-1 only
- Out: tests, frontend, other columns, PO tables
- May edit: backend/src/db/schemas/02_procurement-catalog.ts, backend/src/repository/**, backend/src/types/asset.types.ts, backend/.contracts/**   May read: anything
- Size: ≤ 4 files, ≤ 40 changed lines
- Stop if: needs anything else → BLOCKED
## Done when
- full `bun test` green; typecheck clean; contract:check clean
Write your report to: .pipeline/m1-stock/reports/15-backend-dev.md
