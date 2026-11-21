# Supplier invoice — API design

> Written by solution-designer from `../spec.md` and `data.md`. Source for the run's `contract.md`.
> Conventions: `backend/.claude/reference/hono-build-conventions.md`, skills `api-endpoint-intake`,
> `pagination-contract`. Path style follows `/api/po` (`getpos`, `createpo`, `/:id/<action>`). Max 150 lines.
> Intake answers: resource = `supplier_invoices` (owner: this module); route group `/api/supplier-invoice`; ids in
> the path; no one-of selectors; success wrapper `{ success, data, meta? }`; PATCH needs ≥ 1 field.

## Endpoints
| Method | Path | Permission key | Purpose | Rules |
|---|---|---|---|---|
| GET | `/api/supplier-invoice/getsupplierinvoices` | `invoice.view` (alsoKeys: `invoice.manage`) | list + chip counts | 37 |
| GET | `/api/supplier-invoice/getsupplierinvoicedetails/:id` | `invoice.view` (alsoKeys: `invoice.manage`) | detail, lines, mismatches, history, document flow, debit notes | 35, 39, 31 |
| GET | `/api/supplier-invoice/getbillablelines` | `invoice.manage` | billable GRN lines of a PO / GRN, prefilled at PO rate and GST | 02, 03, 04, 38 |
| POST | `/api/supplier-invoice/createsupplierinvoice` | `invoice.manage` | create draft | 01–12, 13–17 |
| PATCH | `/api/supplier-invoice/updatesupplierinvoice` | `invoice.manage` | edit draft (id in body) | 11 |
| DELETE | `/api/supplier-invoice/deletesupplierinvoice/:id` | `invoice.manage` | delete draft | 11, 35 |
| POST | `/api/supplier-invoice/:id/submit` | `invoice.manage` | run the match → approved or blocked | 18, 19–23, 40, 41, 29 |
| POST | `/api/supplier-invoice/:id/back-to-draft` | `invoice.manage` | blocked → draft | 24 |
| POST | `/api/supplier-invoice/:id/release` | `invoice.release` | blocked → approved with reason | 25, 29 |
| POST | `/api/supplier-invoice/:id/cancel` | `invoice.manage` | blocked/approved → cancelled | 26, 27, 29 |
| GET | `/api/company/invoice-tolerances` | `invoice.view` (alsoKeys: `invoice.manage`) | read the two tolerances (the existing `GET /api/company/settings` needs `sco.view`) | 32 |
| PATCH | `/api/company/invoice-tolerances` | `company.manage` | set the two tolerances | 32 |

Removed (D8): `POST /api/po/:id/invoice` (`po.manage`), its `PO_ROUTES.invoice` constant, `markPoInvoicedSchema`,
`poService.markInvoiced`, `poRepository.findSupplierInvoice/insertSupplierInvoice`, the frontend `API_ROUTES` entry
and `MarkPoInvoicedDialog` go in the same PR as the new routes (contract test fails on a dangling frontend path).
The PO status `invoiced` stays; it is now set and cleared only by `submit`, `release` and `cancel` (BR-29) with a
new internal edge `invoiced → fully_received`. Reused unchanged: `GET /api/company/settings` (plant GSTIN/state),
supplier lookup. The document flow in the detail is built server-side (numbers and statuses only); the frontend does not call `getpodetails` / `getgrndetails` for it.
Every route has exactly one key; 401 without login on all (BR-33).

## Payloads
Common: `invoiceNumber` string trimmed, upper-cased, regex `^[A-Z0-9/-]{1,16}$`; `invoiceDate` `YYYY-MM-DD`;
`qty` number > 0, ≤ 1e9, ≤ 3 decimals; `ratePaise` int 1–1e12; `gstPercent` one of the slab list
(0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40; the server converts to basis points); all `*Paise` ints 0–`MAX_SAFE_INTEGER`;
`reason` string 3–500; `description` string ≤ 200.

### `POST createsupplierinvoice` / `PATCH updatesupplierinvoice` (patch adds `id`, all other fields optional, lines replace the set)
- **Request:** `{ poId: int (immutable after create: patch with another poId = 400), invoiceNumber, invoiceDate, reverseCharge?: bool, itcNotEligible?: bool,
  printed: { taxablePaise, cgstPaise, sgstPaise, igstPaise, totalPaise },
  lines: [{ grnItemId: int, qty, ratePaise, gstPercent }] (1–200),
  charges?: [{ type: freight|packing|tooling|other, description (required 1–200 when type=other), taxablePaise ≥ 1, gstPercent }] (0–10) }`
- **Response 201 / 200:** the detail shape below. Computed values (line taxable, heads, totals, tax type,
  due date) are always the server's; any such field sent in the body is ignored (BR-10, 13).
- **Errors:** 400 `SINV_*` validation (BR-05 number format, 07 date, 08 qty/rate/GST, 09 charge, 01 wrong PO
  or repeated GRN line, 02/04 `SINV_NOTHING_TO_BILL`, 36 `SINV_AMOUNT_TOO_LARGE`; update on a non-draft 409
  `SINV_NOT_DRAFT` BR-11) · 404 PO or GRN line · 409 `SINV_DUPLICATE_NUMBER` (BR-06) · 409 `SINV_BUSY` when the
  status changed under the lock (BR-34). The create/update check of billable qty runs under the line locks (BR-03).

### `GET getbillablelines`
- **Query:** `poId` int (required), `grnId` int (optional filter). **Response:** `{ po: {id, poNumber, status,
  paymentTermsDays}, supplier: {id, name, gstin}, lines: [{ grnItemId, grnId, grnNumber, itemName, uom,
  netAcceptedQty, billedQty, returnedQty, billableQty, poRatePaise, poGstPercent }] }`; only lines with
  `billableQty > 0`. **Errors:** 409 `SINV_PO_NOT_BILLABLE` PO status not billable (BR-04); 404.

### `GET getsupplierinvoicedetails/:id`
- **Response:** header (all `data.md` columns except snapshots' internals), `lines`, `mismatches`
  (`check, lineId, head, expected, billed, unit`), `history`, `overdue: bool`, `dueDate`, `debitNotes: [{id, number,
  totalPaise, billOffsetPaise, status}]` and `netPayablePaise = totalPaise − sum(billOffsetPaise of linked non-cancelled notes)` (BR-31, from
  purchase-returns), `flow: { pr[], po, grns[] }` (BR-39), `tolerances` used. **Errors:** 404.

### `POST :id/submit`, `:id/back-to-draft`
- **Request:** `{}`. **Response 200:** detail; submit returns the new status and mismatches (a blocked bill is a
  200, never an error, BR-23). **Errors:** 400 `SINV_COMPANY_SETTINGS_MISSING` naming the field (BR-18) · 409
  `SINV_NOT_DRAFT` / `SINV_NOT_BLOCKED` · 409 `SINV_BUSY` (BR-34) · 409 `SINV_STALE_QTY` if a re-read under the lock
  finds billable qty gone (BR-30, 34).

### `POST :id/release`
- **Request:** `{ reason: 3–500 }`. **Errors:** 409 `SINV_NOT_BLOCKED` · 403 `PERMISSION_DENIED` · 403 `SINV_SELF_RELEASE` when
  the user has any `supplier_invoice_history` row on this invoice with action create, edit, back_to_draft or submit, over its whole life, super-admin included (BR-25, SEC-07). Test: a user whose only action was an edit is refused · 409 `SINV_BUSY`.

### `POST :id/cancel`
- **Request:** `{ reason: string }` trimmed; 10–500 chars when the bill is approved (payable), 3–500 when blocked (400 `SINV_REASON_LENGTH`). **Errors:** 409 `SINV_NOT_CANCELLABLE` (draft: use delete; cancelled, legacy)
  · 409 `SINV_BUSY`. Moves the PO `invoiced → fully_received` when it was the covering invoice (BR-29).

### `DELETE deletesupplierinvoice/:id`
- Draft only (409 `SINV_NOT_DRAFT`); hard delete with the history row kept (BR-11, 35).

### `PATCH /api/company/invoice-tolerances`
- **Request:** `{ priceTolerancePercent: number 0–10, weightTolerancePercent: number 0–10 }`, each ≤ 2 decimals
  (stored as basis points); at least one field. **Response:** both values. **Errors:** 400 out of range · 409 `SINV_COMPANY_NOT_SET` when no
  company row yet ("Save company details first") · applies to the next submit only (BR-32). Writes
  `company_settings_history`.

## Lists
`GET getsupplierinvoices` — `page` (1), `pageSize` (10, max 100), `sortBy` enum `ourNumber | invoiceNumber |
invoiceDate | dueDate | totalPaise | createdAt` (default `createdAt`), `sortDir` (default `desc`), PK tiebreaker.
Filters: `grnId` (invoices with a line on that GRN), `status` = `draft | blocked | payable | overdue | cancelled | all` (default `all`; `payable` = approved,
`overdue` = approved and due before today IST; legacy rows only under `all`), `supplierId`, `poId`, `q` (≤ 100 chars,
safe-search; our number, supplier number, supplier name, PO number; ilike on trigram indexes). Response
`{ success, data: rows, meta: { page, pageSize, total, totalPages, statusCounts: { draft, blocked, payable, overdue,
cancelled } } }` — counts come from one grouped query, as `GET /api/po/getpos` does. Row: id, ourNumber,
invoiceNumber, invoiceDate, supplier, poNumber, status, totalPaise, dueDate, overdue.

## Notes (pre-freeze)
- Permissions: every wrong-status or race error is 409 (codes keep `SINV_*`); 400 is validation only (CR-001).
- New permission keys (seed roles): `invoice.view` (ow, bo), `invoice.manage` (ow, bo), `invoice.release` (ow). Manage routes use key `invoice.manage`, no alsoKeys;
  view routes use `invoice.view` with alsoKeys [`invoice.manage`]; `getbillablelines` uses `invoice.manage` only (CR-002, 003, 010).
- `id` stays in the PATCH body, as `updatepo` does (CR-004). `sortDir` default `desc` is deliberate (newest first, CR-005).
- Bounds: billable lines ≤ the PO's lines (tens); history rows per invoice are few (CR-007). One grouped query plus one batched
  `returnedQtyByGrnItem(ids)` build the billable list (PERF-04).
- Route constant `END_POINTS.company.invoiceTolerances` (CR-008). Match-line chips doc id: `supplierInvoiceMatch`.
- Self-release (BR-25): refused if the user has any history row on the invoice with action create, edit, back_to_draft or submit, whole life, super-admin included. Edit history `detail` stores a field diff; submit-result `detail` is kept after
  back_to_draft; submit/release/cancel `detail` lists linked/unlinked debit-note ids.

## Choices made
Moved to `../assumptions.md` by spec-analyst.
| Question | Choice | Source |
|---|---|---|
