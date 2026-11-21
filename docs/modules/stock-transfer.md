---
module: stock-transfer
spec: docs/specs/stock-transfer/spec.md (v1, frozen)
last_verified_commit: 14d31d1
last_verified_on: 2026-11-21
depends_on: [inventory, grn-stock, auth-setup]
---

# Stock transfer — as-built map

> What the code **is** (the spec says what it **should be**). Built on `feature/scm-rfq` inside epic `epic/scm`
> (run id `scm-stock-transfer`). Explore only code changed since `last_verified_commit`. Symbol names, not line numbers.

## Summary
A stock transfer moves one or more stock items between two of our own locations (one site, one GSTIN).
Draft → posted (or cancelled); a posted transfer is never edited, only reversed. Posting writes two ledger
rows per line through `postStock` (out of the source, into the destination) at the item's plant average cost
with `averageEffect: "none"`, so plant stock and value never change. Reverse writes the counter rows at the
cost kept on the line. No price, no GST, no journal. Full (BR-STR-01..35; 28..31 are screens with no
automated test).

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| schema | `backend/src/db/schemas/02_procurement-catalog.ts` | `stockTransfers`, `stockTransferItems`, enum `stock_transfer_status`; `location_type` + `store`; `inventory_ref_type` + `stock_transfer`, `stock_transfer_reversal` |
| migrations | `backend/src/db/migrations/20261121102633_majestic_ultimates/` (enum adds), `20261121102645_concerned_carlie_cooper/` (tables, indexes, checks) | two files on purpose (A-53) |
| types | `backend/src/types/stockTransfer.types.ts` | create / update / reverse bodies (strict), empty strict body for cancel / post, list query (`sortBy`/`sortDir` no default), `isoDate` refined to a real calendar day, response shapes per status |
| lib | `lib/db-errors.ts` | `isRetryableConflict` (40P01 / 40001) |
| repository | `backend/src/repository/stockTransferRepository.ts` | `transaction`, `list`, `findById`, `lockById`, `findLocations(ids, ex, lock)` (`for share`, id order), `findItems(ids, ex, lock)` (`for update`, id order), `balancesAt(locationId, itemIds)`, `findLines`, `findLedgerRows`, `findEmployeeNames`, `insertTransfer` (numbering), `updateHeader`, `replaceLines`, `setLinesPostedCost` (one `UPDATE … FROM (VALUES)`) |
| service | `backend/src/service/stockTransferService.ts` | `list`, `getDetails`, `create`, `update`, `cancel`, `post`, `reverse`; helpers `withRetryMapping`, `assertSameLocationRule`, `assertNoDuplicateItems`, `checkLocations`, `checkItems`, `assertDraft` |
| controller / routes | `controller/stockTransferController.ts`, `routes/stockTransfer.ts` (`/api/stock-transfer`), `END_POINTS.stockTransfer` | 7 routes, REST style (list/create on root `/`) |
| permissions | `lib/permissions.ts` | `stock_transfer.manage`, `stock_transfer.reverse` (owner + back_office); reads use `inventory.view`. Screen `stock-transfers` `/inventory/stock-transfers` |
| cross-module | `stockPostingRepository.postStock`, `assetRepository.listInventoryMovements` (joins `stock_transfers` for the number), `assetService.checkLocationRules` (`store` type) | see `inventory.md`, `grn.md` |
| frontend api | `frontend/src/types/stock-transfer.ts`, `lib/api/stock-transfer/{fetchers,queries}.ts`, `API_ROUTES.stockTransfers` | `stockTransferKeys` {all, lists, list, detail}; post / reverse also invalidate `["assets","stock"|"movements"|"reconciliation"]` |
| frontend ui | `app/(protected)/inventory/stock-transfers/` (list, `new?item=&from=`, `[id]`, `[id]/edit`, loading, error); `components/views/stock-transfers/{StockTransferListView,StockTransferFormView,StockTransferDetailView,use-transfer-controls}`; `components/pages/stock-transfers/{TransferForm,TransferLinesEditor,TransferActionDialogs,TransferPanels,transfer-format}` | status tone `st` in `lib/status-tone.ts`; breadcrumbs branch in `lib/shell/breadcrumbs.ts` |
| frontend (shared / other screens) | `InventoryStockManager` ("Move stock" per location line), `InventoryLocationsManager` (Store type), `InventoryMovementsManager` + `InventoryMovementsView` + `inventory/movements/page.tsx` (labels, links, Source type filter, `?referenceType=`), `InventoryView` (nav card), `SearchableSelect` (option `disabled`), `FilterBar` (quick `count: null` hides the number), `useStockQuery(params, enabled)` | |

## Data model
- `stock_transfers`: `transferNumber` unique `ST-<IST year>-<seq, min 4 digits>` (counter `doc_type` `stock_transfer`, period = IST year), `status` draft | posted | cancelled | reversed, `sourceLocationId`, `destinationLocationId`, `notes` (≤ 500), who/when columns for create, last update, cancel, post, reverse + `reverseReason` (no audit table, as SCO). Checks: locations differ; `posted_at` / `cancelled_at` / `reversed_at` set with their status; `reversed_at` needs `reverse_reason`. Indexes: (status, id), source, destination, created_at.
- `stock_transfer_items`: `transferId`, `itemId`, `qty` numeric(13,3) (> 0, ≤ 1e9), `postedUnitCostPaise`, `postedValuePaise` (set at post, reused by reverse). Unique (transfer, item); index on item.
- Ledger rows: `referenceType` `stock_transfer` (post) / `stock_transfer_reversal` (undo), `referenceId` = transfer id, `referenceLineId` = line id, notes `Stock transfer ST-…` / `Reversal of stock transfer ST-…`.

## API
Base `/api/stock-transfer`: GET `/` (inventory.view; paged; filters `status`, `sourceLocationId`, `destinationLocationId`, `itemId`, `fromDate`/`toDate` on `created_at` IST day (from > to → 400); `sortBy` createdAt | transferNumber | status | postedAt), GET `/:id` (inventory.view; actors with names, `sourceBalanceQty` per line while draft, `ledgerRows`), POST `/` and PATCH `/:id` (manage), POST `/:id/cancel`, `/:id/post` (manage, empty body), POST `/:id/reverse` (`stock_transfer.reverse`, body `reason` 1–500).
Full shapes: `cd backend && bun run contract:query "<METHOD /path>"`; run contract was `.pipeline/scm-stock-transfer/contract.md`.

Codes: 400 `STR_SAME_LOCATION`, `STR_DUPLICATE_ITEM`, `STR_LOCATION_INACTIVE`, `STR_VENDOR_LOCATION` (save / post), `STR_ITEM_INACTIVE`, `STR_QTY_WHOLE`, `STR_ZERO_COST`; 404 transfer / location / `Line N: item not found or not a stock item`; 409 `STR_NOT_DRAFT`, `STR_NOT_POSTED`, `STR_INSUFFICIENT_STOCK`, `STR_REVERSE_SHORT`, `STR_VENDOR_LOCATION` (reverse), `STR_RETRY`; 403 `PERMISSION_DENIED`.

## Key flows
- `create`: same-location and duplicate-item checks → `checkLocations` (exist, active, not `vendor_premise`) → `checkItems` (stock item, active, whole qty for pcs/set, average cost > 0) → insert header + lines with the next number.
- `update` (draft only, header locked): locations re-checked only when a location id is in the body; `lines` if sent replace all lines; notes-only edit allowed.
- `cancel`: draft → cancelled, no reason.
- `post` (inside `withRetryMapping`): lock header → `assertDraft` → locations `for share` → items `for update` (re-checks as on save) → `balancesAt(source)` per line (`STR_INSUFFICIENT_STOCK`, names the line) → per line `postStock` out of source (`blockNegative`) then in to destination, both at item average → `setLinesPostedCost` → header posted. One failing line refuses the whole transfer.
- `reverse`: lock header (posted only) → both locations `for share`, must be active and not `vendor_premise` (A-54) → items locked (inactive items allowed, A-18) → `balancesAt(destination)` covers each line (`STR_REVERSE_SHORT`, names the line and qty left) → per line out of destination, in to source at `postedUnitCostPaise` → header reversed with reason.
- Deadlock / serialization failure in post or reverse → 409 `STR_RETRY`, nothing saved.

## Invariants & gotchas
- Lock order (A-03): header `for update` → locations `for share` (id order) → items `for update` (id order) → postings in line order.
- Plant stock and average never change on a transfer; only per-location balances move. Moving to a scrap yard is not a write-off.
- A service id on a line is a 404 (services live in `service_master`, lookup is on `item_master` only; A-52), not the spec's 400.
- `STR_ZERO_COST` message is the spec text with no line number (tests match it); other line errors start `Line N:`.
- Reverse throws `InternalServerError` if a posted line has no `postedUnitCostPaise` (should never happen).
- List `sortDir` has no Zod default: `sortBy` without `sortDir` = asc; both omitted = `createdAt desc` (service resolves).
- Frontend: the form's source-balance hint reads `GET /asset/inventory/stock?locationId=<source>&pageSize=100`; an item outside those 100 rows shows "–". Location pickers hide `vendor_premise` only. `useStockQuery(undefined)` fires an unfiltered query, so pass `enabled`.
- Stock view is one row per item with locations inside the row, so "Move stock" is a 32 px button on each location line (hidden on balance 0 and `vendor_premise`, needs `stock_transfer.manage`).
- Status chips on the list show no counts (API returns none).

## Tests
| File | Covers |
|---|---|
| `backend/tests/routes/stockTransfer.test.ts` | BR-STR-01..10, 16, 27, 30, 32..34 (draft, list, detail hint, permissions, `store` type) |
| `backend/tests/routes/stockTransferPost.test.ts` | BR-STR-02, 03, 06, 09, 11..26, 33..35 (post, reverse, ledger rows, movements list number) |
| `backend/tests/lib/permissions.test.ts` | two new keys + seed grants |

## Known gaps / debt
- BR-STR-28..31 (screens, Move stock action, draft hint, post confirm) have no automated test; screens not checked visually by the build.
- Spec says a service on a line → 400; code answers 404 (A-52).

## History
| Date | PR / commit | Change |
|---|---|---|
| 2026-11-21 | e5aaee4..14d31d1 | Map created: draft / post / cancel / reverse, two ledger rows per line at average cost, IST-year numbering, `store` location type, transfer number in movements list, screens + Move stock; fixes CR-01..05, SEC-01/02, PERF-03 |
