# Report 34 — explorer — supplier code facts for BR-SUP-01..25

## Answers

### 1. Column types and uniqueness
- **supplierMaster** (`backend/src/db/schemas/02_procurement-suppliers.ts:23`):
  - `gstNumber` (text, unique at DB level); `panNumber` (text, no uniqueness)
  - `name`, `type` (enum: raw_material, consumables, service_provider, trader, both)
  - `email`, `phone` (text, no constraints on uniqueness/format)
  - `defaultPaymentTermsDays` (integer, default 0)
  - `isActive` (boolean, default true)
  - No history table.

- **supplierItems** (`backend/src/db/schemas/02_procurement-suppliers.ts:70`):
  - `supplierUnitPricePaise` (integer), `taxPercentage` (double precision, default 0), `leadTimeDays` (integer, default 0)
  - `qty` (double precision, default 0), `uom` (text)
  - `isActive` (boolean, default true)
  - Unique index on (supplierId, itemId); no uniqueness on `gstNumber` or `panNumber` pairs.
  - Index added on `itemId` for BR-INV-04/05: `idx_supplier_items_item_id` (`02_procurement-suppliers.ts:111`).

- **supplierServices** (`backend/src/db/schemas/02_procurement-suppliers.ts:41`):
  - `serviceUnitPricePaise` (integer), `taxPercentage` (double precision, default 0), `leadTimeDays` (integer, default 0)
  - `isActive` (boolean, default true)
  - Unique index on (supplierId, serviceId).

### 2. All `/api/supplier*` routes, schemas, guards
All routes mounted at `/api/supplier` with guard `requireAuth + requireRole("super-admin", "back_office")` (`backend/src/routes/supplier.ts:38`).

| Route | Method | Purpose | Request | Response |
|-------|--------|---------|---------|----------|
| `/listSuppliers` | GET | List suppliers, paginated, searchable by name/contact/email/phone/SKU | `supplierListQuerySchema` (page, pageSize, sortBy: [name/type/contactPerson/isActive/createdAt], sortDir, q?) | `paginatedResponse(supplierSchema)` |
| `/:supplierId/detail` | GET | Supplier + item/service counts | none | `successResponse(supplierDetailSchema)` |
| `/createSupplier` | POST | Create supplier ± seed items in one tx | `supplierCreateSchema` (name, type?, gstNumber?, panNumber?, contact*, email?, phone?, address?, defaultPaymentTermsDays?, isActive?, supplierItems[]) | `successResponse(supplierSchema)` |
| `/updateSupplier/:id` | PATCH | Update master or single item (discriminated by `mode: "master" \| "item"`) | `supplierUpdateSchema` | `successResponse(supplierSchema)` |
| `/:supplierId/listItems` | GET | Supplier's item catalog, paginated, searchable | `supplierItemListQuerySchema` (page, pageSize, q?) | `paginatedResponse(supplierItemSchema)` |
| `/:supplierId/createItem` | POST | Add one item to supplier's catalog | `supplierItemCreateSchema` (itemId, supplierSku?, supplierUnitPricePaise, taxPercentage?, leadTimeDays?, qty?, uom, isActive?) | `successResponse(supplierItemSchema)` |
| `/:supplierId/editItem` | PATCH | Batch-edit items (single object or array) | `supplierItemBatchEditSchema` (union: single edit or array of edits, each selectable by supplierItemsId or itemId, not both) | `supplierItemEditResponseSchema` (spreads result: data[], summary) |
| `/:supplierId/listServices` | GET | Supplier's service catalog, paginated, searchable | `supplierServiceListQuerySchema` (page, pageSize, q?) | `paginatedResponse(supplierServiceSchema)` |
| `/:supplierId/createService` | POST | Add one service to supplier's catalog | `supplierServiceCreateSchema` (serviceId, serviceUnitPricePaise, taxPercentage?, leadTimeDays?, isActive?) | `successResponse(supplierServiceSchema)` |
| `/:supplierId/editService` | PATCH | Batch-edit services (single or array) | `supplierServiceBatchEditSchema` | `supplierServiceEditResponseSchema` (spreads result: data[], summary) |

All routes in `backend/src/routes/end-points.ts:61`.

### 3. Create-with-items transaction & batch-edit error handling
- **Create-with-items** (`supplierRepository.create`, `backend/src/repository/supplierService.ts:349`):
  - Single transaction: inserts `supplierMaster`, then bulk-inserts `supplierItems` if provided.
  - If `supplierItems` provided, validates no duplicates and all itemIds exist before tx.
  - **BL-031**: Batch edit error handling is per-entry; no atomicity across array (each entry's DB write independent; client reads per-entry success/error in result).
  - **BL-035**: Same non-transactional per-entry pattern for `editSupplierItems`/`editSupplierServices`.

- **Batch edit** (`supplierService.editSupplierItems`, `backend/src/service/supplierService.ts:401`):
  - Normalizes input to array; validates itemIds exist (if provided); maps each edit through try/catch.
  - Returns `{data: [{index, selector, success, data? | error}], summary: {total, success, failed}}`.
  - Partial failures do not roll back; caller must inspect per-entry fields.

### 4. List/search
- **Fields searched** (`supplierRepository.list`, `backend/src/repository/supplierRepository.ts:119`):
  - supplierMaster: name, contactPerson, email, phone (ilike pattern).
  - supplierItems: itemMaster.sku (via join, included in search).
- **Filters**: None explicitly named; supplierRepository sorts by name|type|contactPerson|isActive|createdAt; lists all suppliers (no active-only filter on list endpoint, though poService checks isActive when picking).
- **Pagination**: page, pageSize (pageSize no preset limit in code; UI uses [10,20,50]).
- **Sort**: sortBy + sortDir (asc/desc).

### 5. Where suppliers are picked (PO create, SCO)
- **PO** (`poService.create`, `backend/src/service/poService.ts:line ~119`):
  - Calls `poRepository.findSupplierById(supplierId)` → returns `{id, isActive}` only.
  - Throws "Supplier not found or inactive" if `!supplier?.isActive`.
  - **No payment-terms copy**: uses input `paymentTermsDays ?? 0`, not supplier's `defaultPaymentTermsDays`.
- **SCO**: No code yet (no backend sco* files).

### 6. This branch's supplier changes
- **Schema** (`backend/src/db/schemas/02_procurement-suppliers.ts:111`): Added index on `supplierItems.itemId` for BR-INV-04.
- **Repository** (`backend/src/repository/supplierRepository.ts:174`): Added optional `activeOnly` param to `findExistingItemIds`; when true, filters to `itemMaster.isActive = true`.
- **Service** (`backend/src/service/supplierService.ts:203, 280`): Two calls to `findExistingItemIds(..., true)` added in `createSupplierItem` (BR-INV-05) and `editSupplierItems` batch to prevent linking to inactive items.

### 7. Frontend supplier screens & forms
- **Pages**: `frontend/src/app/(protected)/suppliers`, `frontend/src/app/(protected)/suppliers/[supplierId]`.
- **Views** (in `frontend/src/components/views/suppliers/`): `SuppliersView`, `SupplierDetailsView`.
- **Modals & components** (in `frontend/src/components/pages/suppliers/`):
  - `CreateSupplierModal` (`frontend/src/components/pages/suppliers/CreateSupplierModal.tsx`): Opens `SupplierMasterModal` with create defaults; sends `toSupplierCreatePayload()`.
  - `SupplierMasterModal` (`frontend/src/components/pages/suppliers/SupplierMasterModal.tsx:42`): Shared form for create/edit modes; fields: name, type (required in create), gstNumber (required in create), panNumber (required in create), contactPerson (required in create), email (required in create, validated), phone (required in create), address (required in create), defaultPaymentTermsDays (optional, integer ≥ 0), isActive (switch, default true).
  - `SupplierOfferingsDialog` (`frontend/src/components/pages/suppliers/SupplierOfferingsDialog.tsx:104`): Tabs for items/services; single item/service form or batch-edit via modal. Forms use `SupplierItemInput` (itemId, supplierSku?, supplierUnitPricePaise, taxPercentage?, leadTimeDays?, qty?, uom, isActive?, selectable by supplierItemsId or itemId).
  - `SupplierItemsOfferingsPane`, `SupplierServicesOfferingsPane`: Read-only panes showing supplier's items/services.
  - `SuppliersCards`: Grid of supplier cards; click → detail page.
  - `SuppliersPagination`: Page/pageSize selector; visible pages (window of 3); "Rows per page" dropdown [10,20,50].

### 8. Test fixtures
- **No supplier test file exists** (`backend/src/**/*.test.ts` — no supplier coverage).
- Existing fixtures in other modules (PR, PO, GRN) do not export supplier helpers.
- No reusable supplier test setup.

## Notable gaps & issues
- **Uniqueness case-sensitivity**: gstNumber/panNumber not checked for case-insensitive duplicates (e.g., "GST123" vs "gst123" allowed).
- **Payment terms not copied**: PO create ignores supplier's `defaultPaymentTermsDays`.
- **Batch edit non-atomic**: BL-031, BL-035 documented; partial failures do not roll back.
- **No SCO integration yet**: Vendors/SCO reference `supplierMaster.id` (FK in schema) but no service/route code exists.
- **supplierBankDetails** schema-only; no API/UI anywhere.
- **No price history**: Updates overwrite; no audit trail for price changes.

