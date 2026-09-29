# Report 30 — backend-dev — inventory review round 1 fixes

Full `bun test`: 302 pass, 0 fail. Typecheck OK, `contract:check` clean. `db:test:prepare` ran (new indexes applied). Lint 191 warnings (was 190); none are in the files I changed (checked per file), so the extra one comes from a file outside this change.

| Finding | Fixed where |
|---|---|
| PERF-20 | `02_procurement-purchasing.ts` `idx_pr_items_item_id`, `idx_po_items_item_id`; `02_procurement-suppliers.ts` `idx_supplier_items_item_id` (existing unique index leads with supplier_id). Index-only. |
| PERF-21 | `02_procurement-catalog.ts` `idx_inventory_ledger_location (location_id, id desc)` |
| PERF-22 | `02_procurement-catalog.ts` `idx_inventory_ledger_created_at` |
| CR-22 | `stockPostingRepository.ts` `postStock`: unknown location 404, inactive 400 "Location is inactive" (BR-INV-15, covers GRN path). `assetService.updateLocation`: deactivating the only active main_store is 409 (`countLocations` got `activeOnly`). |
| CR-23 | `assetService.createLocation` / `updateLocation`: client `isVirtual` ignored; vendor_premise always true, reset to false when a location leaves vendor_premise. |
| CR-24 | `assetRepository.updateItemLocked`: one tx, item row `for update`, in-use check + update inside it; `assetService.updateItem` uses it. `isItemInUse` is now the module function `itemInUse(tx, id)`. |
| CR-25 | `assetService.assertReorderLevelFitsUnit`, used on item create and on update (effective unit and reorder level) → 400 for pcs/set with a fraction. |
| CR-26 | `assetRepository.getLastRate`: PO lines with rate > 0 only; standard-rate step returns the stored value as-is (0 for a legacy item, source `standard_rate`). `assetLastRateSchema.ratePaise` now min 0 (response schema only; manifest regenerated, no other shape change). |
| SEC-20 | `assetRepository.likePattern` escapes `\ % _`; used by all five list searches. |

`pr_estimate` source name unchanged (SPEC-24 backlogged).

## Map updates
- `postStock` now refuses inactive/unknown locations for every caller (GRN, correction, manual).
- Item edit with SKU/unit change is one locked transaction (`assetRepository.updateItemLocked`).
- Last rate can return 0 only for a legacy item with no standard rate.
- New indexes: ledger `(location_id, id desc)` and `created_at`; `item_id` on PR items, PO items, supplier items.
- Trap: the only active main_store can't be deactivated; with the one-main_store index that means main_store can never be deactivated.
