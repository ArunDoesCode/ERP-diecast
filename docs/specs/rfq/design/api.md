# RFQ, quotes, award and rate contracts — API design

> Written by solution-designer from `../spec.md` and `data.md`. Source for the run's `contract.md`.
> Conventions: `backend/.claude/reference/hono-build-conventions.md`, skills `api-endpoint-intake`,
> `pagination-contract`. Style follows `sco` / `po` routers (verbs in path, id in path or body).
> Bases: `/api/rfq` (RFQ + quotes), `/api/rate-contract`. Response `{ success, data }`; lists add `meta`.
> Shared bounds (api-standards): reason 3–500; notes 0–2000; `q` ≤ 100; qty > 0, ≤ 1,000,000,000, 3 decimals;
> paise integer, 1 ≤ rate ≤ 1,000,000,000,000; ids positive integers; ≤ 500 lines per document.

## Endpoints
| Method | Path | Permission key | Purpose | Rules |
|---|---|---|---|---|
| GET | `/api/rfq/pr-lines` | `rfq.manage` | Pick list: `pending` lines of approved / partial_ordered PRs, with `onOpenRfq` flag | 01, 02 |
| GET | `/api/rfq/getrfqs` | `rfq.view` | List | 05, 36 |
| GET | `/api/rfq/getrfqdetails/:id` | `rfq.view` | Header, suppliers, lines (+ award, PO number / status, PR-line-cancelled flag, contract rate per supplier), quote headers (cancelled as headers only; lines via `quotes/:quoteId`) | 10, 11, 31, 33 |
| POST | `/api/rfq/createrfq` | `rfq.manage` | Draft from PR lines + suppliers | 01–05 |
| PATCH | `/api/rfq/updaterfq` | `rfq.manage` | Draft edit (id in body) | 06 |
| POST | `/api/rfq/:id/send` | `rfq.manage` | `draft → sent` | 07, 09 |
| POST | `/api/rfq/:id/cancel` | `rfq.manage` | Cancel, `{reason}` | 36, 37 |
| POST | `/api/rfq/:id/close` | `rfq.manage` | Close, `{reason}` | 35, 37 |
| GET | `/api/rfq/:id/print` | `rfq.view` | Print data: one sheet per supplier, no rates, no other supplier | 08 |
| GET | `/api/rfq/quotes/:quoteId` | `rfq.view` | One quote with lines | 15, 16 |
| POST | `/api/rfq/:id/quotes` | `rfq.manage` | Enter quote (draft) for a supplier | 12–17 |
| PATCH | `/api/rfq/quotes/:quoteId` | `rfq.manage` | Edit a draft quote (replace its lines) | 14–16, 18 |
| POST | `/api/rfq/quotes/:quoteId/submit` | `rfq.manage` | `draft → submitted` | 17, 18 |
| POST | `/api/rfq/quotes/:quoteId/cancel` | `rfq.manage` | Cancel, `{reason}` | 19 |
| GET | `/api/rfq/:id/comparison` | `rfq.view` | Grid: lines × suppliers, lowest flag, last PO rate, contract rate | 20–24 |
| POST | `/api/rfq/:id/award` | `rfq.award` (+ `po.manage`, route guard) | Award lines and make the draft POs in one transaction | 25–34 |
| GET | `/api/rate-contract/getcontracts` | `contract.view` | List | 47, 49 |
| GET | `/api/rate-contract/getcontractdetails/:id` | `contract.view` | Header + lines + ordered / received / % ordered + POs | 49 |
| POST | `/api/rate-contract/createcontract` | `contract.manage` | Draft | 40–43 |
| PATCH | `/api/rate-contract/updatecontract` | `contract.manage` | Draft edit (id in body) | 44 |
| POST | `/api/rate-contract/:id/activate` | `contract.manage` | `draft → active` | 45, 46 |
| POST | `/api/rate-contract/:id/terminate` | `contract.manage` | `{reason, terminatedOn?}` | 48 |
| POST | `/api/rate-contract/:id/cancel` | `contract.manage` | Draft only, `{reason}` | 44 |

Every route: `requireAuth` then `requirePermission(key)`; no role names. Award chains two guards,
`requirePermission("rfq.award")` then `requirePermission("po.manage")`. Keys checked inside services, not route keys: `contract.override_rate` (PO line), `rfq.award` (cancel of a submitted quote after send).

**Reused, not new.** PO create / edit: `POST /api/po/createpo`, `PATCH /api/po/updatepo` (changes below). Quote-line and contract-line reads in `getpodetails` follow the same visibility rule (`po.manage` or `contract.view`, BR-RFQ-56). PO submit and
approve: `POST /api/approval/submitRequest`, `actOnRequest` (checks added). Rate prefill:
`GET /api/asset/items/:itemId/last-rate` (adds source `contract`). Company letterhead for the print sheet:
`GET /api/company/settings`. PO cancel stays `DELETE /api/po/deletepo/:id` (BR-RFQ-33 needs nothing new).

## Payloads
### `POST /api/rfq/createrfq`
- **Request:** `{ dueDate: "YYYY-MM-DD", notes?: string(≤2000), supplierIds: int[1..10] unique, prItemIds: int[1..500] unique }`.
  No qty, uom or item in the body (03); server copies them.
- **201:** `{ id, rfqNumber, status:"draft", dueDate, suppliers[], lines[{id, prItemId, itemId, qty, uom, lineStatus}] }`
- **Errors:** 400 `RFQ_LINE_NOT_PENDING`, `SUPPLIER_INACTIVE`, `RFQ_DUE_DATE_PAST`, `RFQ_SUPPLIER_LIMIT` (0 or 11), `RFQ_DUPLICATE_ID` (duplicate supplier / PR line) · 401 · 403 · 404 PR line / supplier · 409 `PR_LINE_ON_OPEN_RFQ` (also raised if the partial unique index fires, 23505).
### `PATCH /api/rfq/updaterfq`
- **Request:** `{ id, dueDate?, notes?, addSupplierIds?, removeSupplierIds?, addPrItemIds?, removePrItemIds? }` at least one field.
- **Errors:** 409 `RFQ_NOT_EDITABLE` (not draft, re-checked under lock) · 400 `RFQ_EMPTY` (leaving 0 lines or 0 suppliers); others as create.
### `POST /:id/send` · `/cancel` · `/close`
- **Request:** send `{}`; cancel / close `{ reason: string(3–500) }`. **200:** the RFQ header.
- **Errors:** send 409 `RFQ_LINE_STALE` / `SUPPLIER_INACTIVE_STALE` naming the id in `details` (09; create-time bad input keeps the 400 codes above, one status per code); 409 `RFQ_INVALID_STATUS`
  (wrong status, includes sending twice, 07; final RFQ, 37); cancel 409 `RFQ_HAS_AWARD` (36).
### `GET /:id/print`
- Allowed from `sent` onward (`sent`, `partially_awarded`, `awarded`, `closed`); `draft` / `cancelled` → 409 `RFQ_INVALID_STATUS`. **200:** `{ rfqNumber, dueDate, company, sheets:[{ supplier:{id,name,address,gstin}, lines:[{itemCode,itemName,qty,uom}] }] }`.
  A sheet carries only its own supplier, no rate and no RFQ notes (08). `company` null when settings are not saved (no 400, not a statutory document).
### `POST /api/rfq/:id/quotes`  and  `PATCH /api/rfq/quotes/:quoteId`
- **Request:** `{ supplierId, supplierQuoteRef: string(1–100), quoteDate, validTill, paymentTermsDays?: int(0–365),
  lines: [{ rfqItemId, isQuoted: boolean, ratePaise?: int(≥1), gstPercent?: slab, leadDays?: int(0–365), freightPaise?: int(≥0) }] }`
  — one entry per RFQ line (missing line = not quoted). PATCH has no `supplierId`. No value, tax or landed field is accepted (16).
- **201 / 200:** quote with lines and computed `lineValuePaise`, `lineTaxPaise`, `landedRatePaise`.
- **Errors:** 409 `RFQ_INVALID_STATUS` (RFQ not sent / partially_awarded, checked under the RFQ lock, 12) · 400 `SUPPLIER_NOT_ON_RFQ` · 409 `QUOTE_EXISTS` (13) ·
  400 `QUOTE_LINE_INVALID` (`rfqItemId` not on this quote's RFQ, duplicate, `isQuoted:true` without a rate, rate 0, non-slab GST) · 400 `QUOTE_DATES_INVALID` (`validTill < quoteDate`, future `quoteDate`) · 400 `AMOUNT_TOO_LARGE` (freight > 1e12 or line value > 1e15 paise) · 409 `QUOTE_NOT_EDITABLE` (submitted / cancelled, 18). Every quote change re-reads the RFQ status under the RFQ lock.
### `POST /quotes/:quoteId/submit` — `{}`; 400 `QUOTE_EMPTY` (18); 409 `QUOTE_NOT_EDITABLE`; sets `isLate` (17).
### `POST /quotes/:quoteId/cancel` — `{ reason }`; 409 `QUOTE_AWARDED` (19), 409 `QUOTE_INVALID_STATUS` if already cancelled / not_awarded; cancelling a *submitted* quote on a sent RFQ also needs `rfq.award` (403 `PERMISSION_DENIED`, body `key`); RFQ final → 409 `RFQ_INVALID_STATUS`.
### `GET /:id/comparison`
- **200:** `{ rfq, suppliers[], rows:[{ rfqItemId, itemId, qty, uom, lineStatus, prLineCancelled, lastPoRatePaise, contract:[{supplierId, contractNumber, ratePaise}],
  cells:[{ supplierId, quoteId, state:"priced|not_quoted|no_quote|expired|inactive", ratePaise, gstPercent, freightPaise, landedRatePaise, leadDays, validTill, paymentTermsDays, isLate, isLowest, eligible }] }] }`.
  Draft and cancelled quotes give `no_quote` (24); `cancelledQuotes:[{quoteId,quoteNumber,supplierId,cancelledBy,cancelledAt,cancelReason}]` lists them as headers. `lastPoRatePaise` and `contract[]` are returned only to callers with `po.manage` or `contract.view`, else omitted. Lowest = min landed among `eligible`, ties by lead days then `submittedAt` (21–23). Computed on read; nothing stored.
### `POST /api/rfq/:id/award`
- **Request:** `{ lines: [{ rfqItemId, quoteItemId, reason?: string(3–500) }] }` 1..500, each `rfqItemId` once; `quoteItemId` must belong to that line.
- **201:** `{ rfq:{id,status}, pos:[{ poId, poNumber, supplierId, lineCount }], awards:[{ rfqItemId, poId, poNumber, poItemId, ratePaise, source:"contract|quote" }] }`
- **Errors:** 400 `AWARD_REASON_REQUIRED` (27) · 409 `QUOTE_EXPIRED`, `SUPPLIER_INACTIVE_STALE` (26), `RFQ_LINE_AWARDED` (25) ·
  409 `RFQ_LINE_STALE` (PR line no longer pending, 11, 32) · 400 `QUOTE_LINE_INVALID` (`quoteItemId` not on that line, not quoted, quote draft / cancelled) · 409 `RFQ_INVALID_STATUS` · 409 `CONTRACT_QTY_EXCEEDED` (29, 52) · 403 `PERMISSION_DENIED` (either key, 70) · 404.
  Whole save fails together (32). When the RFQ becomes awarded, closed or cancelled, its draft quotes are set `cancelled` (system reason) and submitted ones without an award `not_awarded` (34).
### Contracts
- **create / update:** `{ supplierId, validFrom, validTo, allowancePercent?: number(0–20, 2 dec), notes?, lines:[{ itemId, ratePaise:int(≥1), gstPercent: slab, agreedQty?: number(>0, ≤1e9, 3 dec) | null }] }` (1–500 lines, item once, item active). Update sends `id`.
  400 `CONTRACT_DATES_INVALID` (no `validTo`, to < from), `CONTRACT_LINE_INVALID` (bad rate / GST / qty, duplicate item, inactive item) (40, 41); 409 `CONTRACT_NOT_EDITABLE` (44).
- **activate:** `{}`; 400 `CONTRACT_DATES_INVALID` (`validTo` before today, 45); 409 `CONTRACT_OVERLAP` with the clashing `contractNumber` in `details` (46); 409 `CONTRACT_INVALID_STATUS`.
- **terminate:** `{ reason(3–500), terminatedOn?: date }` default today (IST), allowed today..`validTo`, else 400 `CONTRACT_DATES_INVALID`; only `active` and not expired, else 409 `CONTRACT_INVALID_STATUS` (48).
- **cancel:** `{ reason }`; draft only, else 409 `CONTRACT_NOT_EDITABLE` (44).
- **details 200:** header + `status` (stored) + `effectiveStatus` (`expired` when computed) + lines `{ agreedQty, orderedQty, receivedQty, percentOrdered|null, capQty|null }` (49).

## Changes to the frozen PO module (list for the change request; spec `purchase-order`)
| Where | Change | Rule |
|---|---|---|
| `POST createpo` / `PATCH updatepo` lines | new optional `rateOverrideReason: string(3–500)`. `quoteItemId` is **not** accepted here (set only by award). Server resolves contract per line: supplier + item + PO date (IST today) → `contract_item_id`, rate, GST %, `contract_rate_paise` | 50 |
| same | contract-linked line: GST % and uom always come from the contract (a different value → 400 `CONTRACT_LINE_LOCKED_FIELD`; never overridable); only the rate can be overridden. Rate ≠ contract rate: caller must hold `contract.override_rate` else 403 `PERMISSION_DENIED` (body `key`); reason missing → 400 `OVERRIDE_REASON_REQUIRED`; stored with by / at | 51 |
| same | PR line on an open RFQ → 409 `PR_LINE_ON_OPEN_RFQ` (checked in `assertLinesAreDraftable` and again under the PR line lock) | 02 |
| same | contract cap check, lock contract lines id asc → 409 `CONTRACT_QTY_EXCEEDED` (`details`: agreed, ordered, cap) | 52 |
| `updatepo` on a linked line | server re-resolves; contract no longer active on the PO date → link and snapshot dropped, normal suggestion applies | 54 |
| approval `submitRequest` (docType po) | linked contract not active → 409 `CONTRACT_NOT_ACTIVE`; cap re-check → 409 `CONTRACT_QTY_EXCEEDED` | 52, 54 |
| approval last-level approve | cap re-check under lock; no counter to write (ordered qty is computed) | 52, 53 |
| `getpodetails` lines | add `contractItemId`, `contractNumber`, `contractRatePaise`, `quoteItemId`, `quoteNumber`, `rateSource`, override fields | 31, 50, 51 |
| `GET asset/items/:itemId/last-rate` | new optional query `supplierId` (exists) + `onDate`; source `contract` (+ `contractItemId`, `gstPercent`) wins over `po_history`; returned only when the caller holds `po.manage` or `contract.view`. Frontend label "Contract" (BR-PO-25, BR-INV-30) | 50 |
| `poService` | the body of `createWithItems` becomes `createDraftInTx(tx, actor, input)` (shared); `createpo` opens its own tx, award calls it inside the award tx. Input adds `quoteItemId` per line, internal only | 28 |
All new codes in `src/lib/errors.ts` (one status per code):
- PO side: 409 `PR_LINE_ON_OPEN_RFQ`, `CONTRACT_QTY_EXCEEDED`, `CONTRACT_NOT_ACTIVE`; 400 `OVERRIDE_REASON_REQUIRED`, `CONTRACT_LINE_LOCKED_FIELD`.
- RFQ 400: `RFQ_LINE_NOT_PENDING`, `RFQ_DUE_DATE_PAST`, `RFQ_SUPPLIER_LIMIT`, `RFQ_DUPLICATE_ID`, `RFQ_EMPTY`, `SUPPLIER_NOT_ON_RFQ`, `QUOTE_LINE_INVALID`, `QUOTE_DATES_INVALID`, `QUOTE_EMPTY`, `AMOUNT_TOO_LARGE`, `AWARD_REASON_REQUIRED`; reused `SUPPLIER_INACTIVE`.
- RFQ 409: `RFQ_NOT_EDITABLE`, `RFQ_INVALID_STATUS`, `RFQ_HAS_AWARD`, `RFQ_LINE_AWARDED`, `RFQ_LINE_STALE`, `SUPPLIER_INACTIVE_STALE`, `QUOTE_EXISTS`, `QUOTE_AWARDED`, `QUOTE_EXPIRED`, `QUOTE_NOT_EDITABLE`, `QUOTE_INVALID_STATUS`.
- Contract: 400 `CONTRACT_DATES_INVALID`, `CONTRACT_LINE_INVALID`; 409 `CONTRACT_NOT_EDITABLE`, `CONTRACT_INVALID_STATUS`, `CONTRACT_OVERLAP`.

## Build notes
- Constants first in `end-points.ts` (`END_POINTS.rfq`, `END_POINTS.rateContract`); register static paths (`pr-lines`, `getrfqs`, `quotes/:quoteId`) before `/:id` routes.
- Comparison: batched, 3 loads (RFQ lines, quotes + items, suppliers) + one `inArray` contract lookup + one `DISTINCT ON (item_id)` last-PO-rate query (uses `idx_po_items_item_id`, exists). No per-cell queries.
- Award: build all request shapes (quote lines, contract lookups, PO line inputs) before the transaction; inside it lock RFQ → quotes → PR header → PR lines (id asc) → contract lines (id asc), allocate PO numbers last, just before the insert.
- Lists: per-row counts (`quotedCount`, `lineCount`, `itemCount`, `orderedPercent`) by one `group by` over the page's ids; `pr-lines` `onOpenRfq` / `openRfq*` by left join on `rfq_items` with `line_status='open'`.
- Advisory lock at contract activation: `pg_advisory_xact_lock(RFQ_CONTRACT_LOCK_NS, supplierId)` (two-key form, namespace constant in `src/lib/`).

- Award key: descriptor `auth: { type: "permission", key: "rfq.award" }` only; `requirePermission("po.manage")` is a second route-level guard the registry cannot express. Red tests: `rfq.award` only → 403 with `key: "po.manage"`; `po.manage` only → 403 with `key: "rfq.award"`.
- Errors with details: `throw new AppError(msg, 409, CODE, details)` for `RFQ_LINE_STALE`, `SUPPLIER_INACTIVE_STALE`, `CONTRACT_OVERLAP`, `CONTRACT_QTY_EXCEEDED`. Unnamed 404s use the default `NOT_FOUND`.
- Schema: cross-file FKs (to `purchase_order_items`, `purchase_request_items`, `item_master`, `supplier_master`) use lazy `() => table` references.

## Lists
| List | Filters | Sort whitelist (default) | Search `q` |
|---|---|---|---|
| `getrfqs` (rows add `supplierCount`, `quotedCount` = suppliers with a live submitted quote, `lineCount`) | `status` (enum), `supplierId` (RFQs sent to), `from` / `to` (created, IST days, inclusive) | `id, rfqNumber, dueDate, createdAt, status` (`createdAt desc`) | `rfqNumber`, `notes` |
| `getcontracts` (rows add `itemCount`, `orderedPercent` = ordered ÷ agreed over lines with agreed qty, null if all rate-only) | `status` (`draft, active, expired, terminated, cancelled`; `expired` = computed), `supplierId`, `itemId`, `endsWithinDays` (int 1–365; 30 = the screen filter) | `id, contractNumber, validFrom, validTo, createdAt, status` (`validTo asc` for `endsWithinDays`, else `createdAt desc`) | `contractNumber` |
| `pr-lines` (rows add `openRfqId`, `openRfqNumber`, null when not on an open RFQ) | `prId`, `itemId`, `onOpenRfq` (bool) | `prNumber, itemId, expectedDate, id` (`id asc`) | `prNumber` |
`page` 1 default, `pageSize` 10 default, max 100; every sort adds `id` tiebreak; escape `%`, `_`, `\` (`escapeLike`); `q` ≥ 2 chars after trim.

## Choices made
Moved to `../assumptions.md` (A-07, A-09, A-12..A-18, A-25, A-30) by spec-analyst, 2026-11-20.
| Question | Choice | Source |
|---|---|---|
