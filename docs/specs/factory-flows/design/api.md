# Factory flows — API design

> Written by solution-designer from `../spec.md` and `data.md`. Source for the run's `contract.md`.
> Conventions: `backend/.claude/reference/hono-build-conventions.md`, skills `api-endpoint-intake`,
> `pagination-contract`. Existing shapes checked with `bun run contract:query`. Pass 3 (pre-freeze fix round 1).

## Principle
BR-FF-05: no new write endpoint. Every action reuses a frozen route. Four new **read-only** routes,
plus additive fields / filters on seven existing list or detail routes (listed last, each owned by its
module's spec). Paths follow the module casing already in use (`/api/grn/getgrns`, `/api/approval/getMyPendingApprovals`).

## Endpoints
### New (all GET, read-only)
| Method | Path | Permission | Purpose | Rules |
|---|---|---|---|---|
| GET | `/api/home/getcounts` | any signed-in; each tile needs its own key **and** the key of the list it opens (SPEC-05; checked in service, tile omitted without them) | All Home tiles' counts in one call; also feeds the menu badge | BR-FF-10..33, 85 |
| GET | `/api/grn/getreceivablepos` | `grn.edit_draft` | Picker + receive-form data: receivable POs with lines, no prices | BR-FF-61..64, 66, 70, 71, 72 |
| GET | `/api/approval/getDocumentView/:docType/:docId` | any signed-in; service enforces the one read rule below (doc key, `approval.view_all`, or read-via-approval) | Read-only header + lines + amounts + notes + trail of a PR / PO / SCO for the inbox preview and the read-only page | BR-FF-53, 81, 83, 88 |
| GET | `/api/document/getpanel/:docType/:docId` | any signed-in; service: doc key (`pr.manage` / `po.manage` / `grn.view`) **or** the read-via-approval rule below (pr, po only) | Side panel: totals, approvals, linked documents, history | BR-FF-42, 50..55 |

Note for security-auditor: three routes are "any signed-in + service check", the same pattern as the
existing approval routes (a route cannot name one key when access is key **or** approver). Every one runs the
access check before any document query; there is no route without a check.

### Where the code lives (CR-08, CR-07)
| Route | Controller / service / repository | Notes |
|---|---|---|
| `/api/home/getcounts` | new `homeController` / `homeService` / `homeRepository`, `routes/home.ts` (+ `end-points.ts`, `register()` for the manifest) | owned by this feature |
| `/api/document/getpanel/...` | new `documentController` / `documentService` / `documentRepository`, `routes/document.ts` | owned by this feature; History built in the service |
| `/api/grn/getreceivablepos` | existing `grnController` / `grnService` / `grnRepository` | grn module |
| `/api/approval/getDocumentView/...` | existing `approvalController` / `approvalService`; doc bodies from the pr / po / sco repositories | approval module |
Casing: follows the module already in use. Approval keeps camelCase (`getDocumentView`); the new home / document modules and grn use lowercase (`getcounts`, `getpanel`, `getreceivablepos`).
No second copy of the approval read logic: both `getDocumentView` and `getpanel` call the **one** shared check in `approvalService` — the existing module-private `assertCanReadRequest` is exported and gets an options argument `{ viaApprovalOnly: true }` that adds the pending + current-step conditions below (existing callers pass nothing and keep today's behaviour). Trail and approvals blocks come from the existing `getCurrentApprovalByDoc` / `getApprovalHistory` service functions, not new queries. (Change listed under "Additive changes", approval module.)

### Read-via-approval rule (one rule, SEC-01; used by `getDocumentView` and `getpanel`)
A caller reads a pr / po / sco without its document key (`pr.manage` / `po.manage` / `sco.view`) only if **all** hold:
1. the **latest** approval request of this document is `pending_approval`;
2. the caller is an **active employee**;
3. the caller is on the **current step** (by role or by employee) **or** has a trail row on **this** request (already acted on a level).
The **requester** who lacks the document key reads their own document through the same route only while that latest request is `pending_approval` (BR-APR-51 requester path); once decided, withdrawn or cancelled they get 403. Holders of the document key and of `approval.view_all` are not limited by this rule.
What a via-approval reader gets: header, lines, amounts, notes, approvals + trail, linked documents, and History in which supplier-communication events (sent, reminder, escalation, confirmation) appear **by event name only, without `note` text** (SEC-05). No action other than `actOnRequest`.
SCO amounts (SEC-02): `getDocumentView` for an SCO includes line value, GST and totals **only** if the caller holds `sco.manage` or reads via approval; a `sco.view`-only caller gets the order without those keys. (Frozen `getscodetails` returns them to `sco.view` holders; this feature does not change it — see questions.)

### Access order and 403 / 404 (CR-02, CR-03, SEC-04)
1. Path validated first: `docType` enum, `docId` int 1..2147483647 (400 otherwise).
2. Access is decided **before** the document is loaded. Caller holds the doc key (or `approval.view_all`) → proceed; else look up the latest request for `(docType, docId)` and apply the rule above. No key and no read path (including "document does not exist", "no request") → **403 `FORBIDDEN`**, identical body in every case — the response does not say whether the id exists.
3. Only after access passes: document missing → 404 `NOT_FOUND`.

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
- **Query:** `tiles` optional csv of tile keys (retry one tile, BR-FF-19; max 11, enum, no duplicates). **No user id parameter** — counts are always the caller's own (SEC-03). The menu badge calls `getcounts?tiles=approvals` (one tile, one query).
- **Response 200:** `{ success, data: { today: "YYYY-MM-DD" (IST), tiles: Tile[] } }`,
  `Tile = { key, count (int >= 0), tone: "waiting"|"moving"|"neutral"|"danger", late?, today?, later? (ints, only dated tiles, sum = count), hint?: { kind, date?: ISO, n?: int }, error?: true }`.
  `hint` per tile (UI formats the text): `approvals` oldest waiting `{kind:oldest_since,date}`; `my_prs_draft` `{kind:sent_back,n}`; `my_prs_pending` `{kind:oldest_since,date}`; `prs_to_order` `{kind:earliest_required,date}` (none when no date); `pos_to_send` / `goods_expected` `{kind:earliest_due,date}`; `my_pos_draft` `{kind:sent_back,n}`; `pos_late` `{kind:oldest_due,date}`; `grns_to_inspect` `{kind:oldest_received,date}`; `jobwork_due` `{kind:earliest_due,date}`; `stock_low` `{kind:items,n}`. `hint` absent at count 0.
  `tone` (server-decided, one rule): `danger` if `late > 0`; else `waiting` for `approvals`, `my_prs_draft`, `my_pos_draft`, `prs_to_order`, `pos_to_send`, `grns_to_inspect` (work waiting on me) with count > 0; `moving` for `my_prs_pending`, `goods_expected`, `jobwork_due` with count > 0; else `neutral`. This replaces the earlier `oldestSince` / `sentBackCount` fields.
  Tile keys: `approvals, my_prs_draft, my_prs_pending, prs_to_order, pos_to_send, my_pos_draft, pos_late, goods_expected, grns_to_inspect, jobwork_due, stock_low` (= tiles 20..30, BR-FF-13 order).
  A tile the caller has no key for (its own key or its target list's key) is **absent**, not zero (BR-FF-11). Zod response schema: `tiles` is an array whose items are all optional-by-presence; a caller with no tile keys gets `tiles: []`. `getcounts` does not use the 403 / `FORBIDDEN` read rule — it omits tiles instead (CR-02). A failed tile is `{ key, error: true }`; HTTP stays 200.
- **Today and buckets** come from `src/lib/ist-day.ts` (`istDayKey()`), computed once per request and passed to every predicate (CR-06).
- **Execution (PERF-01):** one SQL per source table with `count(*) filter (where …)` per tile (+ `min` for the hint dates), so Home = at most 6 statements (approval_requests, purchase_requests, purchase_orders, grns / grn_items, sco_challans, item_master). If a statement fails, only that table's tiles return `error`. Fallback if a tile cannot share a statement: run in parallel with a concurrency cap of 4.
- `pos_late` and the PO-list Late filter use the **one** existing BR-PO-19 predicate (a shared function taking `today`); BR-FF-09 open quantity is not used for the late count (SPEC-01).
- No money fields (BR-FF-33). Every `count` uses the same predicate and `today` as the list filter it opens (BR-FF-02).
- **Errors:** 400 unknown tile key · 401.

### `GET /api/grn/getreceivablepos`
- **Query (pagination contract):** `page` (1), `pageSize` (default 10, max 100), `sortBy` ∈ `dueDate, poNumber, supplierName` (default `dueDate` asc, tiebreak `id`), `sortDir`, `q` (`searchTermSchema`, max 100; matched with `safeSearch` from `src/lib/safe-search.ts` over PO number and supplier name, BR-FF-63; no trigram index, CR-01), `poId` (int 1..2147483647; used by the receive form, BR-FF-68), `bucket` ∈ `late|today|later` (BR-FF-71, 14).
- **Response:** `{ success, data, meta: { …pagination, today: "YYYY-MM-DD" (IST) } }` — `meta.today` = `istDayKey()` (`src/lib/ist-day.ts`, CR-06), the picker's "today" (the page never uses the browser clock, BR-FF-08).
- **Rows:** `{ poId, poNumber, supplierId, supplierName, status, dueDate, isLate, lines: [{ poItemId, itemId, sku, itemName, uom, orderedQty, receivedQty, pendingQaQty, openQty }] }`. Only lines with `openQty > 0`. Quantities 3 decimals (whole for pcs / set).
- **Never returned:** `unitPricePaise`, `gstPercent`, line value, tax, totals (BR-FF-62, 06). Repository selects named columns only.
- **Filter:** PO status `dispatched` / `partial_received` and at least one line `openQty > 0` (open qty definition: `data.md` Open point 1).
- **Paging in SQL (PERF-03):** POs are filtered, sorted and paged in SQL (`dueDate` = `min` over the PO's open lines, computed by the same open-qty expression; `bucket` filters on it). The page's lines are then loaded by **one** `inArray(po_id, pageIds)` query with open qty — never per PO.
- **Errors:** 400 bad query · 401 · 403 `PERMISSION_DENIED` (route guard, body carries `key`; no `grn.edit_draft`, BR-FF-01). Unknown or not-receivable `poId` → 200 with empty `data` (the form shows BR-FF-72 text).

### `GET /api/approval/getDocumentView/:docType/:docId`
- **Path:** `docType` ∈ `pr|po|sco`; `docId` int 1..2147483647.
- **Response 200:** same `data` shape as `getprdetails` / `getpodetails` / `getscodetails` for that type (header, lines with rates and amounts, totals), with `requesterNote` = the document's own `notes` field (PR `notes`, PO `notes`, SCO `notes`; string or null, max 2000), plus `request` (current open request, level x of N, who can act now), `trail` (rows with notes, oldest first), `canAct` (caller is the current approver and has not approved a level).
- **Access (BR-FF-53, SEC-01):** the read-via-approval rule above. Via-approval readers get 200 only while the latest request is `pending_approval` (`canAct` may be false); after it is decided, withdrawn or cancelled → 403 `FORBIDDEN`. SCO amount hiding per SEC-02 above.
- Read-only: no mutation route is reachable from it; acting goes through `actOnRequest`.
- **Errors:** 400 bad docType / docId · 401 · 403 `FORBIDDEN` (service read rule, not the route guard; no document data in the body, BR-FF-04; same body whether or not the id exists) · 404 `NOT_FOUND` only after access passed.

### `GET /api/document/getpanel/:docType/:docId`
- **Path:** `docType` ∈ `pr|po|grn`; `docId` int 1..2147483647.
- **Response 200:** `{ totals, approvals, linked, history }`.
  - `totals` — pr: `{ lineCount, estimatedAmountPaise }`; po: `{ subtotalPaise, taxAmountPaise, totalAmountPaise, receivedPct (0–100, by qty) }`; grn: `{ arrivedQty, acceptedQty|null, rejectedQty|null, uom }` per unit, **no money**. Zod: every money key (`estimatedAmountPaise`, `subtotalPaise`, `taxAmountPaise`, `totalAmountPaise`) is **optional**; present only for a caller with the doc key or via approval (BR-FF-06). A GRN totals object never has money keys.
  - `approvals` — pr, po only: live state + full trail; `null` for grn (BR-FF-52).
  - `linked[]` — `{ docType, id, number, status, qaStatus?, canOpen }`; `qaStatus` (`pending|passed|failed|waived|mixed`, derived from the GRN's lines by the same `qaSummary` rule as the GRN list: BR-FF-115: pending if any line pending; else passed if all lines passed or waived; else failed if all lines failed; else mixed ("Partly accepted")) only on `grn` items; `canOpen = false` → shown as text (BR-FF-03); no amounts for a GRN viewer (BR-FF-55). Cancelled / closed links stay.
  - `history[]` — `{ at, byName, event, note? }` newest first, built from the sources in `data.md`; at most 200 events returned plus `historyTruncated: bool` (true when older events exist, the page shows "older events hidden"). For via-approval readers supplier-communication events have no `note` (SEC-05).
- **Access (BR-FF-53, SEC-01):** for pr / po the read-via-approval rule above (same shared function as `getDocumentView`). `grn` always needs `grn.view`; sco is not a panel type.
- **History cost (PERF history):** each source query is `limit 200` (ordered newest first, index-backed), the results are merged and cut to 200 after the merge; `historyTruncated` is set if any source returned 200 or the merged list exceeded 200.
- **Errors:** 400 · 401 · 403 `FORBIDDEN` (no doc key and no read path, or request no longer pending; same body whether or not the id exists, BR-FF-04, 53) · 404 `NOT_FOUND` only after access passed.

## Lists
All follow the pagination contract (`page` 1, `pageSize` 10 default / 100 max, whitelist `sortBy`, PK tiebreak, `{ success, data, meta }`). The UI sends `pageSize` 25 / 50 / 100 (BR-FF-105), default 50.
New list: `getreceivablepos` (above). `getcounts`, `getDocumentView`, `getpanel` are not lists.

## Additive changes to existing routes (owner module spec named; no breaking change, defaults keep today's behaviour)
| Route | Add | Owner spec | Rules |
|---|---|---|---|
| `GET /api/pr/getprs` | filters `mine` (bool), `toOrder` (bool: approved / partial_ordered with a pending line), `bucket` (late/today/later, on earliest pending required-by) which **requires `toOrder=true`** — `bucket` without it → 400 `VALIDATION_ERROR` by a Zod `refine` (CR-04); rows `requestedByName`, `lineCount`, `earliestRequiredBy`, `sentBack` (bool) — `lineCount` / `earliestRequiredBy` by one group-by join over the page's PR ids, `sentBack` from the latest `approval_requests` row per PR in the page (one batched query), no per-row query (PERF-04); sort adds `estimatedAmountPaise`; `meta.statusCounts` already there; new `meta.toOrderCount` = rows `toOrder=true` would return under the same other filters (the "To order" chip, BR-FF-02) | purchase-requisition | BR-FF-12, 21..23, 106, 109 |
| `GET /api/po/getpos` | filters `mine`, `bucket` (on due date, any status filter); rows `lineCount`, `receivedPct` (group-by join / batched `inArray` over the page, PERF-04); `meta.statusCounts` (per status, like PR: chips Draft = `draft`, In approval = `pending_approval`, To send = `approved`, Open = `dispatched` + `partial_received`, summed by the page) and `meta.lateCount` = rows the Late filter returns. **One named predicate "Late" (BR-PO-19, unchanged; SPEC-01)** shared by tile, `lateCount`, `overdue` and `bucket=late`; `today` is passed in from `istDayKey()`. `overdue=true` is the same as `bucket=late` (kept for frozen callers; the page sends only `bucket`); `overdue` with a different `bucket` → 400. BR-FF-09 open quantity is used only for the display fields `openQty` / `pendingQaQty`. Sort adds `dueDate`, `totalAmountPaise` | purchase-order | BR-FF-24..26, 107, 109 |
| `GET /api/pr/getprdetails/:id` | each item adds `onPoNumber` + `onPoId` (PO the line is on via `pr_po_item_links`, else null; for the "On order" link, BR-FF-43) and keeps `defaultSupplierId` / `defaultSupplierName` for every `pending` line (null if none → the line goes to the Create PO supplier dialog; BR-FF-91: supplier of the newest PO with that item, skipping cancelled POs and inactive suppliers, tie → higher PO id — stricter than today's `prRepository` lookup, which must add those two filters; BR-FF-49) and `suggestedRatePaise` (int, 0 / null = the dialog asks for a rate, SPEC-03); all from the existing `prRepository` lookups | purchase-requisition | BR-FF-43, 48, 49 |
| `GET /api/po/getpodetails/:id` | each line adds `pendingQaQty`, `openQty` (BR-FF-09) | purchase-order | BR-FF-43 |
| `GET /api/grn/getgrns` | filter `bucket` (received date; late = before today; **`bucket=late` with `qaStatus` other than `pending` → 400 `VALIDATION_ERROR`**, CR-05; `bucket=late` alone implies `qaStatus=pending`); rows `supplierName`, `lineCount`, `qaSummary` (BR-FF-115: `pending` if any line pending; else `passed` if all passed or waived; else `failed` if all failed; else `mixed` = "Partly accepted"; waived counts as passed), `poCanOpen` (caller holds `po.manage`, else the PO number is plain text, BR-FF-03); `meta.statusCounts`; never money | grn | BR-FF-28, 108, 109 |
| `GET /api/sco/challans/open` | filter `bucket` (on `returnDueDate`; `bucket=late` is the same as `dueStatus=overdue`, CR-05; `bucket=late` with `dueStatus` other than `overdue` → 400) | subcontracting | BR-FF-14, 29 |
| `GET /api/approval/getMyPendingApprovals` | rows `docNumber`, `requesterName`, `amountPaise` (**only when the target employee is the caller** — i.e. `employeeId` absent or equal to the caller; for `view_others_pending` views `amountPaise` is omitted, consistent with BR-FF-53); filter `docType` (exists) drives the Requisition / Order / Job work quick filter (DES-004, BR-FF-79); `meta.typeCounts {pr, po, sco}` counted server-side over the whole filter, not the page (BR-FF-02); default sort `requestedAt` asc, tiebreak `id`; `pageSize` max 100; doc number / requester / amount looked up **batched per docType** with one `inArray` each, never per row (PERF-05) | approval | BR-FF-80 |
| `GET /api/asset/inventory/stock` | none (filter exists) | inventory | BR-FF-30 |
| `approvalService` (no route) | export `assertCanReadRequest` with options `{ viaApprovalOnly }` (CR-07); existing callers unchanged | approval | BR-FF-53 |

## Error map (new routes; frozen routes keep their codes)
| Code | Status | Where | Rule |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | bad query / path; `bucket` without `toOrder`; `overdue` ≠ `bucket`; `bucket=late` with `qaStatus≠pending` / `dueStatus≠overdue`; unknown tile | CR-04, 05 |
| `PERMISSION_DENIED` | 403 | **route guard** (`requirePermission`), body carries `key` — `getreceivablepos` | BR-FF-01, 62 |
| `FORBIDDEN` | 403 | **service read rule** — `getDocumentView`, `getpanel` only; same body for "no access" and "id does not exist" | BR-FF-04, 06, 53 |
| `NOT_FOUND` | 404 | only after access passed | BR-FF-04 |
`getcounts` never returns 403: it omits tiles. Page-level messages (BR-FF-57..59, 69, 72, 84) map from frozen codes: `APPROVAL_NO_ELIGIBLE_APPROVER`,
createpo 409 (lines already on another PR), `APPROVAL_NOT_PENDING` (409), challan clash 409, PO not receivable 400.

## Performance notes
- `getcounts`: ≤ 6 statements (above). Menu badge = `tiles=approvals`.
- PO list with `bucket` and no status filter scans the open-status PO set (hundreds of rows at plant scale): accepted risk (PERF-06), no extra index; the GRN `bucket` uses new `idx_grns_received_date` (see data.md).

## Choices made
Moved to `../assumptions.md` (A-45..A-53; pre-freeze round 1: A-56, A-59, A-62, A-63, A-67, A-81, A-82).
| Question | Choice | Source |
|---|---|---|
