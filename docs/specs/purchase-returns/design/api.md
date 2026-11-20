# Purchase returns — API design

> Written by solution-designer from `../spec.md` and `data.md`. Conventions: `hono-build-conventions.md`, skills
> `api-endpoint-intake`, `pagination-contract`. Paths follow the GRN style (`/api/<module>/<verb><noun>`); constants go
> in `src/routes/end-points.ts` (`END_POINTS.purchaseReturn`). Money = integer paise, qty ≤ 3 decimals.

## Endpoints
| Method | Path | Permission key | Purpose | Rules |
|---|---|---|---|---|
| GET | `/api/purchase-return/getreturns` | `purchase_return.view` | list, paginated | BR-PRT-39 |
| GET | `/api/purchase-return/awaiting` | `purchase_return.view` | "Awaiting return" GRN lines, paginated | BR-PRT-39 |
| GET | `/api/purchase-return/getreturndetails/:id` | `purchase_return.view` | header, lines, debit note, events, post preview; also the data for both prints | BR-PRT-33, 35, 38, 40, 41 |
| GET | `/api/purchase-return/prefill/:grnId` | `purchase_return.edit_draft` | suggested draft for "Return to supplier"; writes nothing | BR-PRT-36 |
| POST | `/api/purchase-return/createreturn` | `purchase_return.edit_draft` | create draft | BR-PRT-01..09, 23 |
| PATCH | `/api/purchase-return/updatereturn` | `purchase_return.edit_draft` | edit draft (id in body) | BR-PRT-07, 10 |
| POST | `/api/purchase-return/:id/cancel-draft` | `purchase_return.edit_draft` | cancel a draft | BR-PRT-11 |
| POST | `/api/purchase-return/:id/post` | `purchase_return.post` | post: stock out, debit note, counters | BR-PRT-12..24, 29..34 |
| POST | `/api/purchase-return/:id/cancel` | `purchase_return.cancel_posted` | cancel a posted return with reason | BR-PRT-25..28 |

No new print endpoints: debit note and return challan are print views of `getreturndetails` (see Choices). Register
`/awaiting` and `/prefill/:grnId` before `/:id/...` routes. Every route: `requirePermission("<key>")` + registry
`auth: {type:"permission"}`. Existing endpoints reused: none fit; GRN list/details and PO details get extra fields (below).

## Payloads

### Shared line input (create / update)
`{ grnItemId: int > 0, source: "rejected"|"accepted", qty: number (> 0, ≤ 1,000,000,000, ≤ 3 decimals; whole number if the line unit is a whole-number unit, same `WHOLE_NUMBER_UNITS` as GRN) }`.
Lines: 1–100 per return. Rate, GST %, item, unit, heat no. are never accepted (strict schema; extra key → 400) — BR-PRT-09.

### `POST /createreturn`
- **Request:** `{ grnId: int, reason: string (3–500, trimmed), vendorReturnRef?: string (≤100), transporter?: string (≤100), vehicleNo?: string (≤20), remarks?: string (≤500), replacementExpected?: boolean (default false), lines: Line[] }`
- **Response 201:** `{ id, proNumber, status: "draft" }`
- **Errors:** 400 `PRT_GRN_MISMATCH` line not of this GRN / GRN has no PO (BR-PRT-01) · 400 `PRT_QA_PENDING` line QA pending (BR-PRT-02) · 400 `PRT_DUPLICATE_LINE` same line+source twice (BR-PRT-03) · 400 validation qty/reason (BR-PRT-04, 08) · 400 `PRT_CAP_EXCEEDED` with `details: {grnItemId, source, cap, reserved}` (BR-PRT-05, 06) · 401 · 403 · 404 GRN not found.

### `PATCH /updatereturn`
- **Request:** `{ id: int, reason?, vendorReturnRef?, transporter?, vehicleNo?, remarks?, replacementExpected?, lines?: Line[] }` (same bounds; `lines`, if sent, replaces all lines, ≥ 1; GRN cannot change).
- Takes the GRN header lock first (BR-PRT-13 order), then re-checks the status under it. **Response 200:** `{ id, proNumber, status }`. Client-sent rate / GST % / item / unit / heat no. → 400 (strict schema). **Errors:** 409 `PRT_NOT_EDITABLE` not draft (BR-PRT-10) · 400 no lines left (BR-PRT-10) · same 400s as create (BR-PRT-07) · 404.

### `POST /:id/cancel-draft`
- **Request:** empty body allowed (`.json().catch`). Takes the GRN header lock first (BR-PRT-13), re-checks draft under it. **Response 200:** `{ id, status: "cancelled" }`. **Errors:** 409 `PRT_NOT_EDITABLE` if not draft (BR-PRT-11) · 404.

### `POST /:id/post`
- **Request:** empty body allowed (`replacementExpected` is already on the draft, so preview and post agree).
- **Response 200:** `{ id, status: "posted", debitNoteId, dnNumber, challanNumber, totalPaise, ledgerRowIds: int[] }`
- **Errors:** 409 `PRT_NOT_EDITABLE` already posted/cancelled — the loser of a race too (BR-PRT-13) · 409 `PRT_CAP_EXCEEDED` caps re-checked under lock (BR-PRT-07) · 409 `INSUFFICIENT_STOCK` (`postStock` throws `ConflictError(msg, "INSUFFICIENT_STOCK")` when `blockNegative` is set; GRN and SCO callers get the same code; BR-PRT-16) · 409 `PRT_REPLACEMENT_PO_CLOSED` replacement on invoiced/closed PO (BR-PRT-22) · 400 `PRT_HSN_MISSING` with item ids (BR-PRT-34) · 400 `PRT_COMPANY_SETTINGS_MISSING` plant GSTIN/state missing (BR-PRT-34) · 400 `AMOUNT_TOO_LARGE` (BR-PRT-18) · 500 `DOCUMENT_SEQUENCE_ALLOC_FAILED` rolls everything back (BR-PRT-12) · 404.
- Posting any PO status is allowed (BR-PRT-24): there is no PO-status error except the replacement one.

### `POST /:id/cancel`
- **Request:** `{ reason: string (3–500, trimmed) }` · **Response 200:** `{ id, status: "cancelled", debitNoteStatus: "cancelled" }`
- **Errors:** 400 reason missing/short (BR-PRT-25) · 409 `PRT_NOT_POSTED` draft or already cancelled (BR-PRT-25) · 409 `PRT_REPLACEMENT_PO_CLOSED` (BR-PRT-27) · 409 `PRT_OVER_RECEIPT` cancelling a replacement return would put PO received qty above ordered (BR-PRT-27) · 404.

### `GET /prefill/:grnId`
- **Response 200:** `{ grnId, grnNumber, poId, supplierId, supplierName, poNumber, replacementExpected: false, lines: [{ grnItemId, itemId, itemName, uom, batchNumber, ratePaise, gstPercent, rejectedQty, rejectedReserved, rejectedReturnable, acceptedNet, acceptedReserved, acceptedReturnable, suggested: [{source:"rejected", qty}] }], mainAction: "prefilled" | "secondary" | "none" }`
- `ratePaise` = PO line rate (paise, no GST) and `gstPercent` = PO line GST %, read-only, so the form shows taxable value, GST and total live (same maths as BR-PRT-31; the server recomputes at post).
- `suggested` = the returnable rejected qty per line (BR-PRT-36); `mainAction`: `prefilled` if any rejected returnable > 0, `secondary` if only accepted, else `none`. Only QA-decided lines are listed. 400 `PRT_GRN_MISMATCH` for a GRN without a PO; 404 GRN. The edit form calls prefill too (returnable caps), and details carries the same cap fields per line (`rejectedReturnable`, `acceptedReturnable`).

### `GET /getreturndetails/:id`
- **Response 200:** header (all `purchase_returns` fields incl. `challanNumber`, supplier, GRN no. + supplier challan no., PO no.), `lines` (item, HSN, heat, source, qty, unit, rate, GST %, taxable, GST, CGST/SGST/IGST, ledger ids), `documentFlow: [{step:"po"|"grn"|"return", docNo, id, status}]` (PO → GRN → Return), `debitNote` (null in draft: number, date, status, totals, plant and supplier snapshot, `supplierBill` (the single bill linked by `supplier_invoice_id`, or null: `{id, invoiceNumber, invoiceDate}`), `billOffsetPaise`), `events` (action, from → to, reason, who, when), and for drafts `preview: { stockOut: [{itemId, qty, uom}], debitNoteTotalPaise, poEffect: "credit_only"|"replacement" }` computed by the same pure function post uses (BR-PRT-40; the server stays the judge). 404.

## Lists

### `GET /getreturns`
Query: `page` (1), `pageSize` (10, max 100), `sortBy` enum `id | proNumber | createdAt | status` (default `id`), `sortDir` (default `desc`), filters `status` (enum), `supplierId` (int), `grnId` (int), `poId` (int), `dateFrom` / `dateTo` (ISO date, IST day, on `created_at`; from ≤ to else 400), `q` (≤ 100, ilike on pro_number, trigram index). Row: id, proNumber, status, grnNumber, poNumber, supplier name, lines count, `totalPaise` (debit note total or null), createdAt. `meta` adds `statusCounts: {draft, posted, cancelled}` and `awaitingCount`. Lines count and debit note total come from one grouped batch query / one join for the page (PERF-001), not per row.
### `GET /awaiting`
Query: `page`, `pageSize`, `sortBy` enum `grnId | grnNumber | receivedDate` (default `grnId`), `sortDir` (default `asc`), filter `supplierId` only. Row = GRN line with `rejectedQty − rejectedReserved > 0` (reserved from non-cancelled returns): grnId, grnNumber, grnItemId, item, heat, rejectedQty, rejectedReserved, awaitingQty, receivedDate, supplier, uom. Uses the partial index on `grn_items`; the rows, the count and `awaitingCount` share one predicate with a grouped reserved sum over `purchase_return_items` (PERF-002).
PK tiebreaker on every sort (pagination-contract); two queries (rows + count) in `Promise.all`.

## Changes to other modules' endpoints (spec owners named)
| Endpoint | Change | Owner spec |
|---|---|---|
| `GET /api/grn/getgrndetails/:id` | per line `rejectedReturnedQty`, `acceptedReturnedQty`; `returns: [{id, proNumber, status}]` in the document flow (BR-PRT-38) | grn |
| `POST /api/grn/:id/lines/:lineId/correction` | 400 `GRN_CORRECTION_BELOW_RETURNED` (corrections sum rounded to 3 dp before the compare) when accepted − corrections − qty < line's accepted reserved by non-cancelled returns (BR-PRT-42); take the line lock already used | grn |
| `GET /api/po/getpodetails/:id` (path as in manifest) | per line `returnedQty`; `returns` list (BR-PRT-38) | purchase-order |
| `GET /api/grn/getgrns` | none (the "Return to supplier" button uses `prefill`) | — |
| supplier bill match | billable qty reads `accepted_returned_qty` (BR-PRT-43); post links the oldest approved bill covering the returned GRN lines (lookup by `supplier_invoice_lines.grn_item_id`, which needs an index there); a bill approved later links its unlinked debit notes (supplier-invoice side, `purchase_debit_notes.supplier_invoice_id`) | supplier-invoice |
New permission keys in `backend/src/lib/permissions.ts`: `purchase_return.view`, `.edit_draft`, `.post`, `.cancel_posted`; seed roles per spec; sidebar `purchase-returns` entry on `purchase_return.view`.

## Service exposed to other modules
`returnedQtyByGrnItem(grnItemIds: number[], tx?)` in `purchaseReturnService` returns `Map<grnItemId, { rejectedReturned, acceptedReturned }>` (posted counters, numeric 3 decimals), read-only, for supplier-invoice (BR-PRT-43).

## Choices made
Moved to `../assumptions.md` (A-23..A-32) by spec-analyst, pass 2.
| Question | Choice | Source |
|---|---|---|
