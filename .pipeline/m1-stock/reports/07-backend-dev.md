# Report 07 — backend-dev — S5 manual movements, item API, reconciliation

Result: DONE. typecheck clean, lint 121 warnings (unchanged), contract:check up to date. Full `bun test`: 132 pass / 21 fail (was 107 / 46). All S5 tests green (BR-GRN-33 manual, 37, 40, 41, 42, 43, 44). No green test turned red.

Remaining 21 reds are S2-S4 ids (BR-GRN-01, 02, 05, 10, 15, 29, 33-correction, 34). BR-GRN-40 item API strictness already came from the contract step (schemas `.strict()`), nothing to add.

## Files changed
- `backend/src/repository/stockPostingRepository.ts` — `postStock` options `valueAtAverage` (row valued at item average) and `blockNegative` (409 "Insufficient stock at this location" when item+location balance would go below 0). S4 correction can use `blockNegative`.
- `backend/src/repository/assetRepository.ts` — `createInventoryMovement` now takes the manual body: type `adjustment`, `referenceId` 0, stock-out at average + blocks negative, stock-in at given cost; new `inventoryReconciliation` (raw SQL union of item-stock and item+location mismatches, paginated, sort by itemId).
- `backend/src/service/assetService.ts` — `createInventoryMovement` rejects document ref types (400, "source document"), stock-in cost must be > 0 (400); `inventoryReconciliation`.
- `backend/src/controller/assetController.ts` — movement uses `assetManualMovementCreateSchema`; reconciliation handler implemented.

Routes and role guards were already in place from the contract step; no route or manifest change.

## PO files touched
None.

## Map updates
- `POST /api/asset/inventory/movements` = manual only (`stock_adjustment`/`opening_stock`; `reason` required; roles owner, back_office, super-admin). Stock-out cost is ignored and set to the current average; stock-in needs cost > 0 and feeds the average. Ledger `reference_id` = 0 for these rows.
- `GET /api/asset/inventory/reconciliation` returns only mismatch rows (`kind` `item_stock` | `item_location_balance`); comparison tolerance 0.0005.
- Old `assetInventoryMovementCreateSchema` (asset.types) is now unused by the route; safe to delete later.
- Gotcha: `contract:check`/`contract:generate` need the env file (`--env-file=...stock-test.env`), otherwise DATABASE_URL zod error.
