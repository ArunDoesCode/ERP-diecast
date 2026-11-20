# Stock transfer — API design

> Written by solution-designer from `../spec.md` and `data.md`. Source for the run's `contract.md`.
> Conventions: `backend/.claude/reference/hono-build-conventions.md`, skills `api-endpoint-intake`,
> `pagination-contract`. Max 150 lines.
> Mount `/api/stock-transfer` (new `MAIN_ROUTES.stockTransfer` + `END_POINTS.stockTransfer`; REST paths,
> not the old `/getxxx` style). Layers: `stockTransferController` / `Service` / `Repository`, types in
> `src/types/stockTransfer.types.ts` (every body `.strict()`, BR-STR-07). Responses `{ success, data }`.

## Endpoints
| Method | Path | Permission key | Purpose | Rules |
|---|---|---|---|---|
| GET | `/api/stock-transfer` | `inventory.view` | paged list | BR-STR-27 |
| GET | `/api/stock-transfer/:id` | `inventory.view` | detail with lines, source balance hint, audit, ledger rows | BR-STR-25, 30 |
| POST | `/api/stock-transfer` | `stock_transfer.manage` | create draft | BR-STR-01..08 |
| PATCH | `/api/stock-transfer/:id` | `stock_transfer.manage` | edit draft | BR-STR-09, 01..07 |
| POST | `/api/stock-transfer/:id/cancel` | `stock_transfer.manage` | cancel draft | BR-STR-10 |
| POST | `/api/stock-transfer/:id/post` | `stock_transfer.manage` | post (two rows per line) | BR-STR-11..18 |
| POST | `/api/stock-transfer/:id/reverse` | `stock_transfer.reverse` | reverse a posted transfer | BR-STR-19..24 |

Reused, no new endpoint: `GET /api/asset/locations` (pickers; `asset.manage` or `inventory.view`),
`GET /api/asset/items` (item picker), `GET /api/asset/inventory/stock?locationId=` (per-location balance for
"Move stock", BR-STR-29), `GET /api/asset/inventory/movements` (BR-STR-25; add `stock_transfer`,
`stock_transfer_reversal` to its `referenceType` filter and a `sourceLabel` of "Stock transfer ST-…").
Changed: `POST/PATCH /api/asset/locations` accept `type: "store"` (BR-STR-32); `POST /api/asset/inventory/movements`
refuses the two new reference types (BR-STR-26). No delete route (drafts are cancelled).

## Payloads
Common: ids positive integers; no unknown keys (400). Dates are ISO strings.

### `POST /api/stock-transfer`
- **Request:** `{ sourceLocationId: int>0, destinationLocationId: int>0, notes?: string (trim, 1..500), lines: [{ itemId: int>0, qty: number }] }` — `lines` 1..50 (BR-STR-04); `qty` > 0, <= 1,000,000,000, at most 3 decimals, whole for `pcs`/`set` (BR-STR-05, checked in the service with the item unit).
- **Response 201:** `{ id, transferNumber, status: "draft" }` (full detail shape below is returned by GET).
- **Errors:** 400 validation / any cost field (BR-STR-07) / same location "Source and destination must differ" (BR-STR-01) / inactive location (BR-STR-02) / `vendor_premise` "Use a job work challan" (BR-STR-03) / duplicate item "Item already on this transfer" (BR-STR-04) / qty unit (BR-STR-05) / service or inactive item (BR-STR-06) · 401 · 403 · 404 location or item missing (BR-STR-02).

### `PATCH /api/stock-transfer/:id`
- **Request:** any of `sourceLocationId`, `destinationLocationId`, `notes` (string or null), `lines` (full replacement list, same bounds); at least one field.
- **Response 200:** `{ id, transferNumber, status }`.
- **Errors:** as create, plus 404 transfer · 409 `STR_NOT_DRAFT` status not draft (BR-STR-09, 24).

### `POST /api/stock-transfer/:id/cancel`
- **Request:** `{}` (no reason, BR-STR-10). **Response 200:** `{ id, status: "cancelled" }`.
- **Errors:** 404 · 409 `STR_NOT_DRAFT` (posted / cancelled / reversed).

### `POST /api/stock-transfer/:id/post`
- **Request:** `{}`. **Response 200:** `{ id, status: "posted", postedAt, lines: [{ lineId, itemId, qty, unitCostPaise, valuePaise }] }`.
- **Errors:** 400 inactive location or `vendor_premise` re-checked (BR-STR-02, 03) · 400 inactive or service item (BR-STR-06) · 400 `STR_ZERO_COST` "Item has no cost — fix by stock-take first" (BR-STR-16) · 404 transfer / location · 409 `STR_NOT_DRAFT` (BR-STR-17) · 409 `STR_INSUFFICIENT_STOCK` "Line n: insufficient stock at <location>" (BR-STR-12, 13). Nothing is saved on any error.

### `POST /api/stock-transfer/:id/reverse`
- **Request:** `{ reason: string (trim, 1..500) }`. **Response 200:** `{ id, status: "reversed", reversedAt }`.
- **Errors:** 400 missing reason (BR-STR-19) · 400 `STR_LOCATION_INACTIVE` (BR-STR-22) · 404 · 409 `STR_NOT_POSTED` (draft, cancelled, already reversed; BR-STR-19, 24) · 409 `STR_REVERSE_SHORT` "Line n: only x kg left at <location>" (BR-STR-21).

### `GET /api/stock-transfer/:id` (response 200)
`{ id, transferNumber, status, source: {id, name, type}, destination: {id, name, type}, notes, createdBy/At, lastUpdatedBy/At, postedBy/At, cancelledBy/At, reversedBy/At, reverseReason, lines: [{ lineId, itemId, sku, name, unit, qty, postedUnitCostPaise, postedValuePaise, sourceBalanceQty }], ledgerRows: [{ id, transactionType, referenceType, locationId, quantityChange, unitCostPaise, totalValueChangePaise, createdAt }] }`.
`sourceBalanceQty` (BR-STR-30): live balance at the source from one batch query for all lines (PERF-01), returned only while `draft` (else null); a hint, the binding check is at posting. `postedUnitCostPaise/ValuePaise` and `ledgerRows` empty until posted; fetched in one query `reference_line_id in (line ids) and reference_type in ('stock_transfer','stock_transfer_reversal')` (PERF-02). 404 when the id does not exist. Cost fields are visible to `inventory.view` (BR-INV-19).

## Lists
### `GET /api/stock-transfer`
- **Query:** `page` (default 1), `pageSize` (default 10, max 100), `status` (enum of the four), `sourceLocationId`, `destinationLocationId`, `itemId` (any line has it: `exists` on `stock_transfer_items`), `fromDate`, `toDate` (`YYYY-MM-DD` strings, validated, else 400; on `created_at`, IST day bounds, `fromDate <= toDate` else 400), `sortBy`, `sortDir`.
- **Sort whitelist:** `createdAt`, `transferNumber`, `status`, `postedAt`. `sortBy` omitted -> `createdAt` desc (BR-STR-27); explicit `sortBy` without `sortDir` -> asc (CR-002); `id` desc/asc tiebreaker always added. Invalid `sortBy` -> 400.
- **Row:** `{ id, transferNumber, status, sourceName, destinationName, lineCount, createdAt, postedAt }`. No search box in the spec (no `q`).
- **Response:** `{ success, data, meta: { page, pageSize, total, totalPages } }`; rows and count in parallel.

## Error codes (all through `AppError`, body `{ success:false, message, code }`)
`STR_NOT_DRAFT` 409 · `STR_NOT_POSTED` 409 · `STR_INSUFFICIENT_STOCK` 409 · `STR_REVERSE_SHORT` 409 · `STR_ZERO_COST` 400 · `STR_LOCATION_INACTIVE` 400 · `STR_VENDOR_LOCATION` 400 · `STR_SAME_LOCATION` 400 · `STR_DUPLICATE_ITEM` 400 · `STR_RETRY` 409 (deadlock 40P01, safe to retry). Validation 400 uses the shared "Validation failed" shape. A duplicate `transfer_number` (23505) maps to the shared 409 handler (BR-STD-01).

## Registration notes
Each route needs a `registry.register(...)` descriptor with summary, tags `["stock-transfer"]`, request and response schemas, security key, then `bun run contract:generate`. Frontend `API_ROUTES` adds the paths above. Permissions: add `stock_transfer.manage` and `stock_transfer.reverse` to `PERMISSIONS`, seed ow + bo (Cards 4, 5), module `inventory`; add the screen `/inventory/stock-transfers` (key `inventory.view`) to `SCREENS`.

## Choices made
| Question | Choice | Source |
|---|---|---|
| — | Moved to `../assumptions.md` (A-11..A-19) by spec-analyst, 2026-11-20. | |
