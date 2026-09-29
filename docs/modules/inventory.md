---
module: inventory
spec: docs/specs/inventory.md (draft v0) + docs/specs/grn-stock.md
last_verified_commit: 0a406f4
last_verified_on: 2026-09-27
depends_on: [suppliers]
---

# Inventory / Asset — as-built map

> What the code **is** (the spec says what it **should be**). Agents read this before touching the module
> and only explore code changed since `last_verified_commit`
> (`git diff 0a406f4..HEAD --stat -- backend/src/db/schemas/02_procurement-catalog.ts backend/src/service/assetService.ts backend/src/repository/assetRepository.ts backend/src/routes/asset.ts backend/src/types/asset.types.ts frontend/src/lib/api/asset frontend/src/components/pages/inventory frontend/src/components/views/inventory`).
> Use symbol names, not line numbers — lines rot.

## Summary
Full CRUD/list slice for the master data that everything else in procurement hangs off: `itemMaster`
(raw materials/consumables/spares), `serviceMaster` (job-work services), `machines`, and `locations`
(the 4-type location model). Also owns the append-only `inventory_ledger` — the single stock-posting
mechanism in the codebase, currently written only from GRN accept/bypass/correction (see `grn.md`).
All list endpoints paginated; all mutating endpoints are `super-admin`/`back_office` only.

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| schema | `backend/src/db/schemas/02_procurement-catalog.ts` | `itemMaster`, `serviceMaster`, `locations`, `locationTypeEnum`, `inventoryLedger`, `inventoryTxTypeEnum`, `inventoryRefTypeEnum`, `machines`, `machineStatusEnum` |
| types | `backend/src/types/asset.types.ts` | `assetItemSchema`, `assetServiceSchema`, `assetLocationSchema`, `assetMachineSchema`, `assetInventoryMovementSchema`, `assetInventoryMovementCreateSchema`, `inventoryReferenceTypeSchema`, `inventoryTransactionTypeSchema`, `assetLastRateSchema` |
| repository | `backend/src/repository/assetRepository.ts` | `listItems`, `createItem`, `updateItem`, `getLastRate`, `listServices`, `createService`, `updateService`, `listInventoryMovements`, `listLocations`, `createLocation`, `updateLocation`, `createInventoryMovement`, `listMachines`, `createMachine`, `updateMachine` |
| service | `backend/src/service/assetService.ts` | mirrors repository method names 1:1; adds pagination-meta wrapping and unique-constraint → `ConflictError` translation (`getConflictError`) |
| controller | `backend/src/controller/assetController.ts` | `listItems`, `createItem`, `updateItem`, `getLastRate`, `listServices`, `createService`, `updateService`, `listInventoryMovements`, `createInventoryMovement`, `listLocations`, `createLocation`, `updateLocation`, `listMachines`, `createMachine`, `updateMachine` |
| routes | `backend/src/routes/asset.ts` + `END_POINTS.asset` (`backend/src/routes/end-points.ts`) | mounted under `/api/asset` |
| frontend api | `frontend/src/lib/api/asset/fetchers.ts`, `frontend/src/lib/api/asset/queries.ts` | `useItemsQuery`/`useCreateItemMutation`/`useUpdateItemMutation`, `useServicesQuery`/`useCreateServiceMutation`/`useUpdateServiceMutation`, `useMachinesQuery`/`useCreateMachineMutation`/`useUpdateMachineMutation`, `useLocationsQuery`/`useCreateLocationMutation`/`useUpdateLocationMutation`, `useMovementsQuery`/`useCreateMovementMutation` |
| frontend ui | `frontend/src/app/(protected)/inventory`, `frontend/src/components/views/inventory/{InventoryView,InventoryItemsView,InventoryServicesView,InventoryMachinesView,InventoryLocationsView,InventoryMovementsView}.tsx`, `frontend/src/components/pages/inventory/{InventoryItemsManager,InventoryServicesManager,InventoryMachinesManager,InventoryLocationsManager,InventoryMovementsManager,InventoryBackButton}.tsx`, `frontend/src/types/asset.ts` | |

## Data model
- `itemMaster` — `sku` (unique), `name`, `description`, `category` (free text: "Raw Material"/"Consumable"/"Spare Part" by convention, not an enum), `uom`, `reorderLevel`, `currentStock`, `averageCostPaise`, `isActive`, `createdBy`/`createdAt`. **`currentStock` and `averageCostPaise` are plain columns with no computed-from-ledger trigger or service code that writes them from postings** — see Known gaps.
- `serviceMaster` — `code` (unique), `name`, `description`, `sacCode`, `defaultUom`, `isActive`, audit columns including `lastUpdatedBy`/`lastUpdatedAt`.
- `machines` — `name`, `type` (free text), `status` (`machine_status` enum: `idle`, `running`, `maintenance`, `breakdown`), `lastMaintenanceAt`, audit columns.
- `locations` — `name`, `type` (`location_type` enum: `main_store`, `vendor_premise`, `finished_goods`, `scrap_yard`), `isVirtual`, `linkedVendorId` → `supplier_master.id` (used for `vendor_premise` locations tied to a subcontractor), `createdAt`.
- `inventoryLedger` — append-only movement log: `itemId` → `itemMaster`, `locationId` → `locations`, `batchNumber` (melt/heat number), `transactionType` (`inventory_tx_type`: `in`, `out`, `adjustment`), `referenceType` (`inventory_ref_type`: `grn`, `grn_bypass`, `pro`, `sco_issue`, `sco_receipt`, `job_order_issue`, `scrap_dispatch`, `stock_adjustment` — only `grn`/`grn_bypass`/`stock_adjustment` are ever written today), `referenceId` (id of the GRN/SCO/job order — no FK constraint, just an int), `quantityChange` (signed), `balanceAfter` (running balance per item+location, computed in `createInventoryMovement`), `unitCostPaise`, `totalValueChangePaise` (= `quantityChange * unitCostPaise`, rounded), `createdBy`, `createdAt`.
- FK relationships: `itemMaster` ← `purchaseOrderItems.itemId`, `purchaseRequestItems.itemId`, `supplierItems.itemId`, `grnItems` (via `purchaseOrderItems`); `locations` ← `inventoryLedger.locationId`, `linkedVendorId` → `supplierMaster`; `machines` currently has no FK consumers elsewhere in the schema (referenced only by `purchaseRequests.assetId` as a bare int, not an FK).

## API
| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/api/asset/items` | super-admin, back_office | List item master rows, paginated, searchable (sku/name/category) |
| POST | `/api/asset/items` | super-admin, back_office | Create item master row |
| PATCH | `/api/asset/items/:id` | super-admin, back_office | Update item master row |
| GET | `/api/asset/items/:itemId/last-rate` | super-admin, back_office | Rate lookup fallback chain: PO history → supplier catalog → item avg-cost estimate |
| GET | `/api/asset/services` | super-admin, back_office | List service master rows, paginated, searchable |
| POST | `/api/asset/services` | super-admin, back_office | Create service master row |
| PATCH | `/api/asset/services/:id` | super-admin, back_office | Update service master row |
| GET | `/api/asset/inventory/movements` | super-admin, back_office | List ledger rows, paginated, filterable by item/location/referenceType/transactionType/date range |
| POST | `/api/asset/inventory/movements` | super-admin, back_office | Record an ad-hoc movement directly (bypasses GRN flow entirely) |
| GET | `/api/asset/locations` | super-admin, back_office | List locations, paginated, searchable (name/type) |
| POST | `/api/asset/locations` | super-admin, back_office | Create location |
| PATCH | `/api/asset/locations/:id` | super-admin, back_office | Update location |
| GET | `/api/asset/machines` | super-admin, back_office | List machines, paginated, searchable, filterable by status |
| POST | `/api/asset/machines` | super-admin, back_office | Create machine |
| PATCH | `/api/asset/machines/:id` | super-admin, back_office | Update machine |

Full shapes: `cd backend && bun run contract:query "<METHOD /path>"`.

## Key flows
- `createInventoryMovement` (the only stock-posting primitive, called both directly via this route and internally from `grnService`): opens a transaction, `SELECT ... FOR UPDATE` on the most recent ledger row for that `itemId`+`locationId` (row-locks to prevent a lost-update race between two concurrent movements), computes `balanceAfter = previousBalance + quantityChange`, inserts the new row with `totalValueChangePaise = round(quantityChange * unitCostPaise)`.
- `getLastRate`: tries, in order, (1) most recent `purchaseOrderItems.unitPricePaise` for that supplier+item joined through `purchaseOrders`, (2) `supplierItems.supplierUnitPricePaise` for that supplier+item, (3) `itemMaster.averageCostPaise`. Returns `undefined`/404 only if none of the three exist.
- Item/service/location/machine CRUD all follow the same shape: controller parses via Zod → service (pagination-meta wrap on list, `ConflictError` translation on unique-constraint violation for `createItem`/`updateItem`/`createService`/`updateService`) → repository (plain Drizzle select/insert/update, `getTableColumns` for full-row projections).

## Invariants & gotchas
- **`itemMaster.currentStock` and `itemMaster.averageCostPaise` are never recomputed from `inventory_ledger` postings anywhere in the codebase.** They are writable via `assetItemCreateSchema`/`assetItemUpdateSchema` (manual entry only) and read by `getLastRate`'s fallback, but no service sums ledger movements back onto the item row. The ledger's own `balanceAfter` is the only place a running per-item-per-location balance actually lives. Any UI or report reading `itemMaster.currentStock` as "true current stock" is reading a field nothing keeps in sync with postings.
- `POST /api/asset/inventory/movements` lets a `super-admin`/`back_office` user post any `referenceType` (including `grn`/`grn_bypass`) directly, with no check that a matching GRN/PO/SCO row for `referenceId` actually exists — `referenceId` is a bare int, not an FK. This is a second, unguarded path into the same ledger that GRN's flow posts through under business rules (over-receipt guard, QA state machine, etc.).
- `locations.linkedVendorId` + `isVirtual` model a subcontractor's premises as a "location" for `sco_issue`/`sco_receipt` postings, but nothing in the current codebase writes those reference types (subcontracting has no service/controller layer yet — see `grn.md` Known gaps).
- `machines` has no FK from anything; `purchaseRequests.assetId` (comment: "Only populated if type is 'maintenance' or 'tooling'") is a plain int, not `references(() => machines.id)`.
- `category` on `itemMaster` and `type` on `machines` are free text, not enums — no DB constraint against arbitrary values.

## Tests
| File | Covers |
|---|---|
| — | none — no `*.test.ts` file targets asset service/repository/controller |

## Known gaps / debt
- No mechanism keeps `itemMaster.currentStock`/`averageCostPaise` consistent with `inventory_ledger` — this is the single biggest correctness gap in the procurement slice today (flagged in both this file and `grn.md`).
- `POST /api/asset/inventory/movements` is a fully open direct-posting endpoint with no cross-check against the document (`referenceId`) it claims to be for — a second, less-guarded path to the same ledger that GRN posts through.
- `inventory_ref_type` enum values `pro`, `sco_issue`, `sco_receipt`, `job_order_issue`, `scrap_dispatch` are declared but never written by any current code path.
- No automated tests for any part of this module.

## Known gaps (from spec draft 2026-09-27)
Rule ids refer to `docs/specs/grn-stock.md`.
- BR-GRN-24: `totalValueChangePaise` uses `Math.round`, which is asymmetric for negatives; needs round half away from zero.
- BR-GRN-37: `itemMaster.currentStock` is never updated from ledger postings.
- BR-GRN-38/39: `itemMaster.averageCostPaise` is never recomputed; PR estimates and `getLastRate` fallback read a stale value.
- BR-GRN-40: `assetItemCreateSchema`/`assetItemUpdateSchema` accept `currentStock` and `averageCostPaise`; enum value `opening_stock` missing.
- BR-GRN-41: no reconciliation query exists.
- BR-GRN-42: `createInventoryMovement` locks only the last ledger row for item+location, so the first posting for a new pair is unprotected; should lock the `item_master` row.
- BR-GRN-43: `POST /asset/inventory/movements` accepts any `referenceType` (incl. `grn`, `grn_bypass`) with no document check and no mandatory reason (BL-015).
- BR-GRN-44: manual adjustments have no negative-balance check, no cost > 0 check on stock-in, and take the client's cost on stock-out.
- BR-GRN-43 roles: movements route allows super-admin, back_office only; spec adds owner.

## Known gaps (from inventory spec draft 2026-09-29)
Rule ids refer to `docs/specs/inventory.md`.
- BR-INV-01/09/11/16: SKU and service code unique only case-sensitively (`item_master_sku`, `service_master_code`); location and machine names have no uniqueness at all.
- BR-INV-02: `category`, `uom` free text (`assetItemCreateSchema`).
- BR-INV-03: `InventoryItemsManager` form has editable `currentStock` / `averageCostPaise` fields (see also BR-GRN-40).
- BR-INV-04/14: `updateItem` / `updateLocation` allow changing SKU, UOM, location type and `linkedVendorId` after postings.
- BR-INV-05/10: PO and supplier-item paths — verify they reject inactive items/services (PR does, BR-PR-06).
- BR-INV-12/13: no check that `vendor_premise` has a supplier (or others don't); no limit on `main_store` count.
- BR-INV-15: `locations` and `machines` have no `isActive` column; `locations` and `itemMaster` have no `lastUpdatedBy/At` (BR-INV-25).
- BR-INV-16: `machines` has no `code` column (BR-AUTH-26 expects one).
- BR-INV-17: `lastMaintenanceAt` accepts future dates.
- BR-INV-19: no stock-by-location endpoint; item list is the only stock view.
- BR-INV-21: `InventoryMovementsManager` default form value is `referenceType: "grn"`.
- BR-INV-22/23: movement create takes a signed change, not a counted qty; no opening-stock-once check.
- BR-INV-24: `getLastRate` takes the newest PO line regardless of PO status (draft/cancelled count) and returns average cost 0 as a rate.
- `createInventoryMovement` does not check item active or location exists before insert (FK error → 500).

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
