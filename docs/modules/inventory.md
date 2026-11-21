---
module: inventory
spec: docs/specs/inventory.md (v1 frozen) + docs/specs/grn-stock.md (v1 frozen)
last_verified_commit: eea4fb1
last_verified_on: 2026-09-29
partially_verified: d386e04 (2026-11-21) — dispatch touch points (ref types `delivery_note` / `delivery_note_cancel`, movements number + labels); 14d31d1 — stock-transfer touch points (location type `store`, transfer ref types, movements list number + Source type filter, screens list, Known gaps); 986ea76 — last-rate chain (repository/service rows, API rows, gotcha); de68fdf — posting row, ledger ref types, Known gaps
depends_on: [suppliers, grn, rfq, stock-transfer, dispatch]
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
`stockPostingRepository.postStock` (see `grn.md`). Masters are never deleted, only deactivated. Moves between our own locations are stock transfers (see `stock-transfer.md`).

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| schema | `backend/src/db/schemas/02_procurement-catalog.ts` | `itemMaster` (+ `standardRatePaise`, `lastUpdated*`), `serviceMaster`, `locations` (+ `isActive`, `lastUpdated*`), `machines` (+ `code`, `isActive`), `inventoryLedger`, enums; functional unique indexes `lower(btrim(x))`; partial unique: one `main_store`, one `vendor_premise` per supplier |
| types | `backend/src/types/asset.types.ts` | item/service/location/machine create + update schemas (`.strict()`), `ITEM_CATEGORIES`, `ITEM_UOMS`, manual movement discriminated union (`countedQty` for stock-take, `qty` + `unitCostPaise` for opening), stock view + last-rate schemas (`onDate`, source `contract` + contract fields, `assetLastRatesQuerySchema` / `assetLastRatesSchema`) |
| repository | `backend/src/repository/assetRepository.ts` | `listItems`, `createItem`, `updateItemLocked`, `isItemInUse`, `listInventoryMovements` (left-joins `grns`, `purchase_returns`, `stock_transfers`, `delivery_notes`; `sourceNumber` = coalesce of GRN / PRO / ST / DN number), `getLastRate` / `getLastRates` (both delegate to `rateChainRepository.findRateChoices`), `listStock`, `manualMovement`, `inventoryReconciliation`, location/service/machine CRUD, `likePattern` |
| rate chain | `backend/src/repository/rateChainRepository.ts` | `findRateChoices(executor, supplierId, itemIds, {onDate, includeContract, includeFallback?})` — the single last-rate chain, shared with `poRepository.findLastRates` and the RFQ award; `contractUsableOn`, `APPROVED_OR_LATER_PO_STATUSES` |
| posting | `backend/src/repository/stockPostingRepository.ts` | `postStock` (locks item, refuses unknown 404 / inactive 400 location, `blockNegative` → 409 `INSUFFICIENT_STOCK`; row value and average in BigInt with `assertMoneyInRange` / `assertStockValueInRange`) |
| service | `backend/src/service/assetService.ts` | validation not expressible in Zod: unit-dependent whole numbers (`assertReorderLevelFitsUnit`), in-use locks, main-store rules, `getConflictError` (unwraps drizzle `cause`); `getLastRate(itemId, query, actor)`, `getLastRates(query, actor)`, `shapeLastRates` (one `fulfilmentByLine` call for `qtyLeft`) |
| routes | `backend/src/routes/asset.ts` + `END_POINTS.asset` | guards `requirePermission(key)`; `GET /machines` is any signed-in user, service allows `asset.manage` or `pr.link_machine` (BR-AUTH-26) |
| frontend | `frontend/src/lib/api/asset/{fetchers,queries}.ts`, `frontend/src/components/{pages,views}/inventory/*` (incl. `InventoryStockManager`, `InventoryStockView`, `InventoryMovementsManager`, `InventoryStockCheckView`, `inventory-format.ts`), `frontend/src/app/(protected)/inventory/{stock,movements,stock-check}/page.tsx`, `frontend/src/types/asset.ts` | UI gated by `useCan(key)`. Nav cards (`InventoryView`): items, services, machines, locations, stock, movements, stock transfers, stock check |
| frontend (screens) | `/inventory/stock` ("Move stock" per location line → new transfer, needs `stock_transfer.manage`), `/inventory/movements` (Source type select; page reads `?referenceType=` on the server and passes `initialReferenceType`; transfer rows labelled "Stock transfer" / "Transfer reversed" and linked; dispatch rows "Delivery note" / "Delivery note cancelled", number links to `/delivery-notes/:id` (`InventoryMovementsManager`, `types/asset.ts`)), `/inventory/stock-check` (read-only reconciliation mismatch list, BR-INV-29), `/inventory/reorder` + `/inventory/reorder/runs/[id]` (see `reorder.md`), `/inventory/stock-transfers/*` (see `stock-transfer.md`) | |

## API
| Method | Path | Key (seed roles holding it) | Purpose |
|---|---|---|---|
| GET | `/api/asset/items` | `inventory.view` (ow, bo, fs) | Items list |
| POST / PATCH | `/api/asset/items`, `/items/:id` | `asset.manage` (bo) | Create / edit / (de)activate item |
| GET | `/api/asset/items/:itemId/last-rate` | `inventory.view` | Rate chain for one item; query `supplierId`, `onDate?` (IST day, default today); returns `ratePaise`, `source` (+ `contractItemId`, `contractId`, `contractNumber`, `gstPercent`, `qtyLeft` when `contract`) |
| GET | `/api/asset/items/last-rates` | `inventory.view` | Same chain, batched: `supplierId`, `itemIds=1,2,3` (max 200), `onDate?`; `data: [{itemId, …}]`, unknown items left out |
| GET / POST / PATCH | `/api/asset/services`, `/machines` | `asset.manage` (bo) | Masters. `GET /machines`: any login, service check `asset.manage` or `pr.link_machine` |
| GET | `/api/asset/locations` | `asset.manage` or `inventory.view` (ow, bo, fs) | Read — pickers on stock view and stock-take form (auth-setup v10) |
| POST / PATCH | `/api/asset/locations`, `/locations/:id` | `asset.manage` (bo) | Create / edit / (de)activate |
| GET | `/api/asset/inventory/stock` | `inventory.view` | Stock view: unit, stock, average, value, per-location balances, reorder flag, inactive tag |
| GET | `/api/asset/inventory/movements` | `inventory.view` | Read-only ledger list; filters incl. `referenceType`; `sourceDocument.number` / `sourceNumber` set for GRN types, `pro` / `pro_cancel`, `stock_transfer` / `stock_transfer_reversal` and `delivery_note` / `delivery_note_cancel` |
| POST | `/api/asset/inventory/movements` | `inventory.adjust` (ow, bo) | Stock-take (counted qty → posts difference; 0 → 400) or opening stock (no rows yet, else 409). Only `stock_adjustment` / `opening_stock`; document types incl. `stock_transfer`, `stock_transfer_reversal`, `delivery_note`, `delivery_note_cancel` are refused (`documentMovementReferenceTypeSchema`, BR-GRN-43) |
| GET | `/api/asset/inventory/reconciliation` | `inventory.view` | Mismatch rows only (Stock check screen) |

## Invariants & gotchas
- Item SKU and unit lock once the item has any ledger row or PR/PO/supplier-item line (`ITEM_IN_USE`); check + update run in one tx with the item row locked (`updateItemLocked`). Location type/supplier lock once it has ledger rows (`LOCATION_IN_USE`).
- The only active `main_store` can't be deactivated (409, decided by Arun 2026-09-29; spec line pending BL-048). With the one-main_store index this means the main store is never deactivated.
- Location types: `main_store`, `vendor_premise`, `finished_goods`, `scrap_yard`, `store` (added for stock transfer, BR-STR-32 / BR-INV-11; any number allowed). `isVirtual` is derived from type (only `vendor_premise` → true; `store` is not virtual); client value ignored.
- Reorder level is whole for pcs/set (checked only when reorderLevel or unit changes).
- Last rate (one chain, `findRateChoices`, BR-INV-24 + BR-RFQ-50): contract line usable on `onDate` (active or terminated, `validFrom` ≤ day ≤ coalesce(`terminatedOn`, `validTo`); newest contract line wins) → newest line with rate > 0 on an approved-or-later PO of this supplier → active catalog price → average > 0 → standard rate. Legacy items with standard rate 0 return 0 (source `standard_rate`). Source `item_average` = item average (BR-INV-30, was `pr_estimate`).
- Contract visibility (BR-RFQ-56): the contract step is used only when the caller holds `po.manage` or `contract.view`; anyone else with `inventory.view` gets the next source as if no contract existed. `qtyLeft` = cap − ordered (null for rate-only lines), a UI hint only.
- The frontend keys last-rate queries by IST date (`onDate`, CR-05); PO forms use the batched endpoint (`useItemsLastRatesQuery`).
- `standard_rate_paise` defaults to 0 in the DB for old rows; the API requires > 0 on create.
- Search uses `likePattern` (escapes `\ % _`); `ilike` on an enum column needs a `::text` cast.
- drizzle wraps Postgres errors in `cause` — read the code/constraint from there for 23505 → 409.
- Reconciliation aggregates the whole ledger per call — don't poll it.
- Ledger ref types written today: `grn`, `grn_bypass`, `grn_correction`, `opening_stock`, `stock_adjustment`, `sco_issue`, `sco_receipt`, `sco_loss`, `pro` (purchase return post, out at cost), `pro_cancel` (counter row of a cancelled posted return, added by migration `20261121081805`; see `purchase-returns.md`), `stock_transfer` and `stock_transfer_reversal` (two rows per line, `averageEffect: "none"`, added by migration `20261121102633`; see `stock-transfer.md`), `delivery_note` (one out row per note line at the average, `blockNegative`, notes = DN number) and `delivery_note_cancel` (counter in row at the out row's cost), added by migration `20261121111833_flat_yellowjacket`; see `dispatch.md`.
- Negative-stock refusal code is `INSUFFICIENT_STOCK` for every caller (was generic `CONFLICT`).
- Super-admin passes every key. Test fixtures must be real employees with seed roles (keys come from the DB).

## Tests
| File | Covers |
|---|---|
| `backend/tests/service/inventoryMasters.test.ts` | BR-INV-01..18, 24, 25 |
| `backend/tests/service/inventoryStock.test.ts` | BR-INV-06, 07, 10, 19..23 |
| `backend/tests/service/stockPosting.test.ts` | grn-stock BR-GRN-21..44 incl. manual movements |
| `backend/tests/routes/poContract.test.ts` | last rate contract-first, visibility (BR-RFQ-50, 56), batched `last-rates` |

## Known gaps / debt
- BR-INV-05 PO half (PR line approved before deactivation) → BL-046 (PO code, auth session). SCO part → subcontracting build.
- `inventory_ref_type` values `job_order_issue`, `scrap_dispatch` still unwritten.
- Stock list search not indexable (BL-050). Reconciliation screen = read-only Stock check (BL-045 / #33 closed).
- SCO rows (`sco_issue` / `sco_receipt` / `sco_loss`) still show no source number in the movements list (no join).

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
| 2026-11-21 | c0f73b0..de68fdf (partial) | Purchase returns write `pro` / `pro_cancel`; `postStock` code `INSUFFICIENT_STOCK`, BigInt value checks. Other changes since eea4fb1 not re-verified |
| 2026-11-21 | e5aaee4..14d31d1 (partial) | Stock transfer: `store` location type (not virtual), ref types `stock_transfer` / `stock_transfer_reversal` (refused on manual movements), movements list number joins `stock_transfers`, Source type filter + `?referenceType=`, Move stock on stock view; stale Known gaps (`pro_cancel` label, GRN-only numbers) removed; stock-check and reorder screens listed. Rest not re-verified |
| 2026-11-21 | df25886..986ea76 (partial) | One last-rate chain `rateChainRepository.findRateChoices` (contract first, `onDate`, visibility by key); batched `GET /asset/items/last-rates`. Rest not re-verified |
| 2026-11-21 | bb8cfe9..d386e04 (partial) | Dispatch: ref types `delivery_note` / `delivery_note_cancel` (refused on manual movements), movements number joins `delivery_notes`, labels + links on the movements screen. Rest not re-verified |
