# Sale order — API design

> Written by solution-designer from `../spec.md` and `data.md`. Conventions: `hono-build-conventions.md`, skills
> `api-endpoint-intake`, `pagination-contract`. Two new routers: `routes/customer.ts` (`/customers`) and
> `routes/saleOrder.ts` (`/sale-orders`); paths added to `END_POINTS` first. Envelope `{success, data}` /
> `{success, data, meta}`; ids are integers; dates `YYYY-MM-DD` (IST day); qty JSON numbers with ≤ 3 decimals.
> All routes need login (401). A permission failure is 403 `PERMISSION_DENIED` (BR-SO-04).

## Endpoints
| Method | Path | Permission key | Purpose | Rules |
|---|---|---|---|---|
| GET | `/api/customers` | `so.view` (alsoKeys `customer.manage`) | list (also the customer combobox: `?isActive=true&q=`) | BR-SO-03 |
| GET | `/api/customers/:id` | `so.view` (alsoKeys `customer.manage`) | detail | BR-SO-03 |
| POST | `/api/customers` | `customer.manage` | create | BR-SO-01, 03 |
| PATCH | `/api/customers/:id` | `customer.manage` | edit, activate / deactivate (`isActive`) | BR-SO-01, 02 |
| GET | `/api/sale-orders` | `so.view` | list | BR-SO-04 |
| GET | `/api/sale-orders/:id` | `so.view` | detail: header, lines, linked live PR / SCO, current snapshot summary | BR-SO-19, 51 |
| POST | `/api/sale-orders` | `so.manage` | create draft | BR-SO-05..08 |
| PATCH | `/api/sale-orders/:id` | `so.manage` | edit (draft full, confirmed limited) | BR-SO-09, 10, 13, 14 |
| POST | `/api/sale-orders/:id/confirm` | `so.manage` | draft → confirmed | BR-SO-12 |
| POST | `/api/sale-orders/:id/hold` | `so.manage` | confirmed → on_hold | BR-SO-16 |
| POST | `/api/sale-orders/:id/resume` | `so.manage` | on_hold → confirmed | BR-SO-16 |
| POST | `/api/sale-orders/:id/close` | `so.manage` | manual close | BR-SO-17 |
| POST | `/api/sale-orders/:id/cancel` | `so.manage` | cancel | BR-SO-18, 19, 20 |
| GET | `/api/sale-orders/:id/audit` | `so.view` | audit trail of the SO (who, when, before → after), paginated | BR-SO-52 |
| POST | `/api/sale-orders/:id/explosions` | `so.explode` | run explosion, new snapshot | BR-SO-21..38 |
| GET | `/api/sale-orders/:id/explosions` | `so.view` | list snapshots of the SO | BR-SO-21 |
| GET | `/api/sale-orders/:id/explosions/:eid` | `so.view` | snapshot header + totals + `outOfDate` | BR-SO-38 |
| GET | `/api/sale-orders/:id/explosions/:eid/rows` | `so.view` | rows (11 columns) | BR-SO-50, 51 |
| POST | `/api/sale-orders/:id/explosions/:eid/drafts` | `so.explode` (+ `pr.manage` / `sco.manage` checked in the service per picked row) | create draft PRs and SCOs, all or nothing | BR-SO-39..48 |

No delete route anywhere (BR-SO-02, 20). Dispatch's delivered-qty / close / reopen functions are service hooks (data.md), not routes.
Reused, not new: supplier service lists for job-worker candidates come back inside the rows response (planners need no `supplier.view`);
PR and SCO numbers come from the existing PR / SCO services; PR create keeps its own endpoint and now validates `saleOrderId` (BR-SO-48).

## Payloads
Common bounds: `reason` 3–500 chars; `notes` ≤ 1000 (line notes ≤ 500); `customerPoNumber` ≤ 50; every text field is trimmed (reason, notes, customerPoNumber, names, addresses) before the length check, empty after trim = absent / 400; dates: `orderDate` 2000-01-01..today, `deliveryDate` today..today + 5 years, `customerPoDate` ≤ today; qty `> 0`, ≤ 1,000,000, whole for pcs/set else ≤ 3 decimals (BR-SO-07);
`unitPricePaise` int 0..100,000,000; `gstPercent` one of the allowed set (BR-SUP-13); max 200 lines per SO.

### `POST /api/customers` · `PATCH /api/customers/:id`
- **Request:** `{ name (1–120), stateCode (2 digits), address (1–300), gstin? (15, GST regex, first 2 = stateCode), isActive? (patch only) }`; PATCH needs ≥ 1 field.
- **Response 201 / 200:** customer row. **Errors:** 400 bad GSTIN / state mismatch (BR-SO-01) · 403 · 404 · 409 `CUSTOMER_NAME_EXISTS` (BR-SO-01).

### `POST /api/sale-orders`
- **Request:** `{ customerId, orderDate, customerPoNumber?, customerPoDate?, shipToAddress? (≤300), shipToStateCode? (2; required with address), notes?, lines: [{ itemId, qty, unitPricePaise, gstPercent, deliveryDate, notes? }] (1–200) }`. Unit comes from the item; `status`, `deliveredQty` sent → 400 (BR-SO-09, 10).
- **Response 201:** SO detail incl. `soNumber`, `totalAmountPaise`, `editVersion`.
- **Errors:** 400 inactive customer / item, future order date, past delivery date, bad qty / price, same item + date twice (BR-SO-02, 06, 07, 08) · 409 `CUSTOMER_PO_EXISTS`, `details.soNumber` = the other SO (BR-SO-06).

### `PATCH /api/sale-orders/:id`
- **Request:** `{ editVersion (required), header fields as above, lines?: [{ id?, itemId?, qty, unitPricePaise, gstPercent, deliveryDate, notes? }], removeLineIds?: int[] }`. Line with `id` = update, without = add; every `id` and `removeLineIds` entry is loaded `where so_id = :id` and not removed (else 404). Removal is soft (data.md); line numbers are never reused. At least one field besides `editVersion`.
- **Draft:** everything editable, never zero lines (400, BR-SO-10). **Confirmed:** only qty, price, gst, delivery date, notes, new lines, ship-to; `customerId` or an existing line's `itemId` → 409 `SO_FIELD_LOCKED` (BR-SO-13).
- **Errors:** 409 `STALE_VERSION` (race, BR-SO-52) · 409 `SO_NOT_EDITABLE` (on_hold, closed, cancelled, BR-SO-16, 20) · 409 `QTY_BELOW_DELIVERED` (BR-SO-14) · 409 `SO_LINE_DELIVERED` removing a line with delivered qty > 0 (BR-SO-14) · 409 `LIVE_DOCUMENTS_LINKED` listing PR / SCO numbers (BR-SO-14, 15) · 400 as create.

### `POST …/confirm` · `…/resume`
- **Request:** `{ editVersion }`. **Response:** SO. **Errors:** 400 inactive customer / item or past delivery date, naming them (BR-SO-12) · 409 wrong status or stale version.

### `POST …/hold` · `…/close` · `…/cancel`
- **Request:** `{ reason (3–500), editVersion }`. **Response:** SO.
- **Errors:** 409 wrong status · 409 `HAS_DELIVERIES` on cancel with delivered > 0, "close instead" (BR-SO-18) · 409 `LIVE_DOCUMENTS_LINKED` on cancel, lists numbers (BR-SO-19). Close sets `closeKind = manual`; reservations released on close / cancel (BR-SO-17, 20, 35).

### `POST /api/sale-orders/:id/explosions`
- **Request:** `{}` (no body fields; the run uses open qty of current lines, BR-SO-09).
- **Response 201:** `{ id, runNo, number ("SO-…/E2"), createdAt, rowCount, flaggedCount }`; previous current snapshot becomes `superseded`, its reservations released, in the same transaction (BR-SO-35, 36).
- **Errors:** 409 `SO_NOT_CONFIRMED` (draft, on_hold, closed, cancelled, BR-SO-16, 21) · 409 `EXPLOSION_IN_PROGRESS` same SO (BR-SO-37) · 409 `EXPLOSION_BUSY` global wait timed out (BR-SO-37) · 403. Per-line failures (no BOM, loop, inactive) are flags on rows, not errors (BR-SO-26..28).
- **BOM call:** one in-process call per level, `bomNeedsService.expandBomLevel(tx, { partId, qty: net })` (BR-SO-23, 24), called once per level with every item of that level (at most 10 calls), merging by item per level with a visited set and SO's own loop / depth guard (`assertNoLoop`, `MAX_BOM_LEVELS`). Free stock: one `freeStockByItems(tx, itemIds[])` query per level; open PR / PO / SCO supply one batched query per level. Rows, sources and reservations are inserted multi-row. More than 200 rows → 400 `EXPLOSION_TOO_LARGE`. Not an HTTP hop, no copy of the maths. Extra fields wanted from BOM: see data.md Choices made.

### `GET …/explosions/:eid` and `…/rows`
- **Header response:** `{ id, runNo, number, status, outOfDate, outOfDateReasons[] ("so_changed" | "bom_changed" | "delivery_changed"), createdBy, createdAt, supersededAt, totals }`. No price fields anywhere (BR-SO-51).
- **Row response:** `{ id, itemId, sku, name, level, type, tag?, blockReason?, bomRevision? ("A"), bomRevisionId?, uom, grossQty, onHandQty, reservedOtherQty, freeQty, openPrQty, openPoQty, openScoQty, lateSupplyQty, netQty, pourQty?, sendQty?, requiredBy, pastDue, selectable, raised? { type: "pr"|"sco", docId, docNumber, qty, at }, sources: [{ soLineId, lineNo, qty }], jobWorker? { defaultVendorId, serviceId, candidates: [{ vendorId, name }] } }`.
- Header adds `bomRevisions: [{ partSku, revision }]`. Row `sources` entries: `{ soLineId, lineNo, qty, sourceSku, sourceLevel }` (the item that needed it and its level). Sources and job-worker candidates load in one batched query per page; `outOfDate` in one query. Candidate names are returned only to `so.explode` holders (others get `candidates: []`).
- **Errors:** 404 SO or snapshot (snapshot must belong to the SO).

### `POST …/explosions/:eid/drafts`
- **Request:** `{ rows: [{ rowId, qty (> 0, ≤ 1,000,000, unit rule), vendorId? , expectedReturnDate? }] }` 1–200 rows, no duplicate `rowId`. `vendorId` / `expectedReturnDate` only for job-work rows (BR-SO-43).
- **Response 201:** `{ prs: [{ id, prNumber, lineCount }], scos: [{ id, scoNumber }], rows: [{ rowId, prItemId?, scoItemId?, stillShortBy }] }`. Prices are not returned (BR-SO-51).
- **Behaviour:** snapshot must belong to the SO and every `rowId` to the snapshot (else 404); picked `qty` > the row's net need → 400 `PICK_OVER_NET`; permission keys checked once per request, before the transaction; PR and SCO lines inserted multi-row; document numbers allocated last. One transaction: `sale_orders for update` → snapshot rows `for update` by id → checks → create one PR (type `sale_order`, `saleOrderId`, note "Auto-generated from SO-…/E1 — review before buying") and one SCO per job worker through the PR / SCO services passing the same `tx` → write `pr_item_id` / `sco_item_id` on rows. Any failure rolls everything back (BR-SO-46).
- **Errors:** 400 qty / vendor without the service / missing or invalid return date / row not raisable (net 0, flagged, cast, assemble, inactive) naming the row (BR-SO-39, 43, 44) · 403 missing `pr.manage` / `sco.manage` for a picked row, nothing created (BR-SO-45) · 409 `SNAPSHOT_SUPERSEDED` / `SNAPSHOT_OUT_OF_DATE` "re-run first" (BR-SO-36, 38) · 400 `PICK_OVER_NET` · 404 snapshot / row not in this SO · 409 `ROW_ALREADY_RAISED` (BR-SO-46) · 409 `SO_NOT_CONFIRMED`.

## Lists
| Endpoint | Filters | sortBy whitelist | Default sort | Page |
|---|---|---|---|---|
| `GET /customers` | `q` (name, trgm), `isActive`, `stateCode` | `name`, `createdAt` | `name asc` | 1 / 10 / max 100 |
| `GET /sale-orders` | `q` (SO no., customer PO no., customer name), `status` (CSV, e.g. `status=draft,confirmed`; Zod enum-array transform; unknown value → 400), `customerId`, `orderDateFrom`, `orderDateTo` (inclusive IST days), `deliveryBefore` (any open line) | `soNumber`, `orderDate`, `createdAt`, `totalAmountPaise` | `createdAt desc` | 1 / 10 / max 100; each item adds `nextDeliveryDate` (earliest open, non-removed line date), `snapshotStatus` (`current` / `out_of_date` / `superseded` / `none`), and `meta.statusCounts` (`{draft, confirmed, on_hold, closed, cancelled}` for the same filters except `status`) |
| `GET /sale-orders/:id/audit` | `action` | `at` | `at desc` | 1 / 10 / max 100 |
| `GET …/explosions` | `status` | `runNo`, `createdAt` | `runNo desc` | 1 / 10 / max 100 |
| `GET …/explosions/:eid/rows` | `type`, `net` (`short` = net > 0), `flagged` | `level`, `sku`, `netQty`, `type` | `level asc, sku asc` (sku via join to `item_master`, PK tie-breaker) | 1 / 10 / max 100 |
Every list adds the PK tie-breaker; `total` from a parallel count.

## Audit
Detail `GET /sale-orders/:id` also returns `raisedDocuments: [{ type: "pr"|"sco", id, number, status, runNo }]` (all explosion-linked PR / SCO lines, any run). Only explosion-linked lines count as raised-from-SO for BR-SO-14 / 19; a hand-made PR carrying `saleOrderId` does not block edits. Dispatch hooks (`applyDelivery`, `closeFullyDelivered`, `reopenAfterDeliveryCancel`) also write `sales_audit_log`.
Every mutating route writes `sales_audit_log` (actor, action, before → after, SO id) in the same transaction (BR-SO-52); customer routes write target `customer`.

## Choices made
| Question | Choice | Source |
|---|---|---|
Moved to `../assumptions.md` (A-44..A-54) by spec-analyst, 2026-11-20.
Notes (pre-freeze): `outOfDateReasons` come from `needVersion`, `deliveryVersion` and a live BOM compare; customer GETs accept `so.view` or `customer.manage`; `statusCounts` ignores the `status` filter so the tabs keep their numbers.
