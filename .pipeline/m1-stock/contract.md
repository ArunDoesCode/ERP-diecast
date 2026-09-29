# Contract — m1-stock (grn + grn-stock)

Source of truth for shapes: `backend/.contracts/api-manifest.json` (`bun run contract:query "<METHOD> <path>"`).
Envelope: success `{ success: true, data, meta? }`; error `{ success: false, message, code? }`.
Base paths `/api/grn`, `/api/asset`. All routes need auth (401 otherwise). Wrong role = 403, nothing changes.
Qty = number, up to 3 decimals (else 400). Whole numbers for items in pcs/set (service, 400). Money = integer paise.
"Handler" column: **new/changed shape, handler not yet updated** = tests written from this will fail until the slice lands.

## GRN — roles (perm key = seed roles + super-admin)
| Key | Roles |
|---|---|
| `grn.view` | super-admin, owner, back_office, floor_supervisor, qa_inspector, die_designer |
| `grn.edit_draft` | super-admin, owner, back_office, floor_supervisor |
| `grn.qa_decide` | super-admin, owner, back_office, qa_inspector |
| `grn.qa_bypass` | super-admin, owner, back_office (floor_supervisor removed) |
| `grn.correct` | super-admin, owner, back_office |
| `grn.over_receipt_override` | owner, back_office (+ super-admin). Checked in the service, not the route guard |

## GRN endpoints
### GET `/api/grn/getgrns` — `grn.view` — unchanged
Query: `page`(1) `pageSize`(10, max 100) `sortBy`(id|grnNumber|status|receivedDate) `sortDir`(asc) `poId` `status` `qaStatus` `q`.
200 paginated list of GRN header rows (`meta {page,pageSize,total,totalPages}`).

### GET `/api/grn/getgrndetails/:id` — `grn.view`
200 `data = { grn, items[] }`. `grn`: header row (id, grnNumber, poId, supplierId, status, receivedDate, createdBy, challanNo, challanDate, vehicleNo, driverName, driverPhone, remarks).
Each `items[]` line: id, grnId, poItemId, receivedQty (= arrived), acceptedQty, rejectedQty, qaStatus (`pending|passed|failed|waived`), isQaBypassed, qaBypassReason, qaBypassedBy, qaBypassedAt, challanPhotoUrl, **batchNumber**, **overReceiptExcessQty**, **overReceiptReason**, **overReceiptBy**, itemId, itemSku, itemName, orderedQty, **correctedQty**, **netAcceptedQty** (= acceptedQty − correctedQty; acceptedQty never changes).
Errors: 400 bad id, 404.

### POST `/api/grn/creategrn` — `grn.edit_draft` — 201 `data = { grn, items[] }` (status `draft`)
Body:
```
{ poId: int,
  challanNo: string (1..100, REQUIRED),
  challanDate?: date, vehicleNo?, driverName?, driverPhone?, remarks?,
  lines: [{ poItemId: int, arrivedQty: >0 (3 dp), batchNumber?: string(1..100) }] (min 1) }
```
No `receivedDate` (ignored if sent; server time, BR-GRN-08).
Errors: 400 missing/blank challan, PO not `dispatched`/`partial_received`, line not of this PO, duplicate line, qty <= 0 / >3 dp / fractional pcs; 403; 404 PO; 409 same supplier + challanNo already used.

### PATCH `/api/grn/updategrn` — `grn.edit_draft` — 200 `data = { grn, items[] }`
Body: `{ grnId: int, challanNo?: string(1..100) (cannot be cleared), challanDate?, vehicleNo?, driverName?, driverPhone?, remarks?: nullable, lines?: [{ id: int (grn line id), arrivedQty: >0, batchNumber?: nullable }] }` — at least one field.
Errors: 400 GRN not draft ("use the correction"), bad qty; 403; 404; 409 challan clash.

### DELETE `/api/grn/deletegrn/:id` — `grn.edit_draft` — 200 `data = { id }`
Errors: 400 not draft; 403; 404. Number is never reused.

### POST `/api/grn/:id/lines/:lineId/qa` — `grn.qa_decide` — 200 `data = GRN line row` (fields as above, without joined item fields)
Body (no `decision` field any more; line is `passed` if acceptedQty > 0, else `failed`):
```
{ acceptedQty: >=0, rejectedQty: >=0,           // sum must equal the line's arrived qty; sum > 0
  remarks?: string, certificateUrl?: url, batchNumber?: string,
  overrideReason?: string }                      // needed when past 105% of ordered and actor has grn.over_receipt_override
```
Errors: 400 sum != arrived, qty rules, over-receipt without key or without overrideReason; 403; 404 line not in this GRN; 409 line already decided, or PO not `dispatched`/`partial_received`.
Side effects: one `qa_tests` row; if acceptedQty > 0 one ledger row (`in`, ref `grn`, refLineId = line id, cost = PO rate); PO line received qty up; header + PO status recomputed.

### POST `/api/grn/:id/lines/:lineId/bypass` — `grn.qa_bypass` — 200 `data = GRN line row`
Body: `{ bypassReason: string (1..1000, required), acceptedQty?: >0 (default arrived; less → rest recorded as rejected), batchNumber?, overrideReason? }`
Line becomes `waived`, `isQaBypassed=true`, `qaBypassedBy/At` set; ledger ref `grn_bypass`.
Errors: 400 empty reason, acceptedQty > arrived, over-receipt rules; 403 (incl. floor_supervisor); 404; 409 already decided / PO status.

### POST `/api/grn/:id/lines/:lineId/correction` — `grn.correct` — 201 `data = ledger row` (assetInventoryMovement shape, now with `referenceLineId`)
Body: `{ qty: >0 (3 dp), reason: string (1..1000) }`
Errors: 400 line not `passed`/`waived`, sum of corrections > acceptedQty, empty reason; 403; 404; 409 "Insufficient stock" (balance would go < 0), PO invoiced/closed.
Effect: ledger `adjustment`, −qty, cost = posted cost, ref `grn_correction`; PO line received qty down, PO status recomputed.

## Inventory endpoints (`/api/asset`)
Roles: masters (`/machines`, `/items`, `/services`, `/locations`) = `asset.manage`: super-admin, back_office (unchanged).

### POST `/api/asset/inventory/movements` — `inventory.adjust`: super-admin, owner, back_office — 201 `data = ledger row`
Body **(SUPERSEDED by section "Inventory (part 2)" below — ignore this shape)**:
```
{ itemId: int, locationId: int,
  referenceType: "stock_adjustment" | "opening_stock"   // any other ref type (grn, grn_bypass, grn_correction, pro, sco_issue, sco_receipt, sco_loss, job_order_issue, scrap_dispatch) -> 400 "post from its source document"
  quantityChange: non-zero (3 dp), unitCostPaise?: int >=0, reason: string (1..1000, required), batchNumber?: string|null }
```
No `transactionType` / `referenceId` in the body (server sets `adjustment`). Stock-in needs unitCostPaise > 0; stock-out is valued at the current average whatever is sent.
Errors: 400 (validation, doc ref type, cost <= 0 on stock-in), 403, 404 item/location, 409 "Insufficient stock".

### GET `/api/asset/inventory/movements` — `inventory.view`: super-admin, owner, back_office, floor_supervisor — unchanged query/response (roles widened)
Ledger row now also has `referenceLineId: int | null`. `referenceType` filter enum gained `grn_correction`, `opening_stock`, `sco_loss`.

### GET `/api/asset/inventory/reconciliation` — `inventory.view` (same roles) — NEW, handler returns 501 until S5
Query: `page`(1) `pageSize`(10) `sortBy`(itemId) `sortDir`. 200 paginated rows; **zero rows = OK**:
`{ kind: "item_stock" | "item_location_balance", itemId, itemSku, locationId: int|null (null for item_stock), storedQty, ledgerQty }`
(`item_stock`: item.currentStock vs sum of ledger; `item_location_balance`: last balanceAfter vs sum for that item+location).

### POST `/api/asset/items`, PATCH `/api/asset/items/:id` — `asset.manage` — **changed**
Body no longer accepts `currentStock` or `averageCostPaise`; sending either (or any unknown key) → 400 (strict, BR-GRN-40). Response rows still show both, read-only.

## Data model additions (schema only)
- `inventory_ledger.reference_line_id` int null; ref enum + `grn_correction`, `opening_stock`, `sco_loss`.
- `grn_items`: `qa_bypassed_at`, `batch_number`, `over_receipt_excess_qty`, `over_receipt_reason`, `over_receipt_by`.
- new table `grn_corrections` (id, grn_item_id, qty, reason, created_by, created_at).
- unique index `uq_grns_supplier_challan (supplier_id, challan_no)`.


# Inventory (part 2, BR-INV-01..25)
Errors use the usual envelope `{ success:false, error:{ code, message } }`; `409 ITEM_IN_USE` / `409 LOCATION_IN_USE` carry that `code`. Handlers for new behaviour land in S6-S10; until then only the shapes exist. `POST /inventory/movements` and `GET /inventory/stock` return **501** for now.

## Roles (perm key = seed roles + super-admin)
| Routes | Key | Roles |
|---|---|---|
| POST/PATCH `/items`, `/services`, `/locations`, `/machines`; GET `/services`, `/machines`, `/items/:itemId/last-rate` | `asset.manage` | super-admin, back_office |
| GET `/locations` (read only, questions.md row 3) | `inventory.view` | super-admin, owner, back_office, floor_supervisor |
| GET `/items` (**widened**), GET `/inventory/stock`, GET `/inventory/movements`, GET `/inventory/reconciliation` | `inventory.view` | super-admin, owner, back_office, floor_supervisor |
| POST `/inventory/movements` | `inventory.adjust` | super-admin, owner, back_office |
No route edits or deletes a ledger row; no DELETE route exists for items/services/locations/machines (deactivate via PATCH `isActive:false`). PATCH/DELETE on `/inventory/movements/:id` -> 404.

## Lists (all paginated `{ success, data[], meta{page,pageSize,total,totalPages} }`, `page`=1, `pageSize`=10 max 100, `sortDir` asc|desc)
Every list of items/services/locations/machines takes optional `isActive=true|false` (pickers send `true`).
| Path | Extra query | sortBy |
|---|---|---|
| GET `/api/asset/items` | `q` (sku/name/category), `category` (fixed list) | sku, name, category, currentStock, createdAt |
| GET `/api/asset/services` | `q` | code, name, createdAt |
| GET `/api/asset/locations` | `q` | name, type, createdAt |
| GET `/api/asset/machines` | `q`, `status` (idle\|running\|maintenance\|breakdown) | name, code, type, status, createdAt |

## Fixed lists
- Item `category`: `Raw Material`, `Consumable`, `Spare Part`, `Tooling`, `Packing`. Item `uom`: `kg`, `pcs`, `ltr`, `m`, `set`. Anything else -> 400.
- Location `type`: `main_store`, `vendor_premise`, `finished_goods`, `scrap_yard`. Machine `status`: `idle`, `running`, `maintenance`, `breakdown`.

## Items
### POST `/api/asset/items` — 201 `data = item row`
Body (strict — unknown keys incl. `currentStock`, `averageCostPaise`, `isActive` -> 400):
`{ sku: string (trimmed, >=1), name: string, description?: string|null, category, uom, reorderLevel?: number >=0 (3 dp), standardRatePaise: int 1..2147483647 (REQUIRED) }`
Errors: 400 validation (incl. missing/0 `standardRatePaise`, bad category/uom); 403; 409 "Item SKU already exists" (ignoring case and outer spaces, BR-INV-01).
### PATCH `/api/asset/items/:id` — 200 `data = item row`
Body (strict, >=1 field): `{ sku?, name?, description?: string|null, category?, uom?, reorderLevel?, standardRatePaise?, isActive?: boolean }` (`isActive` false = deactivate, true = reactivate; an item with stock can be deactivated, BR-INV-06).
Errors: 400 (validation; `currentStock`/`averageCostPaise` sent); 403; 404; 409 SKU clash; **409 `ITEM_IN_USE`** when `sku` or `uom` changes and the item has any ledger row or PR/PO/supplier-item line.
### Item row (response)
`id, sku, name, description|null, category, uom, reorderLevel, currentStock, averageCostPaise, standardRatePaise, isActive, createdBy|null, createdAt, lastUpdatedBy|null, lastUpdatedAt`. `currentStock`, `averageCostPaise` read-only. Existing rows have `standardRatePaise` 0 until edited (API rejects 0 on write only).

## Services
### POST `/api/asset/services` — 201 `data = service row`
Body: `{ code: string, name: string, defaultUom: string, description?: string|null, sacCode?: string|null (6 digits starting 99, else 400) }`. Errors: 400; 403; 409 code exists (ignoring case).
### PATCH `/api/asset/services/:id` — 200. Body: same fields all optional + `isActive?: boolean` (>=1 field). Errors: 400, 403, 404, 409.
Service row: `id, code, name, description|null, sacCode|null, defaultUom, isActive, createdBy|null, createdAt, lastUpdatedBy|null, lastUpdatedAt`. Services never appear in stock/movement paths: a service id sent as `itemId` -> 404/400.

## Machines
### POST `/api/asset/machines` — 201 `data = machine row`
Body: `{ name: string, code: string, type?: string|null, status?: enum (default idle), lastMaintenanceAt?: ISO date|null (not in the future, else 400) }`. Errors: 400; 403; 409 name or code exists (ignoring case).
### PATCH `/api/asset/machines/:id` — 200. Body: `{ name?, code?, type?, status?, isActive?: boolean, lastMaintenanceAt? }` (>=1 field). Any status change is allowed; saves `lastUpdatedBy`/`lastUpdatedAt`. Errors: 400, 403, 404, 409.
Machine row: `id, name, code: string|null (null only on rows that predate the column), type|null, status, isActive, lastMaintenanceAt|null, createdBy|null, createdAt, lastUpdatedBy|null, lastUpdatedAt`.

## Locations
### POST `/api/asset/locations` — 201 `data = location row`
Body: `{ name: string, type, isVirtual (ignored; derived from type): boolean, linkedVendorId?: int|null }`. Server rules: `vendor_premise` requires an existing **active** supplier, is stored `isVirtual = true`, one location per supplier; other types with `linkedVendorId` -> 400; second `main_store` -> 409.
Errors: 400; 403; 409 name exists (ignoring case) / second main_store / supplier already has a location.
### PATCH `/api/asset/locations/:id` — 200. Body: `{ name?, type?, isVirtual (ignored; derived from type), linkedVendorId?: int|null, isActive?: boolean }` (>=1 field).
Errors: 400 (also posting into an inactive location is a 400 on the movement, not here); 403; 404; **409 `LOCATION_IN_USE`** when `type` or `linkedVendorId` changes and the location has ledger rows; 409 changing the only `main_store` to another type; 409 name clash.
Location row: `id, name, type, isVirtual, linkedVendorId|null, isActive, createdBy|null, createdAt, lastUpdatedBy|null, lastUpdatedAt`.

## GET `/api/asset/inventory/stock` — `inventory.view` — NEW (501 until S9)
Query: `page`, `pageSize`, `q` (sku/name), `category`, `locationId` (only items with a ledger row there; `locations` still lists all), `belowReorder=true|false`, `sortBy` (sku|name|category|currentStock|valuePaise), `sortDir`.
200 paginated rows:
`{ itemId, sku, name, category, uom, currentStock, averageCostPaise, valuePaise: int (= round(currentStock x averageCostPaise)), reorderLevel, belowReorder: boolean (active item, reorderLevel > 0, currentStock <= reorderLevel), isActive, locations: [{ locationId, locationName, locationType, balance }] }`
Listed: all active items + inactive items whose `currentStock != 0` (shown with `isActive:false`). `locations` = locations with at least one ledger row for the item.

## GET `/api/asset/inventory/movements` — changed response row
Same query as before (`itemId`, `locationId`, `referenceType` = source, `transactionType`, `fromDate`, `toDate`, `sortBy`, `sortDir`). Each row = ledger row + `itemSku`, `itemName`, `locationName`, `sourceDocument: { type: <referenceType>, id: int, number: string|null }` (`number` = document number e.g. GRN no.; `null` for manual rows where `id` = 0 — reason is in `notes`).

## POST `/api/asset/inventory/movements` — body changed (discriminated on `referenceType`) — 201 `data = ledger row`
Stock-take: `{ itemId, locationId, referenceType: "stock_adjustment", countedQty: number >=0 (3 dp), reason: string 1..1000, unitCostPaise?: int 1..2147483647, batchNumber?: string|null }`
 - Server posts `countedQty - current balance at that location` as one `adjustment` row. Difference 0 -> 400 "no difference". Difference > 0 needs `unitCostPaise` (else 400); difference < 0 is valued at average (cost ignored).
Opening stock: `{ itemId, locationId, referenceType: "opening_stock", qty: number >0 (3 dp), unitCostPaise: int >=1, reason, batchNumber? }`
 - Only when the item+location has no ledger rows, else **409** "use stock-take".
Any document `referenceType` (`grn`, `grn_bypass`, `grn_correction`, `pro`, `sco_issue`, `sco_receipt`, `sco_loss`, `job_order_issue`, `scrap_dispatch`) -> 400 "post from its source document". No `transactionType`, `referenceId`, `quantityChange` in the body.
Also: `pcs`/`set` items take whole numbers only (400); item or location inactive -> 400 (inactive item may still be adjusted to zero, BR-INV-06 — only stock-out to zero is allowed for an inactive item); service id -> 400; unknown item/location -> 404; balance would go < 0 -> 409 "Insufficient stock". Roles: `inventory.adjust`.

## GET `/api/asset/items/:itemId/last-rate` — response changed
Query `supplierId` (unchanged). 200 `data = { ratePaise: int >= 1, source: "po_history" | "supplier_catalog" | "pr_estimate" | "standard_rate" }` — `po_history` = newest line of an approved-or-later PO, `supplier_catalog`, `pr_estimate` = item average cost (only when > 0), `standard_rate` = item standard rate. Always answers (no 404 for "no rate"); 404 only for unknown item.

## Data model additions (part 2, schema only)
- `item_master`: `standard_rate_paise` int not null default 0, `last_updated_by`, `last_updated_at`; unique index `uq_item_master_sku_norm` on `lower(btrim(sku))`.
- `service_master`: unique index `uq_service_master_code_norm` on `lower(btrim(code))`.
- `locations`: `is_active` bool default true, `created_by`, `last_updated_by`, `last_updated_at`; unique `uq_locations_name_norm`.
- `machines`: `code` text NULL, `is_active` bool default true; unique `uq_machines_name_norm`, `uq_machines_code_norm` (Postgres unique ignores NULL codes).
- Not indexed (service enforces, note race): one `main_store`; one `vendor_premise` per supplier.
