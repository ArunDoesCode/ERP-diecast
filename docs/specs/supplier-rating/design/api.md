# Supplier rating — API design

> Written by solution-designer from `../spec.md` and `data.md`. Source for the run's `contract.md`.
> Checked by security-auditor (permission on every route) and code-reviewer (conventions) before freeze.
> Conventions: `backend/.claude/reference/hono-build-conventions.md`, skills `api-endpoint-intake`,
> `pagination-contract`. Max 150 lines.

## Endpoints
New router `supplierRatingRouter` mounted at `/api/supplier-rating` (files: `routes/supplierRating.ts`,
`controller/`, `service/`, `repository/`, `types/supplierRating.types.ts`; path strings in `routes/end-points.ts`).
Read-only: four GETs, no POST/PATCH/DELETE, so there is no audit row (spec: Audit none).

| Method | Path | Permission key | Purpose | Rules |
|---|---|---|---|---|
| GET | `/api/supplier-rating/list` | `supplier.rating.view` | ratings of all suppliers, paginated | 01–26, 29 |
| GET | `/api/supplier-rating/:supplierId/card` | `supplier.rating.view` | one supplier's rating card | 01–25, 28, 29 |
| GET | `/api/supplier-rating/:supplierId/lines` | `supplier.rating.view` | lines behind one measure, paginated | 27, 29 |
| GET | `/api/supplier-rating/:supplierId/trend` | `supplier.rating.view` | 12 monthly buckets, one call | 28, 29 |

Reuse: supplier master data stays on the existing `GET /api/supplier/:supplierId/detail` (`supplier.view`); the
supplier page calls `/card` as a second request, so a user with only `supplier.view` still opens the page and the
card is simply not requested or shown (BR-SRT-29). The rating key is independent of `supplier.view` (BR-SRT-40): list and drill-down return `supplierName` themselves, so a holder of the rating key only needs no supplier endpoint. No existing endpoint carries rating data. Frontend adds the
four paths to `API_ROUTES` (contract test fails if any is missing in the backend).

## Payloads
Shared shapes (all numbers integers; no float):
- Ids (`supplierId`, `poItemId`, `grnItemId`) are int32 (1..2147483647). Percent values: see data.md.
- `Measure`: `{ pctTenths: int | null, lines: int }` (800 = 80.0 %; `null` = "No data", BR-23).
- `Rating`: `{ supplierId, supplierName, isActive, windowFrom: "YYYY-MM-DD", windowTo: "YYYY-MM-DD",
  onTime: Measure & { onTimeLines: int, lateLines: int, openLateLines: int, shortClosedLateCount: int, noDueDateCount: int },
  rejection: Measure & { linesWithRejects: int, decidedLines: int, notInspectedLines: int, notInspectedRejectedQty: Array<{ uom: string, qty: "5.000" }> },
  priceVariance: Measure & { comparedLines: int, notComparedLines: int },
  score: int 0–100 | null, label: "good" | "watch" | "poor" | null,
  notEnoughData: { judgedLines: int, decidedLines: int, required: 5 } | null }`
  - `score` and `label` are null when `notEnoughData` is not null (BR-22) or when on-time or rejection has no data (BR-36), and in both cases the three measures still show (BR-24). `required` is the fixed 5.
  - `windowFrom`/`windowTo` are IST days (BR-01, 02).

### `GET /api/supplier-rating/list`
- **Query:** `page` int 1–10000 (default 1) · `pageSize` int 1–100 (default 10) · `sortBy` enum (below; omitted → default sort
  in Lists incl. its direction) · `sortDir` `asc|desc` (explicit `sortBy` without `sortDir` → `asc`, resolved in the controller) · `status` `active|inactive|all` (default `active`, BR-26) · `q` string ≤ 100
  (supplier name, `ilike`, `%` and `_` in `q` are escaped as literals, uses `idx_supplier_master_name_trgm`).
- **Response 200:** `{ success: true, data: Rating[], meta: { page, pageSize, total, totalPages } }`
  (`total` is a plain count on `supplier_master` with the `status`/`q` filters; suppliers with no PO still appear with all measures `null`).
- **Errors:** 400 bad query (unknown `sortBy`, `pageSize` > 100) · 401 · 403 naming `supplier.rating.view` (BR-29).

### `GET /api/supplier-rating/:supplierId/card`
- **Path:** `supplierId` int32 ≥ 1. **Response 200:** `{ success: true, data: Rating }`.
- **Errors:** 400 bad id · 401 · 403 (BR-29) · 404 supplier not found (inactive suppliers are found).

### `GET /api/supplier-rating/:supplierId/lines`
- **Query:** `measure` enum `on_time|rejection|price` (required) · `page` · `pageSize` (same bounds as list) ·
  `sortBy` per measure (below; omitted → that measure's default sort and direction; `sortBy` without `sortDir` → `asc`) · `sortDir` · `verdict` (on_time measure only) `all|late|on_time|no_due_date` default `all`. `late` returns every late line: complete-late, `open_past_due` and short-closed-late, so the row count equals `lateLines` (and the `open_past_due` rows equal `openLateLines`, short-closed-late rows `shortClosedLateCount`).
- **Response 200:** paginated `data` by measure, `meta` as usual (each row is one line; strings ≤ 60 chars):
  - `on_time`: `{ poItemId, poNumber, itemSku, itemName, uom, orderedQty: "1000.000", arrivedQty: "1000.000",
    dueDate | null, revisedDate | null, completionDate | null, judgementDate | null, verdict: "on_time"|"late"|null,
    daysLate: int | null, state: "complete"|"short_closed"|"open_past_due"|"no_due_date" }` (BR-05..10, 27, 32); `no_due_date` rows have null `dueDate`, `verdict`, `daysLate`, are left out of the %, and counted in `noDueDateCount`
  - Open lines not yet due are not listed in `on_time` rows (not judged, BR-08); only judged lines appear.
  - `rejection`: `{ grnItemId, grnNumber, poNumber, itemSku, receivedDate, arrivedQty, rejectedQty (3-decimal
    strings), uom, ratePaise, rejectedValuePaise, arrivedValuePaise, inspection: "decided"|"not_inspected" }` (BR-11, 12, 15, 27); `not_inspected` rows (bypassed or `waived`) are excluded from the sums and the % but listed with their rejected qty (BR-13); pending-QA lines are not listed.
  - `price`: `{ poItemId, poNumber, poDate, itemSku, uom, qty, ratePaise, referenceRatePaise | null,
    referenceSource: "standard_rate"|"previous_po"|"none", variancePaise: int | null (per unit: ratePaise − referenceRatePaise), variancePctTenths: int | null (signed tenths of a percent, line level), lineVariancePaise: int | null (= variancePaise × qty, rounded to paise), compared: bool,
    notComparedReason: "uom_differs"|"no_reference"|null }` (BR-17..19, 27)
- **Errors:** 400 missing/unknown `measure`, `sortBy` not allowed for the measure, `verdict` with another
  measure · 401 · 403 · 404 supplier.

### `GET /api/supplier-rating/:supplierId/trend`
- **Query:** none (always the 12 IST months ending this month, BR-28). **Response 200:** `{ success: true, data:
  { months: Array<{ month: "YYYY-MM", onTime: Measure, rejection: Measure, priceVariance: Measure,
  score: int | null, label | null, notEnoughData: {...} | null }> } }`, exactly 12 entries, oldest first. Each
  month applies BR-03..24 to the lines whose judgement month (price: PO month; rejection: GRN received month) is
  that month. A month's `score` and `label` are present only when both on-time and rejection have data (BR-36), without the 5-line minimum (BR-28); each month carries its line counts (`onTime.lines`, `rejection.lines`) and `notEnoughData` is always null there; otherwise score and label are null. Month assignment: on-time by judgement date (BR-37), rejection by GRN received date (BR-38), price by PO date (BR-39). /trend is exempt from the pagination contract: a fixed 12-row array, not a list.
- **Errors:** 400 bad id · 401 · 403 · 404 supplier.

## Lists
| Endpoint | Filters | `sortBy` whitelist | Default sort | Page size |
|---|---|---|---|---|
| `/list` | `status`, `q` | `name`, `score`, `onTimePct`, `rejectionPct`, `priceVariancePct`, `judgedLines`, `decidedLines` | `name asc`, tiebreak `supplier_master.id asc` | default 10, max 100 (`page` ≤ 10000) |
| `/lines` `on_time` | `verdict` | `dueDate`, `completionDate`, `daysLate`, `poNumber`, `itemSku` | `daysLate desc`, tiebreak `poItemId asc` | default 10, max 100 |
| `/lines` `rejection` | — | `receivedDate`, `grnNumber`, `rejectedValuePaise`, `itemSku` | `receivedDate desc`, tiebreak `grnItemId asc` | default 10, max 100 |
| `/lines` `price` | — | `poDate`, `poNumber`, `variancePaise`, `itemSku` | `poDate desc`, tiebreak `poItemId asc` | default 10, max 100 |

- Default sort applies only when `sortBy` is omitted; explicit `sortBy` with no `sortDir` is `asc`.
- Null sort values (no data, no score) sort last in both directions, so "No data" suppliers never top a ranking.
- Sorting happens in SQL on the grouped result; rows and count run in `Promise.all` (2 queries, no N+1).
- `sortableFields` in the manifest = the `/list` whitelist; `/lines` whitelists are enforced by the controller
  per `measure` (Zod `superRefine`), reported as 400.

## Errors by rule
| Code | Cause | Rule |
|---|---|---|
| 403 `Missing permission: supplier.rating.view` | no key (floor supervisor, QA, etc.) | BR-SRT-29 |
| 404 | supplier id does not exist | — |
| 400 | invalid query values | bounds above |
No 409 anywhere: nothing can be in a wrong state, the endpoints write nothing (BR-SRT-01, 25).

## Choices made
Technical choices not asked of the owner. spec-analyst moves these rows into `../assumptions.md`.
| Question | Choice | Source |
|---|---|---|
| — | moved to `../assumptions.md` (A-18, A-21..A-29) | — |
