---
module: supplier-rating
spec: docs/specs/supplier-rating/spec.md (v1, frozen)
last_verified_commit: d386e04
last_verified_on: 2026-11-21
depends_on: [suppliers, purchase-order, grn, auth-setup]
---

# Supplier rating — as-built map

> What the code **is** (the spec says what it **should be**). Built on `feature/scm-rfq` inside epic `epic/scm`
> (run id `scm-supplier-rating`). Explore only code changed since `last_verified_commit`. Symbol names, not line numbers.

## Summary
A read-only rating per supplier, computed live in SQL on every request from POs and GRNs (no stored score,
no writes). Three measures over the last 12 IST months: on-time %, rejection % (by value, QA-decided lines),
price variance % (against item standard rate or the previous PO). Score 0–100 = half on-time + half
(100 − rejection), label Good ≥ 80 / Watch 60–79 / Poor < 60; no score below 5 judged and 5 decided lines.
Four GET endpoints, a list screen, a card + 12-month trend on the supplier page, and a line drill-down.
Full (BR-SRT-01..41; 25, 31, 35 have no automated test).

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| schema | `backend/src/db/schemas/02_procurement-purchasing.ts` | no new table; indexes `idx_purchase_orders_supplier_created` (supplier_id, created_at), `idx_grns_received_date`; column `grn_items.created_at` |
| migrations | `20261121105810_military_jasper_sitwell/` (two indexes), `20261121111608_old_marvel_apes/` (`grn_items.created_at`) | |
| types | `backend/src/types/supplierRating.types.ts` | list / lines queries `.strict()`, `SUPPLIER_RATING_LIST_SORT_FIELDS`, `RATING_LINES_SORT_FIELDS` per measure, `ratingSchema`, `onTimeLineSchema`, `rejectionLineSchema`, `priceLineSchema` |
| repository | `backend/src/repository/supplierRatingRepository.ts` | `baseCtes(today, supWhere)` (CTE chain), `OT_COLS` / `RJ_COLS` / `PR_COLS`, `scoreExpr(withMinimum)`, `WINDOW_CTES`, `RATING_SELECT`, `pageOf`; `supplierRatingRepository.{supplierExists, list, card, trend, onTimeLines, rejectionLines, priceLines}` |
| service | `backend/src/service/supplierRatingService.ts` | `list`, `card`, `trend`, `lines`; `labelOf`, `toRating` (sets `notEnoughData`), `toOnTimeLine` / `toRejectionLine` / `toPriceLine` / `toTrendMonth`; today = `istDayKey()` |
| controller / routes | `controller/supplierRatingController.ts`, `routes/supplierRating.ts` (`/api/supplier-rating`), `END_POINTS.supplierRating` | 4 GET routes, all `supplier.rating.view` |
| permissions | `lib/permissions.ts` | `supplier.rating.view` (owner, back_office); screen `supplier-ratings` `/supplier-ratings` (145, Procurement) |
| frontend api | `frontend/src/types/supplier-rating.ts`, `lib/api/supplier-rating/{fetchers,queries}.ts`, `API_ROUTES.supplierRating` | `supplierRatingKeys` {all, list, card, trend, lines}; queries do not retry 4xx |
| frontend ui | `app/(protected)/supplier-ratings/` (list, `[supplierId]?measure=`, loading, error); `components/views/supplier-ratings/{SupplierRatingListView, SupplierRatingDrilldownView, use-rating-list-controls, use-rating-drilldown-controls}`; `components/pages/supplier-rating/{RatingCard, RatingTrendTable, RatingLinesTable, RatingLabelBadge}` | card + trend in `components/views/suppliers/SupplierDetailsView.tsx` (before offerings, only with the key) |
| frontend (shared) | `formatPercentTenths` (`lib/format.ts`), status-tone doc `supplierRating` (good / watch / poor / not_enough_data / no_data), `DetailHeader` prop `docNoPlain`, nav icon `IconStarHalf`, breadcrumb "Supplier rating" | |

## Data model
No table of its own. Reads `supplier_master`, `purchase_orders`, `purchase_order_items`, `po_communications`,
`grns`, `grn_items`, `item_master`. Units on the wire: percent = integer tenths (800 = 80.0 %), qty = 3-decimal
strings, money = paise, dates = IST `YYYY-MM-DD`.

## API
Base `/api/supplier-rating`, all GET, all `supplier.rating.view`: `/list` (paged; `status` active | inactive | all,
default active; `q` ≥ 2 chars; `sortBy` name | score | onTimePct | rejectionPct | priceVariancePct | judgedLines |
decidedLines, default name asc, nulls last both ways), `/:supplierId/card`, `/:supplierId/lines` (`measure`
on_time | rejection | price required; per-measure `sortBy` whitelist, wrong one = 400; `verdict` only for
on_time), `/:supplierId/trend` (12 months, oldest first). Lines carry `prId` (PO link, PO detail is keyed by PR
id) and `grnId`. 404 = supplier missing (inactive is found).
Full shapes: `cd backend && bun run contract:query "GET /api/supplier-rating/list"`; run contract was
`.pipeline/scm-supplier-rating/contract.md`.

## Key flows
- One CTE chain per request (`baseCtes`): `params` (today, window from = today − 12 months + 1) → `sup` →
  `po_lines` (POs `dispatched` or later, plus `cancelled` POs with a non-failed `po_sent` communication) →
  `arr_rows` / `arr` (running arrived qty per line; completion = first IST day the sum reaches ordered) →
  `jl1` state (`no_due_date`, `complete`, `short_closed`, `cancelled_after_dispatch`, `ignored`,
  `open_past_due`, `open`) → `jl2` judgement date → `jv` verdict + days late → `rej_facts` (decided /
  not_inspected / pending) → `price_facts` / `pf` (reference + compared flag).
- Window rating (list + card): `WINDOW_CTES` groups by supplier for the window; `RATING_SELECT` adds score
  with the 5 + 5 minimum. Trend: `generate_series` of 12 months, score **without** the minimum,
  `notEnoughData` always null.
- Lines: rows with `count(*) over()` (`pageOf`); a page past the end falls back to a count query. List uses a
  plain supplier count.

## Invariants & gotchas
- Arrival = `coalesce(grns.received_date, grn_items.created_at)`; IST day via `(ts at time zone 'UTC') at time
  zone 'Asia/Kolkata'` (timestamps are UTC wall time). Draft GRN lines count toward arrival (A-44) but not
  toward rejection (`g.status <> 'draft'`).
- Due date = `expected_delivery_date` only; `revised_delivery_date` is shown, never judged.
- Cancelled PO (A-42): after the due date = late, judged by cancel day, counted in `cancelledAfterDispatchCount`;
  on or before due = ignored. A `po_sent` with status `failed` is not a dispatch (A-46).
- Not inspected = QA `waived` or `is_qa_bypassed`; such lines never count in rejection %, only in
  `notInspectedLines` / `notInspectedRejectedQty` (per UOM, qty > 0 only).
- Price reference (A-48): item `standard_rate_paise` > 0, else previous sent PO line of the same supplier + item
  (rate > 0, ordered by `created_at`, id); different UOM → not compared. Cancelled POs are not in price variance.
- No-due-date lines (A-47) are placed in the window by completion, else close / cancel day, else PO date; never
  judged.
- Index name is `idx_purchase_orders_supplier_created` (the contract report said `..._created_at`).
- Frontend: PO number links need `po.manage` (to `/purchase-orders/<prId>`), GRN number links need `grn.view`;
  plain text otherwise or when the id is null. Low-value list columns hide below 1100 px.

## Tests
| File | Covers |
|---|---|
| `backend/tests/routes/supplierRating.test.ts` | BR-SRT-01..24, 30, 32, 33, 36 (card measures, score, label, A-42, failed send, SCO-only vendor, GRN without received date) |
| `backend/tests/routes/supplierRatingLines.test.ts` | BR-SRT-08..10, 12, 13, 16..18, 27, 29, 32, 33, 41 (drill-down) |
| `backend/tests/routes/supplierRatingList.test.ts` | BR-SRT-23, 26, 28, 29, 34, 36..41 (list, trend months, permissions) |
| `backend/tests/lib/permissions.test.ts` | new key + seed grants |
Helper: `backend/tests/helpers/ratingFixtures.ts` (`docs/testing/fixtures.md` §3b).

## Known gaps / debt
- BR-SRT-25 (label never blocks), 31 (design system), 35 (links by permission) have no automated test; screens
  not checked in a browser by the build.
- Pinned-left columns at 1024 px not built (columns scroll inside the table).
- Every request recomputes from raw rows; no cache. Fine at current volume.

## History
| Date | PR / commit | Change |
|---|---|---|
| 2026-11-21 | fc99801..40c43bb | Map created: live rating SQL (on-time incl. cancelled after dispatch, rejection, price), list / card / lines / trend, screens; fixes A-42 narrowing, arrival fallback `grn_items.created_at`, lines total via `count over`, `prId` / `grnId` links (BR-SRT-35) |
