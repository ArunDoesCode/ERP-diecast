---
module: suppliers
spec: none yet
last_verified_commit: 0a406f4
last_verified_on: 2026-09-27
depends_on: [inventory]
---

# Suppliers — as-built map

> What the code **is** (the spec says what it **should be**). Agents read this before touching the module
> and only explore code changed since `last_verified_commit`
> (`git diff 0a406f4..HEAD --stat -- backend/src/db/schemas/02_procurement-suppliers.ts backend/src/service/supplierService.ts backend/src/repository/supplierRepository.ts backend/src/routes/supplier.ts backend/src/types/supplier.types.ts frontend/src/lib/api/suppliers frontend/src/components/pages/suppliers frontend/src/components/views/suppliers`).
> Use symbol names, not line numbers — lines rot.

## Summary
Full CRUD/list slice for supplier master data plus each supplier's per-item and per-service catalog
(negotiated price, tax, lead time, supply qty). Supports creating a supplier with an initial catalog
seed in one call, and batch-editing catalog rows (single object or array body) by either the
supplier-catalog row id or the underlying item/service id. `supplierBankDetails` is defined in the
schema (payment routing info) but has no repository/service/controller/route or frontend anywhere —
schema-only, see Known gaps.

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| schema | `backend/src/db/schemas/02_procurement-suppliers.ts` | `supplierMaster`, `supplierTypeEnum`, `supplierItems`, `supplierServices` |
| schema (schema-only, no app layer) | `backend/src/db/schemas/02_procurement-purchasing.ts` | `supplierBankDetails` (defined alongside `supplierInvoices`/`supplierPayments`, see `grn.md` Known gaps) |
| types | `backend/src/types/supplier.types.ts` | `supplierSchema`, `supplierItemSchema`, `supplierServiceSchema`, `supplierDetailSchema`, `supplierCreateSchema`, `supplierUpdateSchema` (discriminated union `mode: "master" \| "item"`), `supplierItemBatchEditSchema`, `supplierServiceBatchEditSchema` |
| repository | `backend/src/repository/supplierRepository.ts` | `list`, `findExistingItemIds`, `findExistingServiceIds`, `listItems`, `listSupplierItems`, `listSupplierServices`, `findSupplierDetailById`, `findSupplierById`, `create`, `updateMaster`, `updateItemBySupplierItemsId`, `updateItemByItemId`, `createSupplierItems`, `editSupplierItemBySupplierItemsId`, `editSupplierItemByItemId`, `createSupplierServices`, `editSupplierServiceBySupplierServiceId`, `editSupplierServiceByServiceId` |
| service | `backend/src/service/supplierService.ts` | `list`, `listItems`, `listServices`, `getSupplierDetails`, `createSupplierItem`, `createSupplierService`, `create`, `update`, `editSupplierItems`, `editSupplierServices` |
| controller | `backend/src/controller/supplierController.ts` | `list`, `listItems`, `listServices`, `getDetails`, `create`, `update`, `createItem`, `editItem`, `createService`, `editService` |
| routes | `backend/src/routes/supplier.ts` + `END_POINTS.supplier` (`backend/src/routes/end-points.ts`) | mounted under `/api/supplier` |
| frontend api | `frontend/src/lib/api/suppliers/fetchers.ts`, `frontend/src/lib/api/suppliers/queries.ts` | `useSuppliersQuery`, `useSupplierLookupQuery`, `useCreateSupplierMutation`, `useSupplierDetailQuery`, `useUpdateSupplierMasterMutation`, `useSupplierItemsQuery`, `useSupplierServicesQuery`, `useAssetItemsLookupQuery`, `useAssetServicesLookupQuery`, `useCreateSupplierItemMutation`, `useEditSupplierItemMutation`, `useCreateSupplierServiceMutation`, `useEditSupplierServiceMutation`, `toSupplierCreatePayload`, `toSupplierMasterUpdatePayload` |
| frontend ui | `frontend/src/app/(protected)/suppliers`, `frontend/src/app/(protected)/suppliers/[supplierId]`, `frontend/src/components/views/suppliers/{SuppliersView,SupplierDetailsView}.tsx`, `frontend/src/components/pages/suppliers/{CreateSupplierModal,SupplierMasterModal,SuppliersCards,SuppliersPagination,SupplierItemsOfferingsPane,SupplierServicesOfferingsPane,SupplierOfferingsDialog,SupplierOfferingsSection,use-supplier-offerings-state}.tsx`, `frontend/src/types/suppliers.ts` | |

## Data model
- `supplierMaster` — `name`, `type` (`supplier_type` enum: `raw_material`, `consumables`, `service_provider`, `trader`, `both`), `gstNumber` (unique), `panNumber`, `contactPerson`, `email`, `phone`, `address`, `defaultPaymentTermsDays`, `isActive`, `createdBy`/`createdAt`.
- `supplierItems` — supplier's catalog entry for a given `itemMaster` row: `supplierId`, `itemId`, `supplierSku` (their part number, distinct from internal SKU), `supplierUnitPricePaise`, `taxPercentage`, `leadTimeDays`, `qty` (how much they can supply at this price), `uom`, `isActive`; unique index on `(supplierId, itemId)` — one catalog row per supplier+item pair.
- `supplierServices` — supplier's catalog entry for a given `serviceMaster` row: `supplierId`, `serviceId`, `serviceUnitPricePaise`, `taxPercentage`, `leadTimeDays`, `isActive`; unique index on `(supplierId, serviceId)`.
- `supplierBankDetails` (schema-only, `02_procurement-purchasing.ts`) — `supplierId`, `accountName`, `accountNumber`, `ifscCode`, `bankName`, `branchName`, `isDefault`. No app-layer code reads or writes this table anywhere in the repo.
- FK relationships: `purchaseOrders.supplierId`, `grns.supplierId`, `subcontractingOrders.vendorId`, `subcontractingGrns.vendorId`, `locations.linkedVendorId`, `supplierInvoices.supplierId`, `supplierPayments.invoiceId` (indirect) all reference `supplierMaster.id`; `supplierItems.itemId` → `itemMaster.id`; `supplierServices.serviceId` → `serviceMaster.id`.

## API
| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/api/supplier/listSuppliers` | super-admin, back_office | List suppliers, paginated, searchable |
| GET | `/api/supplier/:supplierId/detail` | super-admin, back_office | Supplier master + item/service catalog counts |
| POST | `/api/supplier/createSupplier` | super-admin, back_office | Create supplier, optionally seeding `supplierItems` in the same call |
| PATCH | `/api/supplier/updateSupplier/:id` | super-admin, back_office | Update — discriminated by body `mode`: `"master"` (master fields) or `"item"` (single supplier-item row, selected by `supplierItemsId` or `itemId`) |
| GET | `/api/supplier/:supplierId/listItems` | super-admin, back_office | List a supplier's item catalog, paginated, searchable |
| POST | `/api/supplier/:supplierId/createItem` | super-admin, back_office | Add one item catalog entry |
| PATCH | `/api/supplier/:supplierId/editItem` | super-admin, back_office | Batch-edit one or more item catalog entries (single object or array body) |
| GET | `/api/supplier/:supplierId/listServices` | super-admin, back_office | List a supplier's service catalog, paginated, searchable |
| POST | `/api/supplier/:supplierId/createService` | super-admin, back_office | Add one service catalog entry |
| PATCH | `/api/supplier/:supplierId/editService` | super-admin, back_office | Batch-edit one or more service catalog entries |

Full shapes: `cd backend && bun run contract:query "<METHOD /path>"`.

Note: `PATCH .../editItem` and `PATCH .../editService` return `{success, data, summary}` directly
(not the standard `{success, data}` envelope) — documented as a deliberate deviation in
`route-registry` notes, not normalized.

## Key flows
- `create` (supplier + optional catalog seed): `supplierController.create` → `supplierService.create` → `supplierRepository.create` runs in a transaction: insert `supplierMaster` row, then if `input.supplierItems` was provided, bulk-insert `supplierItems` rows for the new supplier in the same transaction.
- `update` with `mode: "item"`: `supplierService.update` dispatches to `updateItemBySupplierItemsId` or `updateItemByItemId` depending on which selector was provided (schema enforces exactly one via `superRefine`).
- `editItem`/`editService` (batch): body accepts either a single edit object or an array; `supplierService.editSupplierItems`/`editSupplierServices` maps each entry through its own try/catch, resolves by `supplierItemsId`/`itemId` (or `supplierServiceId`/`serviceId`), and returns a per-entry `{index, selector, success, data?, error?}` result plus a `{total, success, failed}` summary — a partial failure in one entry does not roll back or block the others.
- `getDetails`: `supplierRepository.findSupplierDetailById` returns the supplier master row plus `itemCount`/`serviceCount` (separate `count()` queries against `supplierItems`/`supplierServices`).
- Item/service create/list dedupe checks: `findExistingItemIds`/`findExistingServiceIds` exist in the repository for validating a set of ids against `itemMaster`/`serviceMaster` before insert (used by the batch-create/edit paths to reject unknown item/service ids).

## Invariants & gotchas
- `supplierUpdateSchema` is a Zod discriminated union on `mode` (`"master" | "item"`) — passing the wrong shape for the intended mode fails validation, not a runtime branch bug; always check `mode` when reading/writing this endpoint.
- `supplierItems`/`supplierServices` are one row per supplier+item / supplier+service (enforced by `uniqueSupplierItem`/`uniqueSupplierService` unique indexes) — there is no history of price changes over time, only the current negotiated row. `assetRepository.getLastRate` (see `inventory.md`) reads this "current" price as one of its fallback tiers, not a point-in-time snapshot.
- Batch edit endpoints (`editItem`/`editService`) are **not transactional across entries** — each entry's DB write is independent; a client must inspect the per-entry `success`/`error` fields to know what actually applied.
- `supplierBankDetails` exists in the schema with real payment-routing columns (`accountNumber`, `ifscCode`, `isDefault`) but is completely unwired — no way to create/read/update it through the API or UI today.
- `gstNumber` has a unique constraint at the DB level; duplicate-GST creates will surface as a generic DB error unless the service's conflict-translation path covers it (verify against `getConflictError`-equivalent logic in `supplierService.ts` before assuming a clean 409).

## Tests
| File | Covers |
|---|---|
| — | none — no `*.test.ts` file targets supplier service/repository/controller |

## Known gaps / debt
- `supplierBankDetails` is schema-only — no repository/service/controller/route/frontend anywhere. Needed before supplier payments (`supplierPayments`, also schema-only — see `grn.md`) can be built.
- No price-history table for `supplierItems`/`supplierServices` — updating the negotiated price overwrites it with no audit trail, unlike `purchaseOrders` (which has explicit audit columns for delay/close/confirmation events).
- Batch-edit endpoints' non-transactional, per-entry-partial-failure design is a real footgun for any caller assuming atomicity across the array.
- No automated tests for any part of this module.

## History
| Date | PR / commit | Change |
|---|---|---|
| 2026-09-27 | 0a406f4 | Initial as-built map written |
