---
module: inventory
spec: docs/specs/inventory.md (v1 frozen) + docs/specs/grn-stock.md (v1 frozen)
last_verified_commit: eea4fb1
last_verified_on: 2026-09-29
depends_on: [suppliers, grn]
---

# Inventory / Asset — as-built map

> What the code **is** (the spec says what it **should be**). Agents read this before touching the module
> and only explore code changed since `last_verified_commit`
> (`git diff eea4fb1..HEAD --stat -- backend/src/db/schemas/02_procurement-catalog.ts backend/src/service/assetService.ts backend/src/repository/assetRepository.ts backend/src/repository/stockPostingRepository.ts backend/src/routes/asset.ts backend/src/types/asset.types.ts frontend/src/lib/api/asset frontend/src/components/pages/inventory frontend/src/components/views/inventory`).
> Use symbol names, not line numbers — lines rot.

## Summary
Master data (items, services, machines, locations), a read-only stock view and ledger list, and one manual
screen for stock-take and opening stock. All BR-INV-01..25 are built and tested
(`inventoryMasters.test.ts`, `inventoryStock.test.ts`). Every stock change goes through
`stockPostingRepository.postStock` (see `grn.md`). Masters are never deleted, only deactivated.

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| schema | `backend/src/db/schemas/02_procurement-catalog.ts` | `itemMaster` (+ `standardRatePaise`, `lastUpdated*`), `serviceMaster`, `locations` (+ `isActive`, `lastUpdated*`), `machines` (+ `code`, `isActive`), `inventoryLedger`, enums; functional unique indexes `lower(btrim(x))`; partial unique: one `main_store`, one `vendor_premise` per supplier |
| types | `backend/src/types/asset.types.ts` | item/service/location/machine create + update schemas (`.strict()`), `ITEM_CATEGORIES`, `ITEM_UOMS`, manual movement discriminated union (`countedQty` for stock-take, `qty` + `unitCostPaise` for opening), stock view + last-rate schemas |
| repository | `backend/src/repository/assetRepository.ts` | `listItems`, `createItem`, `updateItemLocked`, `isItemInUse`, `getLastRate`, `listStock`, `listInventoryMovements`, `manualMovement`, `inventoryReconciliation`, location/service/machine CRUD, `likePattern` |
| posting | `backend/src/repository/stockPostingRepository.ts` | `postStock` (locks item, refuses unknown 404 / inactive 400 location, `blockNegative`) |
| service | `backend/src/service/assetService.ts` | validation not expressible in Zod: unit-dependent whole numbers (`assertReorderLevelFitsUnit`), in-use locks, main-store rules, `getConflictError` (unwraps drizzle `cause`) |
| routes | `backend/src/routes/asset.ts` + `END_POINTS.asset` | guards `requirePermission(key)`; `GET /machines` is any signed-in user, service allows `asset.manage` or `pr.link_machine` (BR-AUTH-26) |
| frontend | `frontend/src/lib/api/asset/{fetchers,queries}.ts`, `frontend/src/components/{pages,views}/inventory/*` (incl. `InventoryStockManager`, `InventoryStockView`, `inventory-format.ts`), `frontend/src/app/(protected)/inventory/stock/page.tsx`, `frontend/src/types/asset.ts` | UI gated by `useCan(key)` |

## API
| Method | Path | Key (seed roles holding it) | Purpose |
|---|---|---|---|
| GET | `/api/asset/items` | `inventory.view` (ow, bo, fs) | Items list |
| POST / PATCH | `/api/asset/items`, `/items/:id` | `asset.manage` (bo) | Create / edit / (de)activate item |
| GET | `/api/asset/items/:itemId/last-rate` | `inventory.view` | BR-INV-24 chain, returns `source` |
| GET / POST / PATCH | `/api/asset/services`, `/machines` | `asset.manage` (bo) | Masters. `GET /machines`: any login, service check `asset.manage` or `pr.link_machine` |
| GET | `/api/asset/locations` | `asset.manage` or `inventory.view` (ow, bo, fs) | Read — pickers on stock view and stock-take form (auth-setup v10) |
| POST / PATCH | `/api/asset/locations`, `/locations/:id` | `asset.manage` (bo) | Create / edit / (de)activate |
| GET | `/api/asset/inventory/stock` | `inventory.view` | Stock view: unit, stock, average, value, per-location balances, reorder flag, inactive tag |
| GET | `/api/asset/inventory/movements` | `inventory.view` | Read-only ledger list, names the source document |
| POST | `/api/asset/inventory/movements` | `inventory.adjust` (ow, bo) | Stock-take (counted qty → posts difference; 0 → 400) or opening stock (no rows yet, else 409) |
| GET | `/api/asset/inventory/reconciliation` | `inventory.view` | Mismatch rows only |

## Invariants & gotchas
- Item SKU and unit lock once the item has any ledger row or PR/PO/supplier-item line (`ITEM_IN_USE`); check + update run in one tx with the item row locked (`updateItemLocked`). Location type/supplier lock once it has ledger rows (`LOCATION_IN_USE`).
- The only active `main_store` can't be deactivated (409, decided by Arun 2026-09-29; spec line pending BL-048). With the one-main_store index this means the main store is never deactivated.
- `isVirtual` is derived from type (vendor_premise → true, else false); client value ignored.
- Reorder level is whole for pcs/set (checked only when reorderLevel or unit changes).
- Last rate: newest line with rate > 0 on an approved-or-later PO → catalog → average > 0 → standard rate. Legacy items with standard rate 0 return 0 (source `standard_rate`). Source `pr_estimate` means item average (rename in BL-047).
- `standard_rate_paise` defaults to 0 in the DB for old rows; the API requires > 0 on create.
- Search uses `likePattern` (escapes `\ % _`); `ilike` on an enum column needs a `::text` cast.
- drizzle wraps Postgres errors in `cause` — read the code/constraint from there for 23505 → 409.
- Reconciliation aggregates the whole ledger per call — don't poll it.
- Super-admin passes every key. Test fixtures must be real employees with seed roles (keys come from the DB).

## Tests
| File | Covers |
|---|---|
| `backend/tests/service/inventoryMasters.test.ts` | BR-INV-01..18, 24, 25 |
| `backend/tests/service/inventoryStock.test.ts` | BR-INV-06, 07, 10, 19..23 |
| `backend/tests/service/stockPosting.test.ts` | grn-stock BR-GRN-21..44 incl. manual movements |

## Known gaps / debt
- BR-INV-05 PO half (PR line approved before deactivation) → BL-046 (PO code, auth session). SCO part → subcontracting build.
- `inventory_ref_type` values `pro`, `job_order_issue`, `scrap_dispatch` still unwritten.
- Stock list search not indexable (BL-050). No reconciliation screen (BL-045).

## ERP benchmark (with links)
- ERPNext: default stock UOM cannot change once any stock transaction exists — make a new item instead ([Frappe forum](https://discuss.frappe.io/t/forced-item-stock-uom-via-db-set-value-what-should-i-verify-afterward/163769), [ERPNext Item](https://manualpt.angolaerp.co.ao/docs/user/manual/en/stock/item)). Adopted as BR-INV-04.
- ERPNext: disabled items can't be picked in any new transaction; history stays ([ERPNext Item](https://manualpt.angolaerp.co.ao/docs/user/manual/en/stock/item)). Adopted as BR-INV-05.
- ERPNext: Stock Reconciliation takes the counted qty (and rate) and posts the difference; purpose "Opening Stock" is a separate mode ([docs](https://docs.frappe.io/erpnext/user/manual/en/stock-reconciliation)). Adopted as BR-INV-22/23.
- ERPNext: a warehouse with stock ledger entries can't be deleted; ledger entries are never deleted ([issue #10083](https://github.com/frappe/erpnext/issues/10083), [forum](https://discuss.frappe.io/t/unable-to-delete-stock-ledger-entry/69901)). Adopted as BR-INV-14/20.
- Odoo: Physical Inventory — enter counted qty per product+location, Apply posts a stock move with an "Inventory Reason" (default "Physical Inventory") visible in Moves History ([Odoo 17 docs](https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/inventory/warehouses_storage/inventory_management/count_products.html)). Adopted: reason required (BR-GRN-43) + counted-qty entry.
- SAP B1: inventory UoM can't change once the item has been booked; items in transactions can't be deleted, only set inactive ([SAP Community](https://community.sap.com/t5/enterprise-resource-planning-q-a/inventory-counting-after-changing-uom/qaq-p/12761058), [SAP Learning](https://learning.sap.com/courses/managing-logistics-in-sap-business-one/creating-item-master-data-and-item-groups-in-sap-business-one)).
- SAP B1: counting (Inventory Counting) and posting (Inventory Posting) are two documents ([SAP how-to PDF](https://help.sap.com/doc/011000358700000063402014e/9.0/en-US/HowtoConductInventory.pdf)). Parked: single-step stock-take for a small plant; two-step with approval in "Not now".
- Not adopted for M1: bins/multi-warehouse, UoM groups/conversion, batch balances, auto material request from reorder level — too heavy for one store; revisit with SCO (M2) and production.


## History
| Date | PR / commit | Change |
|---|---|---|
| 2026-09-27 | 0a406f4 | Initial as-built map written |
| 2026-09-29 | work/m1-stock 8cab134..1fe3cfd | grn-stock parts: posting engine, manual movements, reconciliation, item API |
| 2026-09-29 | work/m1-stock e8f395c..6257268 | inventory v1 built: masters rules, stock view, stock-take/opening, last rate, indexes, tests |
| 2026-09-29 | work/m1 da516f2..eea4fb1 | Merged into work/m1; routes on permission keys, `GET /machines` shared with `pr.link_machine`; inactive-item check for PR lines now from work/m1 |
