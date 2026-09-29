# Report 23 — frontend-dev — inventory screens

Result: DONE. `bunx tsc --noEmit` and `bun run lint` clean.

## Screens touched
All under `/inventory/*`. Roles: whatever the sidebar/route guard allows (not changed). API roles per contract: masters `asset.manage` (super-admin, back_office); stock view `inventory.view`; manual posting `inventory.adjust`.

| URL | Change |
|---|---|
| `/inventory` | New "Stock" button in the module grid (no sidebar change) |
| `/inventory/items` | Category + Unit dropdowns (fixed lists); Standard rate (₹, sent as paise); Reorder level; read-only Current stock + Average cost (edit); Active switch (edit only); list shows stock, std rate, status. Edit sends only changed fields, so an unchanged SKU/unit never hits ITEM_IN_USE; a real 409 shows as a toast with the API message |
| `/inventory/services` | SAC field: "6 digits, starts 99", checked on the client; Active switch (edit only); Status column |
| `/inventory/machines` | New Code field (required); Status; Last maintenance is a date picker (max today, future rejected); Active switch (edit only); Code + Active columns |
| `/inventory/locations` | Type; Supplier picker (search) only for `vendor_premise`; Virtual checkbox for other types; Active switch (edit only); Status column. Edit sends only changed fields (avoids LOCATION_IN_USE on unchanged) |
| `/inventory/stock` (NEW) | Table: item, SKU, category, stock+unit, "Below reorder" tag, average cost, value, reorder level, per-location balances, "Inactive" tag. Filters: search, category, below-reorder. Server sort on item/SKU/category/stock/value |
| `/inventory/movements` | List has Source column (e.g. "GRN GRN-0012", "Stock-take (manual)"); detail dialog shows source and reason (notes), read-only. Create dialog: "Stock-take" (default; counted qty, cost in ₹ when counted > balance) or "Opening stock" (qty + rate required); item and location are search pickers (were raw ID inputs); reason required. Item filter uses the item picker |

API errors (400/403/409) show as toasts with the API message (existing mutation `onError`).

## Map updates
- New route `/inventory/stock` → `InventoryStockView` → `InventoryStockManager`.
- New helper `components/pages/inventory/inventory-format.ts` (`formatPaise`, `todayIso`).
- New query key `assetKeys.stock(params)`; hook `useStockQuery`; fetcher `getStock`. Item update and movement create also invalidate `assets/stock`.
- `API_ROUTES.assets.inventory.stock` added (edited `routes.ts`, outside the brief's "may edit" list but required by the routes rule; one line).
- `types/asset.ts`: new fixed lists (`assetItemCategoryValues`, `assetItemUomValues`), form schemas (`assetItemFormSchema` rupees, `assetMachineFormSchema`, `assetLocationFormSchema`, `assetServiceFormSchema`, `assetMovementFormSchema`), wire schemas for both movement bodies (discriminated on `referenceType`), `AssetStockRow`, `sourceDocument` on `AssetMovement`. Create schemas no longer include `isActive` (contract: POST is strict).
- Traps: zsh `no matches found` on `--include=*.ts` globs; worktree sandbox refuses complex heredoc + `cd` commands.

## QUESTIONS
1. Owner has `inventory.adjust` but `GET /locations` needs `asset.manage` (super-admin, back_office only), so the Location picker in the manual stock form would 403 for owner. Recommend widening `GET /locations` to `inventory.view` (same as items). Not fixed on the frontend.
2. Item row has no "in use" flag, so SKU/unit are not disabled up front; the 409 toast is the only signal (brief allowed this).
3. Stock screen has no location filter (would need the locations list, which floor_supervisor/owner cannot read). Add after Q1 if wanted.
