# Report 19 — Explorer — Inventory code facts for BR-INV-01..25

**Brief**: Map-first, diff-only exploration of inventory module to answer 9 factual questions about asset masters, endpoints, and movements.

---

## Answer 1: Master table columns

**itemMaster** (`backend/src/db/schemas/02_procurement-catalog.ts:16`):
- `sku` — unique, required; case-sensitive (no `.lower()` constraint)
- `name`, `description`, `category` (free text, no enum), `uom` — all text
- `reorderLevel` (double precision, default 0), `currentStock` (double precision, default 0)
- `averageCostPaise` (integer, default 0)
- `isActive` (boolean, default true)
- `createdBy` (FK employees.id), `createdAt` (timestamp, defaultNow)

**serviceMaster** (`backend/src/db/schemas/02_procurement-catalog.ts:31`):
- `code` — unique, required; case-sensitive
- `name`, `description`, `sacCode`, `defaultUom` — all text/required
- `isActive` (boolean, default true)
- `createdBy`, `createdAt` (audit)
- `lastUpdatedBy`, `lastUpdatedAt` (mutable entity audit)

**locations** (`backend/src/db/schemas/02_procurement-catalog.ts:71`):
- `name` (text, required), `type` (`location_type` enum: `main_store`, `vendor_premise`, `finished_goods`, `scrap_yard`)
- `isVirtual` (boolean, default false)
- `linkedVendorId` (FK to `supplierMaster.id`, for vendor_premise)
- `createdAt` only; no update audit

**machines** (`backend/src/db/schemas/02_procurement-catalog.ts:134`):
- `name` (text, required), `type` (free text, no enum)
- `status` (`machine_status` enum: `idle`, `running`, `maintenance`, `breakdown`)
- `lastMaintenanceAt` (nullable timestamp)
- `createdBy`, `createdAt`, `lastUpdatedBy`, `lastUpdatedAt` (full audit)

---

## Answer 2: Zod schemas + what fields can change + delete routes

**Create schemas** (`backend/src/types/asset.types.ts`):
- `assetItemCreateSchema` (lines 43–60): omits `id`, `createdBy`, `createdAt`, `currentStock`, `averageCostPaise` (BR-GRN-40: no manual stock/cost entry on create). Sends: `sku`, `name`, `description`, `category`, `uom`, `reorderLevel`. `.strict()` rejects extra fields.
- `assetItemUpdateSchema` (lines 85–119): omits same columns; allows partial update of any field. `.strict()` + `superRefine` requires ≥1 field.
- `assetServiceCreateSchema` (lines 132–147): omits `id`, `createdBy/At`, `lastUpdatedBy/At`. Sends: `code`, `name`, `description`, `sacCode`, `defaultUom`. No `.strict()`.
- `assetServiceUpdateSchema` (lines 149–180): partial, `superRefine` requires ≥1 field.
- `assetLocationCreateSchema` (lines 247–255): omits `id`, `createdAt`. Sends: `name`, `type`, `isVirtual`, `linkedVendorId`.
- `assetLocationUpdateSchema` (lines 257–279): partial; no `.strict()`.
- `assetMachineCreateSchema` (lines 375–390): omits audit columns. Sends: `name`, `type`, `status`, `lastMaintenanceAt`.
- `assetMachineUpdateSchema` (lines 392–421): partial; `superRefine` requires ≥1 field.

**Manual movement schema** (`assetManualMovementCreateSchema`, lines 303–321):
- `itemId`, `locationId`, `referenceType` (restricted to `stock_adjustment` | `opening_stock` only), `quantityChange` (non-zero, ≤3 decimals), `unitCostPaise` (optional), `reason` (required, 1–1000 chars), `batchNumber` (optional, 1–100 chars)
- Service enforces: cost must be >0 for stock-in; document types get 400 "post from source"

**Delete routes**: None. No DELETE endpoint for any master.

---

## Answer 3: All `/api/asset/*` routes + guards

Mounted under `/api/asset` in `backend/src/routes/asset.ts`:

| Endpoint | Method | Path | Guard | Auth |
|----------|--------|------|-------|------|
| listItems | GET | `/items` | super-admin, back_office | asset.manage |
| createItem | POST | `/items` | super-admin, back_office | asset.manage |
| updateItem | PATCH | `/items/:id` | super-admin, back_office | asset.manage |
| getLastRate | GET | `/items/:itemId/last-rate` | super-admin, back_office | asset.manage |
| listServices | GET | `/services` | super-admin, back_office | asset.manage |
| createService | POST | `/services` | super-admin, back_office | asset.manage |
| updateService | PATCH | `/services/:id` | super-admin, back_office | asset.manage |
| listInventoryMovements | GET | `/inventory/movements` | super-admin, owner, back_office, floor_supervisor | inventory.view |
| createInventoryMovements | POST | `/inventory/movements` | super-admin, owner, back_office | inventory.adjust |
| inventoryReconciliation | GET | `/inventory/reconciliation` | super-admin, owner, back_office, floor_supervisor | inventory.view |
| listLocations | GET | `/locations` | super-admin, back_office | asset.manage |
| createLocation | POST | `/locations` | super-admin, back_office | asset.manage |
| updateLocation | PATCH | `/locations/:id` | super-admin, back_office | asset.manage |
| listMachines | GET | `/machines` | super-admin, back_office | asset.manage |
| createMachine | POST | `/machines` | super-admin, back_office | asset.manage |
| updateMachine | PATCH | `/machines/:id` | super-admin, back_office | asset.manage |

---

## Answer 4: isActive checks in PR/PO/supplier code paths

**No guards exist.** Only columns are read, never filtered:
- `supplierRepository.ts:72` — reads `supplierMaster.isActive` (projection only)
- `supplierRepository.ts:95, 111` — reads `supplierItems.isActive`, `supplierServices.isActive` (projection only)
- `poRepository.ts:226` — reads `supplierMaster.isActive` (projection only)

isActive checks only exist for **employees** in auth + approval repos — items/services/machines/locations are never filtered by isActive anywhere.

---

## Answer 5: getLastRate logic + callers

**Logic** (`assetRepository.ts:216–266`):
1. Latest PO line's `unitPricePaise` for (supplierId, itemId) by `purchaseOrders.createdAt` DESC
2. Fallback: `supplierItems.supplierUnitPricePaise` for same pair
3. Fallback: `itemMaster.averageCostPaise`
4. Return undefined/404 only if all three missing

**Callers**:
- `assetController.getLastRate` → `assetService.getLastRate` — HTTP GET `/api/asset/items/:itemId/last-rate?supplierId=N`
- PO price suggestion: No current caller

---

## Answer 6: Stock view endpoints + response

**List endpoint**: `GET /api/asset/inventory/movements` (paginated, filterable)

**Filters**: `itemId`, `locationId`, `referenceType`, `transactionType`, `fromDate`, `toDate` (validated date range)

**Response row columns**:
- `id`, `itemId`, `itemSku`, `itemName`, `itemUom` (from itemMaster)
- `locationId`, `locationName`, `locationType` (from locations)
- `batchNumber`, `transactionType`, `referenceType`, `referenceId` (no source document link column)
- `quantityChange`, `balanceAfter`, `unitCostPaise`, `totalValueChangePaise`
- `createdBy`, `createdAt`

**No per-item per-location balance endpoint** exists; `balanceAfter` is only in list rows.

---

## Answer 7: Manual movement shape after m1-stock grn-stock work

**Request body**:
- `quantityChange`: **signed number** (positive = in, negative = out); must be non-zero, ≤3 decimals
- `referenceType`: restricted to `stock_adjustment` | `opening_stock` (enforced in service)
- `unitCostPaise`: required for stock-in (qty > 0, cost must be >0); optional/ignored for stock-out
- `reason`: required, 1–1000 chars
- `batchNumber`: optional, 1–100 chars

**No negative-balance checks** in current code.

---

## Answer 8: Frontend inventory screens + forms

**Components**: InventoryItemsView/Manager, InventoryServicesView/Manager, InventoryMachinesView/Manager, InventoryLocationsView/Manager, InventoryMovementsView/Manager

**Form fields sent**:

Items: `sku`, `name`, `description`, `category`, `uom`, `reorderLevel`, `isActive`

Services: `code`, `name`, `description`, `sacCode`, `defaultUom`, `isActive`

Machines: `name`, `type`, `status`, `lastMaintenanceAt`

Locations: `name`, `type`, `isVirtual`, `linkedVendorId`

Movements: `itemId`, `locationId`, `batchNumber` (nullish), `referenceType`, `quantityChange`, `unitCostPaise` (stock-in only), `reason`

---

## Answer 9: Test fixtures (stockPosting.test.ts)

**Reusable helpers** (`backend/src/service/stockPosting.test.ts`):
- `uniq(tag)` — unique test IDs with timestamp + sequence
- `makeItem(tag, uom?)` — inserts itemMaster, returns itemId; pushed to itemIds[]
- `makeLocation(type)` — inserts locations, returns id; pushed to extraLocationIds[]
- `makePo(lines)` — inserts purchaseOrders + lines, returns { poId, poItemIds }
- `makeGrn(poId, lines)` — calls grnService.create, returns { grnId, lineIds }
- `setupLine(opts)` — wrapper: creates item → PO → GRN line, returns all IDs

**Pattern**: Real-DB integration test; uses createApp() for HTTP routes; cleanup via afterAll() on module arrays.

---

## Surprises & gaps

1. **isActive never enforced**: Items/services/machines/locations marked inactive are never filtered in PR/PO/supplier paths.
2. **currentStock orphaned**: Never recomputed from ledger; getLastRate fallback reads stale averageCostPaise.
3. **Manual movements open**: POST accepts full referenceType enum, but service rejects non-document types.
4. **No delete routes**: No DELETE endpoint; archiving via isActive=false only.
5. **Reconciliation unimplemented**: Endpoint exists but assetRepository.inventoryReconciliation() method not found.
6. **referenceLineId in contract**: Response includes it but no column in inventoryLedger schema yet.

