# Report 24 — backend-dev — S6 items + S7 services and machines

S6 and S7 rules are built. The remaining red tests all need S8 (locations) or S9 (manual movements, stock view).

## Changed (6 files, ~155 lines)
- `backend/src/repository/assetRepository.ts` — item list filters (`isActive`, `category`); service and machine `isActive` filters; machine `code` in search, sort and insert; `findItemById`; `isItemInUse` (ledger, PR, PO and supplier-item lines); item `lastUpdatedBy` on create.
- `backend/src/service/assetService.ts` — SKU and unit locked when in use (409 `ITEM_IN_USE`); who/when on item edit; 409 for machine name or code clash. `getConflictError` now unwraps the Postgres error from drizzle's `cause` (this was the cause of the earlier 500s on SKU and service-code clashes).
- `backend/src/controller/assetController.ts` — passes the actor to `updateItem`.
- PR/supplier code (smallest change, **take work/m1 version on merge**):
  - `backend/src/repository/prRepository.ts` — `findItemMasterByIds` returns active items only, so an inactive item on a PR line gives 400 (BR-INV-05).
  - `backend/src/repository/supplierRepository.ts` — `findExistingItemIds(ids, activeOnly = false)`.
  - `backend/src/service/supplierService.ts` — the two create paths pass `activeOnly = true`, so a new supplier-item link to an inactive item gives 400.
- No PO change was needed. An open PO with an inactive item is still received, and that test passes.

## Test counts
- `inventoryMasters.test.ts`: 54 pass, 20 fail (was 41/33).
- `inventoryStock.test.ts`: 6 pass, 45 fail (unchanged).
- Full run: 191 pass, 104 fail. No test that was green turned red.
- Remaining reds by cause:
  - S9: opening-stock fixtures, stock-take, movement list, stock view. These cover BR-INV-03, BR-INV-04 (ledger), BR-INV-06 and BR-INV-10 (service id as itemId), plus the BR-GRN manual-movement tests.
  - S8: locations (BR-INV-11..15, and BR-INV-25 for locations).
- typecheck OK, lint only warnings, `contract:check` OK.

## Notes
- Machine `code` is nullable in the DB. The API requires it on create.
- Items in `PATCH` count as changing SKU or unit only when the value really differs. Sending the same SKU is fine.
- `updateItem` is not in a transaction with the in-use check. A race is very unlikely for a master edit.

## Map updates
- Item update now takes the actor (`assetService.updateItem(id, input, actorId)`); `getConflictError` unwraps `error.cause` (drizzle v1 wraps driver errors).
- `assetRepository.isItemInUse` is the single in-use check for BR-INV-04.
- Trap: PR and supplier item lookups now filter on `isActive`; a future "edit existing PR line with a deactivated item" path would need care.
