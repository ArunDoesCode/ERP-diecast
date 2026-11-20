# Dispatch — API design

> Written by solution-designer from `../spec.md` and `data.md`. Source for the run's `contract.md`.
> Conventions: `backend/.claude/reference/hono-build-conventions.md`, skills `api-endpoint-intake`,
> `pagination-contract`. Router `/api/dispatch`, new `dispatch` block in `routes/end-points.ts`.
> Posting lowers the SO's reservations via sale-order `applyDelivery` (BR-SO-58); cancelling does not restore them.
> Audit actions (BR-DSP-36): `dispatch.create`, `dispatch.edit`, `dispatch.post`, `dispatch.cancel` (draft and posted), `dispatch.transport`.
> Responses `{ success, data }` / `{ success, data, meta }`. No DELETE route exists (BR-DSP-34).
> Check existing shapes with `bun run contract:query "<METHOD /path>"` before build.

## Endpoints
| Method | Path | Permission key | Purpose | Rules |
|---|---|---|---|---|
| GET | `/api/dispatch/pending` | `dispatch.view` | pending-dispatch list (also feeds the note form's line picker via `soId`) | BR-DSP-39, 03 |
| GET | `/api/dispatch/settings` | `dispatch.view` | e-way limit and plant state code for the live hint | BR-DSP-23 |
| GET | `/api/dispatch/notes` | `dispatch.view` | note register | BR-DSP-40 |
| GET | `/api/dispatch/notes/:id` | `dispatch.view` | note detail, also the print data | BR-DSP-38, 41 |
| POST | `/api/dispatch/notes` | `dispatch.manage` | create draft from a confirmed SO | BR-DSP-01..09 |
| PATCH | `/api/dispatch/notes/:id` | `dispatch.manage` | edit draft: header, lines, packages, transport | BR-DSP-03..09, 20, 22, 25 |
| POST | `/api/dispatch/notes/:id/post` | `dispatch.manage` | post: stock out, SO delivered qty | BR-DSP-10..19, 21, 23, 24, 26 |
| POST | `/api/dispatch/notes/:id/cancel-draft` | `dispatch.manage` | cancel a draft | BR-DSP-29 |
| POST | `/api/dispatch/notes/:id/cancel` | `dispatch.cancel` | cancel a posted note, stock back | BR-DSP-30..33 |
| PATCH | `/api/dispatch/notes/:id/transport` | `dispatch.manage` | change transport / add e-way no after posting | BR-DSP-25..27 |
| GET | `/api/dispatch/notes/:id/transport-history` | `dispatch.view` | who changed what | BR-DSP-27 |

Reused, no new endpoint: e-way limit edit = `PATCH /api/company/settings` (`company.manage`), which keeps its four required fields and gains an optional `ewayIntraLimitPaise` (integer paise, 1..10,000,000,000; CR-SCO-1; omitted = unchanged); `GET /api/company/settings` returns it too; its history = `GET /api/company/settings/history` (BR-DSP-42). Source-location picker = existing asset locations list. SO close for the unshipped rest = sale-order's close route (BR-SO-17). SO screen's per-line ordered / delivered / open comes from sale-order's detail; its note list = `GET /notes?soId=`. Print = the detail response (company name, address, GSTIN, state are included as `company`).

## Payloads
Dates are `YYYY-MM-DD` (IST day). Qty: number with ≤ 3 decimals (whole for pcs / set), `0 < qty ≤ 1,000,000`. Money is integer paise.

### `POST /api/dispatch/notes`
- **Request:** `{ soId: int, noteDate?: date, sourceLocationId?: int, remarks?: string(≤500), lines: [{ soLineId: int, qty, lotNo?: string(≤50) }] (1..200), packages?: Package[] (≤500), transport?: Transport }` — strict object; any other key (customer, price, status) → 400.
- **Response 201:** the detail shape below.
- **Errors:** 400 empty lines / qty ≤ 0 / over open qty / decimals on pcs / date rules / bad location / bad transport format (BR-DSP-03..05, 07, 08, 25) · 401 · 403 · 404 only when `soId` does not exist; any `soLineId` not on that SO → 400 `DISPATCH_LINE_NOT_ON_SO` · 409 SO not `confirmed` (BR-DSP-01), e-way no already on another live note (BR-DSP-26).

### `PATCH /api/dispatch/notes/:id`
- **Request:** any of `noteDate, sourceLocationId, remarks, lines, packages, transport`; at least one key. `lines` and `packages` when sent replace the whole list (a package names its line by `soLineId`). Strict.
- **Response 200:** detail shape.
- **Errors:** 400 as create; also package rules (BR-DSP-20) · 404 · 409 note not `draft` (BR-DSP-22), SO no longer `confirmed` is allowed (draft can be saved; only post is refused), e-way reuse (BR-DSP-26).

### `POST /api/dispatch/notes/:id/post`
- **Request:** `{}` (strict; everything comes from the saved draft).
- **Response 200:** detail shape, now with `dnNumber`, frozen price and tax fields.
- **Errors:** 400 over open qty on arrival (BR-DSP-10), company details or item HSN missing (BR-DSP-18), packed qty ≠ line qty (BR-DSP-21), e-way fields missing when needed (BR-DSP-24), bad formats (BR-DSP-25) · 403 · 404 · 409 note not draft or lost the race (BR-DSP-10, 16), SO not `confirmed` (BR-DSP-11), "Insufficient stock" (BR-DSP-13), e-way no reused (BR-DSP-26). Codes e.g. `DISPATCH_SO_NOT_CONFIRMED`, `DISPATCH_OVER_OPEN_QTY`, `INSUFFICIENT_STOCK`.

### `POST /api/dispatch/notes/:id/cancel-draft` and `/cancel`
- **Request:** `{ reason: string (trim, 3..500) }` strict.
- **Response 200:** detail shape (`status: cancelled`).
- **Errors:** 400 reason length (BR-DSP-29, 30) · 403 `dispatch.cancel` missing on `/cancel` (BR-DSP-30, 35) · 404 · 409 wrong status or second cancel (BR-DSP-33), `/cancel` on an SO closed by hand (BR-DSP-32). `/cancel` is allowed while the SO is `confirmed`, `on_hold` or closed `fully_delivered`.

### `PATCH /api/dispatch/notes/:id/transport`
- **Request:** `{ mode?, vehicleNo?, transporterId?, transporterName?(≤100), transportDocNo?(≤30), transportDocDate?, ewayBillNo?, ewayBillDate?, distanceKm?(1..4000) }`, every field nullable, at least one key. Unknown key → 400; known locked key → 409 `DISPATCH_NOTE_FIELD_LOCKED` (BR-DSP-27); an existing e-way no or date may not change → 409. `distanceKm` may be added once, together with the e-way no (when empty before); then locked.
- **Response 200:** detail shape. Each changed field writes a history row and an audit row (`dispatch.transport`).
- **Errors:** 400 format (BR-DSP-25) · 404 · 409 note not `posted`, locked field, e-way reuse (BR-DSP-26). 

### Transport fields (CR-DSP-1)
| Field | Type / bound | Draft | After post |
|---|---|---|---|
| `mode` | enum road, rail, air, ship | set / change; `null` clears | locked: any `mode` key sent, even unchanged → always 409 `DISPATCH_NOTE_FIELD_LOCKED` |
| `vehicleNo` | ≤ 15, normalised | set / change / `null` clears | change allowed (history); `null` clears allowed, but on a road note with `ewayNeeded` true vehicle and transporter ID cannot both end up empty → 400 |
| `transporterId` | 15, GSTIN pattern | same | change allowed |
| `transporterName` | ≤ 100 | same | change allowed |
| `transportDocNo` / `transportDocDate` | ≤ 30 / date | same | change allowed |
| `ewayBillNo` / `ewayBillDate` | 12 digits / date | same; a no without a date → 400 | only if empty before, once, both together; else 409 |
| `distanceKm` | 1..4000 | same | only if empty before, once, together with the e-way no; else 409 |
Merge: a PATCH changes only the keys sent; keys not sent stay. `null` clears a field on a draft; after posting `null` is allowed only on the four changeable field groups above, never on mode, e-way or distance. A value equal to the stored one is ignored: no history row, no audit row. The transport route is strict: unknown key → 400; a known key that is locked → 409 `DISPATCH_NOTE_FIELD_LOCKED`.

### Formats (BR-DSP-25), shared by Transport
`vehicleNo` ≤ 15, trimmed, spaces / dashes removed, upper-cased, then `^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$` or BH `^\d{2}BH\d{4}[A-Z]{1,2}$`; `transporterId` `^\d{2}[A-Z0-9]{13}$`; `ewayBillNo` `^\d{12}$` (spaces removed); `transport.mode` in road, rail, air, ship; dates not in the future, e-way date ≥ note date.
Package: `{ soLineId, packageNo: string(1..20), qty, netKg: 0 < n ≤ 50,000 (3 dp), grossKg: ≥ netKg ≤ 50,000, lotNo?: string(≤50) }`.

### Detail shape (`GET /notes/:id`, and the response of create, edit, post, cancel)
`{ soStatus, activity: [{at, actorName, action, reason|null}] (from `auth_audit_log`, newest first, max 50; no prices), id, dnNumber|null, status, soId, soNumber, customerPoNumber, customer: {id,name,address,gstin|null,stateCode}, shipTo: {address,stateCode}, noteDate, sourceLocation: {id,name}, remarks, lines: [{id, soLineId, item:{id,sku,name,hsnCode}, qty, uom, deliveryDate, lotNo, openQtyAtRead, unitPricePaise*, gstPercent*, taxablePaise*, gstPaise*}], packages: [...], transport: {...}, ewayValidUntil|null, ewayExpired, ewayNeeded, ewayLimitPaise, company: {name,address,gstin,stateCode}, taxablePaise*, gstPaise*, valuePaise*, postedBy/At, cancelReason/By/At, createdBy/At }`.
- `*` = sale-price fields: present only when the caller also holds `so.view` (BR-SO-51); otherwise omitted (not zeroed). Item average cost is never returned.
- **`ewayNeeded` (boolean) and `ewayLimitPaise` (integer, paise) are always returned, with or without `so.view`.** The server computes `ewayNeeded` from the value it holds itself (draft: live from current SO prices; posted: frozen), customer state vs plant state, and the setting (BR-DSP-23), so a user without `so.view` gets the hint but never the price. Both are also on the create and edit responses, which makes the form hint live after each save. `ewayNeeded` maps to the stored `eway_required` column.
- On a draft, `ewayNeeded` is the stored value "as of last save" (register and detail alike); price and tax fields show the SO's current values (BR-DSP-19); `openQtyAtRead` helps the picker (informational, BR-DSP-06).
- `GET /settings` returns `{ ewayIntraLimitPaise, plantStateCode }`.

## Errors (CR-DSP-2)
| Code | Status | Rule | Routes |
|---|---|---|---|
| (none: Zod "Validation failed") | 400 | body or query shape, bounds, formats: BR-DSP-05, 20, 25, 29, 30 | all routes with input |
| `BAD_REQUEST` | 400 | service checks without a named code: BR-DSP-02, 03, 07, 08 | create, edit |
| `UNAUTHORIZED` | 401 | BR-DSP-35 | all |
| `DISPATCH_LINE_NOT_ON_SO` | 400 | soLineId must belong to `soId`; package soLineId must be one of the note's lines; duplicate soLineId → 400 (BR-DSP-03, 20) | create, edit |
| `DISPATCH_OVER_OPEN_QTY` | 400 / 409 | BR-DSP-04 (create, edit); BR-DSP-10 (400 before the lock, 409 lost race) | create, edit, post |
| `DISPATCH_COMPANY_OR_HSN_MISSING` | 400 | BR-DSP-18 | post |
| `DISPATCH_PACKED_QTY_MISMATCH` | 400 | BR-DSP-21 | post |
| `DISPATCH_EWAY_REQUIRED` | 400 | BR-DSP-23, 24 | post |
| `DISPATCH_SO_NOT_CONFIRMED` | 409 | BR-DSP-01, 11 | create, post |
| `INSUFFICIENT_STOCK` | 409 | BR-DSP-13; passed through from `postStock` (same change purchase-returns makes) | post |
| `DISPATCH_NOTE_STATUS` | 409 | wrong status, second post / cancel (BR-DSP-16, 22, 33) | edit, post, cancel-draft, cancel, transport |
| `DISPATCH_EWAY_REUSED` | 409 | BR-DSP-26 | create, edit, post, transport |
| `DISPATCH_NOTE_FIELD_LOCKED` | 409 | BR-DSP-27 | transport |
| `DISPATCH_SO_CLOSED_MANUALLY` | 409 | BR-DSP-32 | cancel |
| `PERMISSION_DENIED` | 403 | BR-DSP-30, 35 | all |
| `NOT_FOUND` | 404 | note or `soId` missing (a bad `soLineId` is 400, not 404); any DELETE (BR-DSP-34) | all |

## Lists
All follow the pagination contract: `page` default 1, `pageSize` default 10, max 100, `sortDir` default `asc` unless noted, id tiebreaker, `{ page, pageSize, total, totalPages }`. Invalid `sortBy` → 400.

| List | Filters | `sortBy` whitelist | Default sort |
|---|---|---|---|
| `GET /pending` | `customerId`, `itemId`, `soId` (ints); optional `locationId` for the stock column (default = BR-DSP-08 default; must be an active, non-virtual, non-`vendor_premise` location else 400) | `soDate`, `customerName`, `itemSku`, `openQty` | `soDate` asc |
| `GET /notes` | `dateFrom`, `dateTo` (IST days, both inclusive; date, from ≤ to else 400), `customerId`, `soId`, `status` (single value: draft, posted or cancelled), `ewayMissing` (bool: drafts only, needed and no e-way no) | `noteDate`, `dnNumber`, `customerName`, `status`, `valuePaise` | `noteDate` desc |
- Query shape: stock for the page is read in one batch (`inArray` of item ids), `open > 0` is filtered in SQL starting from confirmed SOs; the detail loads lines, packages and history in batched queries.
- `/pending` rows: `{ soId, soNumber, soLineId, customer, item, uom, deliveryDate, ordered, delivered, open, soDate, stockAtLocation }`; only confirmed SOs with open > 0. Sale price is not in this list.
- `/pending` with `soId` also returns `meta.so`: `{ soNumber, customerPoNumber, customer: {id,name,address,stateCode,gstin|null}, shipTo: {address,stateCode} }`, readable with `dispatch.view` alone (no `so.view`; no price in it).
- Filter options: `meta.customers` and `meta.items` on every `/pending` response = distinct `{id,name}` / `{id,sku,name}` over all rows matching the other filters, ignoring that filter's own value (max 200 each, sorted by name). `dispatch.view` only; no use of the `so.view` customer list.
- `/notes` rows: `id`, `dnNumber`, `soNumber`, `totalQty` (Σ line qty, may mix units; shown as a number), date, customer, status, `ewayBillNo`, `ewayValidUntil`, `ewayExpired`, `ewayNeeded`, `valuePaise*` (needs `so.view`). `sortBy=valuePaise` without `so.view` → 400. For drafts `valuePaise` is the indicative saved value.
- `/notes` also returns `meta.customers`: distinct `{id,name}` of customers over all notes (not narrowed by the other filters), max 200, sorted by name, `dispatch.view` only, for the register's customer filter.
- `/transport-history`: `page`, `pageSize` only; newest first.

## Choices made
Moved to `../assumptions.md`.
