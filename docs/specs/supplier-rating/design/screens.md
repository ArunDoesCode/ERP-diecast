# Supplier rating — screens

> Written by ui-ux-designer from `../spec.md` and `api.md`. Sources are endpoints under `/api/supplier-rating`
> (`list`, `:supplierId/card`, `:supplierId/lines`, `:supplierId/trend`). Patterns, components and tokens come
> from the `design-system` skill. Pictures are ASCII wireframes, not screenshots (no running app or DB was used).

## Screen list
| Screen | Route | Pattern | Picture |
|---|---|---|---|
| Supplier ratings | `/supplier-ratings` (menu: Procurement → Supplier rating) | list | wireframe 1 |
| Rating card + trend | block inside the supplier detail page `/suppliers/[supplierId]` (not a new route) | detail (card) | wireframe 2 |
| Rating drill-down | `/supplier-ratings/[supplierId]?measure=on_time\|rejection\|price` | detail, two-pane | wireframe 3 |

All three need `supplier.rating.view` (BR-SRT-29). Read-only: no create, edit or delete action anywhere.
Score label colours (status map, same on all three): Good = success, Watch = warning, Poor = danger,
"Not enough data" = neutral. Added to `status-tone.ts` as doc `supplierRating` with these existing tones.

### Supplier ratings
- **Purpose:** owner / back office compare every supplier on one list (BR-SRT-26).
- **Pattern:** list: `PageHeader` + `FilterBar` + `DataTable` + `Pagination` (default 10, max 100); all columns shown.
- **Fields** (source: `GET /list` → `Rating`):
  Supplier (`supplierName`, link to drill-down) · Score (`score`, right) · Label (`label`, `StatusBadge`) ·
  On-time % (`onTime.pctTenths`) · Late lines (`onTime.lateLines`) · Rejection % (`rejection.pctTenths`) ·
  Lines with rejects (`rejection.linesWithRejects` of `rejection.decidedLines`) · Not inspected
  (`rejection.notInspectedLines`, BR-SRT-13) · Price variance % (`priceVariance.pctTenths`, signed "+5.0 %") ·
  Judged lines (`onTime.lines`). Format: tenths ÷ 10 shown with 1 decimal + " %", `tabular-nums`;
  `pctTenths` null = "No data" (BR-SRT-23); `score` null = "Not enough data" (`notEnoughData`).
  Sort keys: `name, score, onTimePct, rejectionPct, priceVariancePct, judgedLines, decidedLines`; status chip =
  `status=active|all`; search = `q`. Inactive suppliers show `<StatusBadge doc="supplier" status="inactive" />` by the name (`isActive`, existing status map).
- **Actions** (all `supplier.rating.view`, read-only): sort by every column (BR-SRT-26) · filter chips Active
  (default) / All (BR-SRT-26) · search by name (BR-SRT-26) · open a row → drill-down (BR-SRT-27).
- **States:** empty ("No suppliers yet", no action) · filtered empty ("Nothing matches these filters" + Reset) ·
  loading (8 skeleton rows) · error (ErrorState + Try again) · no permission (menu item hidden; direct URL
  shows the 403 page naming `supplier.rating.view`).
- **Permissions:** `supplier.rating.view`. Price variance column also needs it (same key).
- **Picture:** wireframe 1.
```
+------------------------------------------------------------------------------------+
| Supplier rating                                                                    |
| [Active v] [All]   [search supplier.......]                                        |
| Supplier            Score Label    On-time  Late  Reject  Not insp  Price   Lines  |
| Sri Balaji Alloys     89  [Good]   80.0 %     2   2.0 %     3      +5.0 %   10     |
| Kumar Castings        72  [Watch]  70.0 %     3   4.1 %     0      -1.2 %   10     |
| Anand Tools           55  [Poor]   50.0 %     5   9.0 %     1      +8.0 %   10     |
| Mehta Metals    Not enough data    66.7 %     1   No data   0      No data   3     |
|                                                       1 to 10 of 41  < 1 2 >       |
+------------------------------------------------------------------------------------+
```

### Rating card + trend (on the supplier page)
- **Purpose:** purchase sees one supplier's rating and its 12-month trend without leaving the supplier page.
- **Pattern:** one card, a block inside the existing supplier detail page (not a separate route), under the
  header, above offerings.
- **Fields** (`GET /:supplierId/card` → `Rating`; the card is a second request, never blocks the page; `GET /:supplierId/trend` → `months`): Score + Label badge ·
  three measure tiles On-time %, Rejection %, Price variance % (each with `lines`; `lateLines`,
  `linesWithRejects`, `notInspectedLines`, `notComparedLines`, BR-SRT-13, 18). The rejection tile also shows "3 not inspected, 5 kg rejected" (`notInspectedLines`,
  `notInspectedRejectedQty` per UOM, `formatQty`). The on-time tile also shows
  "N lines with no due date" from `onTime.noDueDateCount` when > 0 (BR-SRT-32) and the late count including
  short-closed lines judged late (`shortClosedLateCount`, source: `/card` onTime, BR-SRT-09) · window `windowFrom` to `windowTo`
  (`formatDate`) · trend table, 12 rows, newest first (API gives oldest first; the view reverses): Month
  (`month`) · Score (`score`) · Label · On-time % with its line count "80.0 % (5)" · Rejection % with line
  count · Price variance % with line count (BR-SRT-28). The Score cell is shown only when both on-time and
  rejection have data that month, with its line count "91 (4)" (judged + decided lines). Each month always shows its values with their line
  counts, even under 5 lines; the 5-line minimum hides only the headline score at the top of the card
  (BR-SRT-22; coordinator decision). A month with no lines shows "No data".
- **Actions** (`supplier.rating.view`, links only, no calls): each tile and "See lines" open the drill-down for that
  measure (BR-SRT-27). Nothing else.
- **States:** empty (supplier with no POs: "No rated deliveries in the last 12 months") · loading (skeleton
  tiles + 12 skeleton rows; card loads on its own) · error (ErrorState inside the card; rest of the page works) ·
  no permission (card not rendered, no gap; BR-SRT-29) · `notEnoughData` set: "Not enough data (3 of 5 lines)"
  (`judgedLines`, `decidedLines`, `required`) in place of the headline score, tiles still show (BR-SRT-22).
- **Permissions:** `supplier.rating.view`; supplier page itself keeps `supplier.view`.
- **Picture:** wireframe 2.
```
+-- Rating (last 12 months, 21 Nov 2025 - 20 Nov 2026) ------------- [ See lines ] --+
|  89 [Good]    On-time 80.0 %       Rejection 2.0 %         Price variance +5.0 %   |
|               8 of 10 lines        2 of 10 lines had rejects  vs standard rate     |
|               2 late               3 not inspected          1 not compared         |
|  Month     Score  Label   On-time     Rejection   Price var.                   |
|  Nov 2026    91   [Good]   100.0 % (2)  1.0 % (2)  +2.0 % (3)                   |
|  Oct 2026    85   [Good]    80.0 % (5)  2.5 % (4)  +5.0 % (5)                   |
|  Sep 2026   -     -         66.7 % (3)  No data    No data                      |
|  ... (12 rows, newest first; counts in brackets)                                |
+------------------------------------------------------------------------------------+
```

### Rating drill-down
- **Purpose:** show why a score is what it is, line by line (BR-SRT-27).
- **Pattern:** detail, two-pane. `DetailHeader` with `docNo` = supplier name (plain text, not mono), `status` =
  the Label badge (`supplierRating` map; "Not enough data" neutral when `notEnoughData`), `backHref`
  `/supplier-ratings`, `backLabel` "Supplier rating", no actions; breadcrumb last = supplier name via
  `useBreadcrumbLast`. Left pane (~280 px), source `GET /:supplierId/card`: score, window, and the measure
  picker, the existing `components/ui/toggle-group.tsx` (`ToggleGroup`, single select, vertical; no new component or token) (three rows On-time, Rejection, Price variance, each with its %).
  Selected row uses the brand-accent selection style (selection token, no new colour). Right pane, source
  `GET /:supplierId/lines`: lines table of the selected measure with `Pagination`. Selected measure in the URL
  (`?measure=on_time|rejection|price`, same words as the API; missing or invalid value falls back to `on_time`, no error). Keyboard:
  picker = ToggleGroup (arrows move, Enter / Space selects); table rows are links reachable by Tab.
  Responsive: at 1024 px and below the panes stack, picker on top; wide table columns scroll sideways inside
  the right pane (supplier, item name and revised date are the first to scroll; PO / GRN no. and the verdict
  stay pinned left/visible).
- **Fields** (`GET /:supplierId/lines?measure=`; sort keys per api.md Lists):
  - On-time: `poNumber` (mono link) · `itemSku` + `itemName` · `dueDate` · `revisedDate` (shown, not used) · `completionDate` ·
    `daysLate` (danger tone when > 0; `state` = `open_past_due` shows "Open, late", BR-SRT-08; `short_closed` shows
    "Short-closed" beside the verdict and judges by the last arrival, BR-SRT-09; `no_due_date` shows "No due
    date" instead of due date, days late and verdict, and is not counted in the %, BR-SRT-32) · `verdict`
    (On time / Late); filter chips `verdict` All / Late / On time / No due date. Header line: "10 lines judged, 2 late,
    1 with no due date" (`onTimeLines`, `lateLines`, `noDueDateCount`).
  - Rejection: `grnNumber` (mono link) · `poNumber` · `itemSku` · `receivedDate` · `arrivedQty` / `rejectedQty` (`formatQty` with
    `uom`) · `rejectedValuePaise` (`formatMoney`). Lines with `inspection === "not_inspected"` get a "Not inspected" note and are not
    counted (BR-SRT-13).
  - Price: `poNumber` · `itemSku` · `poDate` · `qty` (`formatQty` with `uom`) · `ratePaise` · `referenceRatePaise` · `referenceSource`
    (Standard rate / Previous PO) · variance % (`variancePctTenths`, source: `/lines?measure=price`; shown through the
    shared percent format helper, not computed in the view). Lines with `compared: false` show
    `notComparedReason` (UOM differs / no reference, BR-SRT-17, 18).
- **Actions** (`supplier.rating.view`, no writes): switch measure (BR-SRT-27) · sort and page the lines (BR-SRT-27) ·
  filter on-time lines by verdict (BR-SRT-27, 32) · PO / GRN number links (BR-SRT-35).
- **States:** empty ("No lines for this measure in the window") · loading (left pane skeleton from `/card`, table
  skeleton rows from `/lines`, each pane on its own) · error (ErrorState + Try again, per pane; `/card` failing
  does not hide the table) · not found (404, BR-SRT-34: "Supplier not found" EmptyState + link back to the list) ·
  no permission (403 page naming `supplier.rating.view`).
- **Permissions:** `supplier.rating.view`. PO number links (BR-SRT-35) render only with `po.manage` (the PO screen's key; there is no `po.view` in
  `permissions.ts`), GRN number links only with `grn.view`; otherwise the number is plain text.
- **Picture:** wireframe 3.
```
+------------------------------------------------------------------------------------+
| < Supplier rating   Sri Balaji Alloys  [Good]                                      |
+-----------------------+------------------------------------------------------------+
| Score 89              | On-time: 10 judged, 2 late, 1 no due date                  |
| (o) On-time   80.0 %  | PO no.     Item        Due     Revised  Done    Days late  |
| ( ) Rejection  2.0 %  | PO-0142    ADC12 ingot 10 Nov  20 Nov   12 Nov  2  [Late]  |
| ( ) Price    +5.0 %   | PO-0139    Flux        02 Nov  -        01 Nov  0  On time  |
| Window 21 Nov 2025    | PO-0150    Die oil     10 Nov  -        open   10  [Late]  |
|   to 20 Nov 2026      |                                  1 to 10 of 11  < 1 2 >    |
+-----------------------+------------------------------------------------------------+
```

## Choices made
| Question | Choice | Source |
|---|---|---|
| — | moved to `../assumptions.md` (A-12, A-30..A-35, A-37) | — |
