# Brief 34 — explorer — supplier code facts for BR-SUP-01..25
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/suppliers.md (v1, frozen)
BR scope: BR-SUP-01..25
## Task
Map-first, diff-only. Read docs/modules/suppliers.md (last_verified_commit 0a406f4). Explore only code changed
since then in the map's paths plus what the questions need. Answer with file + symbol:
1. `supplierMaster`, `supplierItems`, `supplierServices` columns: name/GSTIN/PAN uniqueness (case?), type enum values, payment terms, email/phone, isActive, price/GST/lead time/qty column types, any history table.
2. All `/api/supplier*` routes, guards, END_POINTS descriptors, request/response Zod schemas (create, update, list, items/services add + batch edit).
3. Create-with-items: one tx? Batch edit: `editSupplierItems`/`editSupplierServices` — loop shape, error handling (BL-031, BL-035).
4. List/search: fields searched, filters (active), sort, pagination.
5. Where suppliers are picked: PO create (poService/poRepository) — active check? payment terms copy? SCO: any code?
6. Changes this branch already made to supplier code (m1-stock commits: supplier-item inactive-item check) — file + symbol.
7. Frontend supplier screens: components, forms, fields sent, batch edit UI.
8. Test fixtures usable for supplier tests (existing *.test.ts helpers).
## Scope (required — every line filled)
- In: read-only lookup, answers 1–8
- Out: any edits; design proposals beyond one-line notes
- May edit: only your report file        May read: anything
- Size: report ≤ 180 lines
- Stop if: n/a
## Inputs
- docs/modules/suppliers.md, docs/modules/inventory.md, docs/modules/purchase-order.md
## Done when
- All 8 answered with file + symbol
Write your report to: .pipeline/m1-stock/reports/34-explorer.md (if you can't write, return it inline)
