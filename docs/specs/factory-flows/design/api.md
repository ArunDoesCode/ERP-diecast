# Factory flows — API design

> Written by solution-designer from `../spec.md` and `data.md`. Source for the run's `contract.md`.
> Conventions: `backend/.claude/reference/hono-build-conventions.md`, skills `api-endpoint-intake`,
> `pagination-contract`. Existing shapes checked with `bun run contract:query`. Pass 2.

## Principle
BR-FF-05: no new write endpoint. Every action reuses a frozen route. Four new **read-only** routes,
plus additive fields / filters on seven existing list or detail routes (listed last, each owned by its
module's spec). Paths follow the module casing already in use (`/api/grn/getgrns`, `/api/approval/getMyPendingApprovals`).

## Endpoints
### New (all GET, read-only)
| Method | Path | Permission | Purpose | Rules |
|---|---|---|---|---|
| GET | `/api/home/getcounts` | any signed-in; each tile needs its own key (checked in service, tile omitted without it) | All Home tiles' counts in one call; also feeds the menu badge | BR-FF-10..33, 85 |
| GET | `/api/grn/getreceivablepos` | `grn.edit_draft` | Picker + receive-form data: receivable POs with lines, no prices | BR-FF-61..64, 66, 70, 71, 72 |
| GET | `/api/approval/getDocumentView/:docType/:docId` | any signed-in; service enforces the read rule BR-APR-51 (`approval.view_all`, requester, or chain approver) | Read-only header + lines + amounts + notes + trail of a PR / PO / SCO for the inbox preview and the read-only page | BR-FF-53, 81, 83, 88 |
| GET | `/api/document/getpanel/:docType/:docId` | any signed-in; service: doc key (`pr.manage` / `po.manage` / `grn.view`) **or** BR-APR-51 read rule (pr, po only) | Side panel: totals, approvals, linked documents, history | BR-FF-42, 50..55 |

Note for security-auditor: three routes are "any signed-in + service check", the same pattern as the
existing approval routes (a route cannot name one key when access is key **or** approver). Every one calls
`can()` / `assertCanReadRequest` before any query; there is no route without a check.

### Reused unchanged
| Need | Existing route (key) | Rules |
|---|---|---|
| New / edit PR, Save and submit | `POST /api/pr/createpr`, `PATCH /api/pr/updatepr` (`pr.manage`) then `POST /api/approval/submitRequest` | BR-FF-46, 47, 56, 57 |
| Draft PO edit + submit | `PATCH /api/po/updatepo` (`po.manage`) then `submitRequest` | BR-FF-46 |
| Create PO, several suppliers | `POST /api/po/createpo` (`po.manage`), **one call per supplier**, sent in parallel by the page | BR-FF-48, 49, 58, 59 |
| Send, delay, cancel, short-close, confirm | `/api/po/:id/send` … (`po.manage`) | BR-FF-44 |
| Create GRN from the receive form | `POST /api/grn/creategrn` (`grn.edit_draft`) | BR-FF-65, 67, 69, 73 |
| Inspect | `POST /api/grn/:id/lines/:lineId/qa` (`grn.qa_decide`) | BR-FF-44 |
| Approve / reject / send back | `POST /api/approval/actOnRequest/:id` (current approver) | BR-FF-82, 84, 87 |
| Page bodies | `GET /api/pr/getprdetails/:id`, `GET /api/po/getpodetails/:id`, `GET /api/grn/getgrndetails/:id` | BR-FF-40, 43 |
| Stock list from tile 30 | `GET /api/asset/inventory/stock?belowReorder=true` (`inventory.view`) | BR-FF-30 |
| Job-work list from tile 29 | `GET /api/sco/challans/open` (`sco.view`) | BR-FF-29 |
Create PO calls are independent transactions, so one refused supplier does not undo the others (BR-FF-58):
the page reads each 4xx and shows it with that supplier's name. Atomic multi-supplier create was not added: it
would be a new write route (BR-FF-05).

## Payloads

### `GET /api/home/getcounts`
- **Query:** `tiles` optional csv of tile keys (retry one tile, BR-FF-19; max 11, enum).
- **Response 200:** `{ success, data: { today: "YYYY-MM-DD" (IST), tiles: Tile[] } }`,
  `Tile = { key, count (int >= 0), late?, today?, later? (ints, only dated tiles, sum = count), oldestSince? (ISO, tile 20 only), sentBackCount? (tile 21), error?: true }`.
  Tile keys: `approvals, my_prs_draft, my_prs_pending, prs_to_order, pos_to_send, my_pos_draft, pos_late, goods_expected, grns_to_inspect, jobwork_due, stock_low` (= tiles 20..30, BR-FF-13 order).
  A tile the caller has no key for is **absent**, not zero (BR-FF-11). A failed tile is `{ key, error: true }`; HTTP stays 200.
- No money fields (BR-FF-33). Every `count` uses the same predicate and `today` as the list filter it opens (BR-FF-02).
- **Errors:** 400 unknown tile key · 401.

### `GET /api/grn/getreceivablepos`
- **Query (pagination contract):** `page` (1), `pageSize` (default 10, max 100), `sortBy` ∈ `dueDate, poNumber, supplierName` (default `dueDate` asc, tiebreak `id`), `sortDir`, `q` (string max 100; PO number or supplier name, trigram, BR-FF-63), `poId` (int > 0; used by the receive form, BR-FF-68), `bucket` ∈ `late|today|later` (BR-FF-71, 14).
- **Rows:** `{ poId, poNumber, supplierId, supplierName, status, dueDate, isLate, lines: [{ poItemId, itemId, sku, itemName, uom, orderedQty, receivedQty, pendingQaQty, openQty }] }`. Only lines with `openQty > 0`. Quantities 3 decimals (whole for pcs / set).
- **Never returned:** `unitPricePaise`, `gstPercent`, line value, tax, totals (BR-FF-62, 06). Repository selects named columns only.
- **Filter:** PO status `dispatched` / `partial_received` and at least one line `openQty > 0` (open qty definition: `data.md` Open point 1).
- **Errors:** 400 bad query · 401 · 403 (no `grn.edit_draft`, BR-FF-01). Unknown or not-receivable `poId` → 200 with empty `data` (the form shows BR-FF-72 text).

### `GET /api/approval/getDocumentView/:docType/:docId`
- **Path:** `docType` ∈ `pr|po|sco`; `docId` int > 0.
- **Response 200:** same `data` shape as `getprdetails` / `getpodetails` / `getscodetails` for that type (header, lines with rates and amounts, totals), plus `request` (current open request, level x of N, who can act now), `trail` (rows with notes, oldest first), `canAct` (caller is the current approver and has not approved a level).
- Read-only: no mutation route is reachable from it; acting goes through `actOnRequest`.
- **Errors:** 400 bad docType · 401 · 403 not allowed to read the request (BR-APR-51; body carries no document data, BR-FF-04) · 404 no such document.

### `GET /api/document/getpanel/:docType/:docId`
- **Path:** `docType` ∈ `pr|po|grn`; `docId` int > 0.
- **Response 200:** `{ totals, approvals, linked, history }`.
  - `totals` — pr: `{ lineCount, estimatedAmountPaise }`; po: `{ subtotalPaise, taxAmountPaise, totalAmountPaise, receivedPct (0–100, by qty) }`; grn: `{ arrivedQty, acceptedQty|null, rejectedQty|null, uom }` per unit, **no money**. Money keys present only if the caller may see them (BR-FF-06).
  - `approvals` — pr, po only: live state + full trail; `null` for grn (BR-FF-52).
  - `linked[]` — `{ docType, id, number, status, canOpen }`; `canOpen = false` → shown as text (BR-FF-03); no amounts for a GRN viewer (BR-FF-55). Cancelled / closed links stay.
  - `history[]` — `{ at, byName, event, note? }` newest first, built from the sources in `data.md`; capped at 200 events.
- **Errors:** 400 · 401 · 403 (no doc key and no read rule, BR-FF-04) · 404.

## Lists
All follow the pagination contract (`page` 1, `pageSize` 10 default / 100 max, whitelist `sortBy`, PK tiebreak, `{ success, data, meta }`). The UI sends `pageSize` 25 / 50 / 100 (BR-FF-105), default 50.
New list: `getreceivablepos` (above). `getcounts`, `getDocumentView`, `getpanel` are not lists.

## Additive changes to existing routes (owner module spec named; no breaking change, defaults keep today's behaviour)
| Route | Add | Owner spec | Rules |
|---|---|---|---|
| `GET /api/pr/getprs` | filters `mine` (bool), `toOrder` (bool: approved / partial_ordered with a pending line), `bucket` (late/today/later, on earliest pending required-by, used with `toOrder`); rows `requestedByName`, `lineCount`, `earliestRequiredBy`, `sentBack` (bool); sort adds `estimatedAmountPaise`; `meta.statusCounts` already there | purchase-requisition | BR-FF-12, 21..23, 106, 109 |
| `GET /api/po/getpos` | filters `mine`, `bucket` (on due date, any status filter); rows `lineCount`, `receivedPct`; `meta.lateCount`; `overdue` switches to IST day (BR-FF-08); sort adds `dueDate`, `totalAmountPaise` | purchase-order | BR-FF-24..26, 107, 109 |
| `GET /api/po/getpodetails/:id` | each line adds `pendingQaQty`, `openQty` | purchase-order | BR-FF-43 |
| `GET /api/grn/getgrns` | filter `bucket` (received date; late = before today, with `qaStatus=pending`); rows `supplierName`, `lineCount`, `qaSummary`; `meta.statusCounts`; never money | grn | BR-FF-28, 108, 109 |
| `GET /api/sco/challans/open` | filter `bucket` (on `returnDueDate`; `late` equals `dueStatus=overdue`) | subcontracting | BR-FF-14, 29 |
| `GET /api/approval/getMyPendingApprovals` | rows `docNumber`, `requesterName`, `amountPaise`; default sort `requestedAt` asc | approval | BR-FF-80 |
| `GET /api/asset/inventory/stock` | none (filter exists) | inventory | BR-FF-30 |

## Error map (new routes; frozen routes keep their codes)
| Code | Status | Rule |
|---|---|---|
| `VALIDATION_ERROR` | 400 | bad query / path |
| `FORBIDDEN` | 403 | BR-FF-01, 04, 06, 62 |
| `NOT_FOUND` | 404 | BR-FF-04 |
Page-level messages (BR-FF-57..59, 69, 72, 84) map from frozen codes: `APPROVAL_NO_ELIGIBLE_APPROVER`,
createpo 409 (lines already on another PO), `APPROVAL_NOT_PENDING` (409), challan clash 409, PO not receivable 400.

## Choices made
| Question | Choice | Source |
|---|---|---|
| One Home endpoint or 11 calls | One `getcounts`, parallel queries, per-tile `error`, optional `tiles` filter for retry | one round trip per Home view and per badge refresh; BR-FF-19 |
| Menu badge source | Same endpoint with `tiles=approvals` (BR-FF-85 equals tile 20) | one definition of the count |
| Create PO on several suppliers | Client sends one `createpo` per supplier | BR-FF-05, A-08; no new write route |
| Receive form data | `getreceivablepos?poId=` instead of a second route | one shape for picker and form |
| Approver read access | New `getDocumentView` under `approval` rather than loosening `pr.manage` / `po.manage` on frozen routes | frozen PR / PO access rules stay |
| Side panel | One `document/getpanel` for pr / po / grn | one place applies BR-FF-03 / 06 / 55 filtering |
| Late / today / later | Shared `bucket` enum on every list that has a tile | one param, same IST rule |
| Naming | lowercase `get…` for `home` / `grn`, camelCase under `approval` | follow each module's existing casing |
| Quantity bounds | Quantities 0 < qty ≤ 9,999,999.999; strings: `q` ≤ 100 | existing PO / GRN schema limits |
