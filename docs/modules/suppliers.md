---
module: suppliers
spec: docs/specs/suppliers.md (v1 frozen)
last_verified_commit: e27b301
last_verified_on: 2026-09-29
depends_on: [inventory]
---

# Suppliers — as-built map

> What the code **is** (the spec says what it **should be**). Agents read this before touching the module
> and only explore code changed since `last_verified_commit`
> (`git diff e27b301..HEAD --stat -- backend/src/db/schemas/02_procurement-suppliers.ts backend/src/service/supplierService.ts backend/src/repository/supplierRepository.ts backend/src/routes/supplier.ts backend/src/types/supplier.types.ts backend/src/controller/supplierController.ts frontend/src/lib/api/suppliers frontend/src/components/pages/suppliers frontend/src/components/views/suppliers`).
> Use symbol names, not line numbers — lines rot.

## Summary
Supplier master (tax ids, contact, payment terms, active flag), price lists for items and services, a change
history, search, and an all-or-nothing batch price edit. BR-SUP-01..24 are built and tested
(`supplierService.test.ts`). BR-SUP-25 (403 naming the key) comes from the auth layer on work/m1. The PO side of
BR-SUP-06/07 (copy terms, block inactive supplier) is PO code on work/m1; the SCO side is the subcontracting build.

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| schema | `backend/src/db/schemas/02_procurement-suppliers.ts` | `supplierMaster` (unique `uq_supplier_master_name_norm` = lower(btrim(name)); GSTIN unique ignoring case), `supplierItems`, `supplierServices` (unique per supplier+item/service), `supplierHistory` + `supplier_history_entity` enum (index supplier_id, changed_at), `supplierBankDetails` (schema only) |
| types | `backend/src/types/supplier.types.ts` | create/update (`mode: master \| item`), list query (`status`, pageSize 1–100), item/service create, batch edit (≤ 100 rows; per-row target checks in the service), history query; GST slab list; field caps (name 200, contact 200, phone 30, email 254, address 500, SKU 100, qty ≤ 1e9) |
| repository | `backend/src/repository/supplierRepository.ts` | `list` (escapeLike; name/contact/email/phone/GSTIN/SKU), `create`, `findItemRow`/`findServiceRow` (scoped by supplier), `updateItemRow`/`updateServiceRow`, `lockItemRowsOrdered`/`lockServiceRowsOrdered`, `insertHistory`, `listHistory` |
| service | `backend/src/service/supplierService.ts` | GSTIN/PAN normalise + match (also against stored values under row lock), name/GSTIN clash → 409 via `getConflictError` (reads `error.cause`), `editSupplierItems`/`editSupplierServices` (one tx, `BatchRollback`), history writes in the same tx |
| controller | `backend/src/controller/supplierController.ts` | batch 400 `BATCH_FAILED` body `{data, summary}` built here (global onError only emits message + code) |
| routes | `backend/src/routes/supplier.ts` + `END_POINTS.supplier` | per-route guards: reads `supplier.view` (sa, ow, bo, fs), writes `supplier.manage` (sa, bo); `requireRole` + `// perm:` |
| frontend | `frontend/src/lib/api/suppliers/{fetchers,queries,permissions}.ts`, `frontend/src/components/pages/suppliers/*` (incl. `SupplierHistoryCard`, `SupplierBatchEditDialog`), `frontend/src/components/views/suppliers/*`, `frontend/src/types/suppliers.ts` | `canManageSuppliers` = role list with `// perm:` (auth session converts) |

## API
| Method | Path | Key | Purpose |
|---|---|---|---|
| GET | `/api/supplier/listSuppliers` | `supplier.view` | Search + `status` filter, paginated |
| GET | `/api/supplier/:supplierId/detail` | `supplier.view` | Supplier + counts |
| GET | `/api/supplier/:supplierId/listItems`, `/listServices` | `supplier.view` | Price lists (inactive rows included, flagged) |
| GET | `/api/supplier/:supplierId/history` | `supplier.view` | Change history, paginated |
| POST | `/api/supplier/createSupplier` | `supplier.manage` | Create ± item price list, all or nothing; returns the supplier row |
| PATCH | `/api/supplier/updateSupplier/:id` | `supplier.manage` | Master edit / (de)activate, or one item row (`mode`) |
| POST | `/api/supplier/:supplierId/createItem`, `/createService` | `supplier.manage` | Add one price-list row |
| PATCH | `/api/supplier/:supplierId/editItem`, `/editService` | `supplier.manage` | Batch edit ≤ 100 rows, all or nothing |

## Invariants & gotchas
- Suppliers and price-list rows are never deleted — deactivate. Inactive rows are skipped by last rate (`assetRepository.getLastRate`); inactive suppliers are not checked there (their lists stay readable, BR-SUP-07).
- Batch edit: lock all of the supplier's rows ordered by id first (deadlock-safe), then apply in request order; any failed row rolls back everything incl. history.
- Changing GSTIN with a stale stored PAN → 400; the form refills PAN from GSTIN chars 3–12.
- History also records SKU, qty, unit and lead-time changes (more than BR-SUP-10 lists; BL-055).
- Error text is a fixed sentence per case (BR-SUP-22); an unmapped 23505 → "Already exists".
- Name unique index can fail `db:push` on a dev DB that already has names clashing by case/spaces.

## Tests
| File | Covers |
|---|---|
| `backend/src/service/supplierService.test.ts` | BR-SUP-01..24 (HTTP, real DB) |

## Known gaps / debt
- PO supplier picker should request `status=active` (BR-SUP-24) — PO screen, auth session (BL-053).
- Item vs service batch code near-duplicate (BL-033). Search not trigram-indexed (BL-032).
- Bank details schema only (spec "Not now").

## ERP benchmark (with links)
- ERPNext: disabled suppliers are hidden from new transactions but stay in history; "Hold" blocks invoices, payments or both until a date. Tax ID + India Compliance GSTIN/PAN fields; default payment terms template flows into purchase docs. [Supplier](https://docs.frappe.io/erpnext/user/manual/en/supplier)
- ERPNext Item Price: rate per price list + supplier + UOM, with valid from/upto, minimum qty, lead time; several prices per item allowed. [Item Price](https://docs.frappe.io/erpnext/v13/user/manual/en/stock/item-price), [Price Lists](https://docs.erpnext.com/docs/user/manual/en/price-lists)
- Odoo: vendor pricelist line per product = vendor, price, min qty, lead time, sequence, validity; lead time drives PO expected date; bulk import via XLSX/CSV. [Import vendor pricelist](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/purchase/products/pricelist.html), [Lead times](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/warehouses_storage/replenishment/lead_times.html)
- SAP B1: business partner "Active/Inactive" (frozen) by date range; inactive BPs cannot be used on new documents. [Frozen field](https://biuan.com/BusinessPartners/Frozen/), [SAP Community](https://community.sap.com/t5/enterprise-resource-planning-q-a/validfor-at-business-partner-master-data/qaq-p/10971448)
- SAP B1 India: GSTIN held on BP master (per address, so a multi-state vendor has several GSTINs); required on GST documents. [GST how-to (PDF)](https://help.sap.com/doc/e0d2da20184b4d969c6d3748f92077d5/10.0/en-US/How_to_Work_with_GST_in_the_India_Localization_of_SAP_Business_One.pdf)
- Adapted for us: one GSTIN per supplier, deactivate not delete, one current price per supplier+item with change history, no validity dates or qty breaks yet (all in spec "Not now").


## History
| Date | PR / commit | Change |
|---|---|---|
| 2026-09-27 | 0a406f4 | Initial as-built map written |
| 2026-09-29 | — | Spec draft v0 linked; gaps-vs-spec table and ERP benchmark added |
| 2026-09-29 | work/m1-stock f3e6607..e27b301 | suppliers v1 built: master rules, price lists, history, all-or-nothing batch edit, tests |
