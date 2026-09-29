# Report 25 — backend-dev — S8 locations + S9 stock view and movements

All tests green except the 4 BR-INV-24 tests (S10). Full run: 291 pass, 4 fail. Typecheck OK, lint 190 warnings (unchanged), `contract:check` clean.

## Changed
- `backend/src/service/assetService.ts` — location rules (`checkLocationRules`): vendor_premise needs an existing active supplier, forced virtual, one per supplier (409); other types with a supplier 400; one main_store (409); type/supplier locked once used (409 `LOCATION_IN_USE`); can't change the only main_store (409); who/when; location name clash 409. Manual movement dispatch (document types 400), stock view.
- `backend/src/repository/assetRepository.ts` — `manualMovement` (one tx, item row locked before the balance is read, then `postStock`): stock-take posts counted − balance (0 → 400 "No difference…"; positive needs `unitCostPaise`; negative valued at average); opening stock only with no rows at that item+location (409 "…use stock-take"); qty 3 dp, pcs/set whole; service id → 400; unknown item/location → 404; inactive location → 400; inactive item can only be adjusted down. `listStock` (active items + inactive with stock ≠ 0, per-location balance via `selectDistinctOn`, reorder flag, value, filters, sort). Movement list rows now carry `sourceDocument` (GRN number joined for grn/grn_bypass/grn_correction, null for manual) and `referenceLineId`. Location `isActive` filter, location lookups.
- `backend/src/controller/assetController.ts` — 501 stubs replaced; actor passed to location create/update.
- `backend/src/routes/asset.ts` — `GET /locations` guard → `inventory.view` roles (`// perm: inventory.view`), descriptor auth updated; writes stay `asset.manage`.
- `backend/src/types/asset.types.ts` — legacy manual-movement schema removed; the new union is now `assetManualMovementCreateSchema`.
- `backend/.contracts/api-manifest.json` regenerated.

## Bug found and fixed
- `GET /locations?q=` was a 500: `ilike` on the `location_type` enum column. Now casts to text.

## Map updates
- Manual movements: `assetRepository.manualMovement` (was `createInventoryMovement`); body = discriminated union on `referenceType` (`countedQty` for stock-take, `qty` + `unitCostPaise` for opening).
- New endpoint code: `assetRepository.listStock` behind `GET /api/asset/inventory/stock`. `GET /api/asset/locations` is now readable by owner/floor_supervisor.
- Not indexed: one main_store, one vendor_premise per supplier (checked in the service, small race window).
- Trap: drizzle `ilike` on a pg enum column fails; cast `::text`.
