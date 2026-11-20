# Reorder — screens

> Written by ui-ux-designer from `../spec.md` and `api.md`. Endpoint names are the ones in `api.md`.
> Patterns, components and tokens come from the `design-system` skill. Pictures are wireframes, not screenshots
> (no running app/DB allowed for this run; no mock route was created).

## Screen list
| Screen | Route | Pattern | Picture |
|---|---|---|---|
| Reorder (live low-stock list) | `/inventory/reorder` | list | wireframe below |
| Reorder settings | dialog on Reorder (≤ 6 fields) | form (dialog) | wireframe below |
| Run history | `/inventory/reorder/runs` | list | wireframe below |
| Run detail | `/inventory/reorder/runs/[id]` | detail | wireframe below |
| Item form (change) | existing item edit page | form | wireframe below (D6) |
| PR detail (change) | existing PR detail | detail | wireframe below (D6) |

Sidebar: "Reorder" under Inventory, shown with `inventory.view`. Tablet (1024 px): on the Reorder list SKU, Usable, Projected and State stay visible, the other columns scroll sideways inside the table.

### Reorder (live low-stock list)
- **Purpose:** purchase and stores see what is low now, what the next check will raise, and start a check.
- **Pattern:** list. `PageHeader` + last-run strip + `FilterBar` + `DataTable` + `Pagination`. Filter and page in URL (nuqs), `loading.tsx` next to `page.tsx`.
- **Fields** (source `GET /api/reorder/items`, rows; BR-RO-21):
  SKU `sku` (mono accent link to item) · Name `name` · Unit `uom` (shown once, in its own column; quantity cells are plain numbers via `formatQty`) · Usable stock `usableQty` (right) · On the way `onTheWayQty` (right) · Projected `projectedQty` (right) · Reorder level `reorderLevel` (right) · Order qty `orderQty` (right, only when `state` = `will_be_ordered`, else –) · State `state` (+ `coveredBy`).
  State = badge: `will_be_ordered` "Will be ordered" = warning; `covered` "Covered" = info, with the `coveredBy.number` as a mono accent link beside the badge (PR or PO by `coveredBy.type`/`id`); `needs_reorder_qty` "Needs a reorder qty" = warning (told apart from "Will be ordered" by its label and icon, not by colour); `ok` "OK" = success. All via a new `reorderItem` doc in `status-tone.ts`, existing tones only.
  Quick filters, counts from `meta.stateCounts`: All first, then Will be ordered · Covered · Needs a reorder qty · OK; filter sends `state=<csv>`, default `will_be_ordered`. Search `q` (SKU or name). Sort `sortBy` sku, name, usableQty, projectedQty, state; default sku asc. Page size from `meta.pageSize`.
  Last-run strip (a muted text row directly under `PageHeader`, no card; source `GET /api/reorder/runs?pageSize=1` first row: `startedAt`, `trigger`, `state`, `pr.prNumber`), shown as "Last check 20-11-2026 07:00 · Daily schedule · Done · PR-2611-0042" with `StatusBadge doc="reorderRun"`, link "Run history". `trigger` schedule = "Daily schedule", manual = `startedBy.name`. Before any run the strip reads "No check has run yet". The strip also shows "Daily check: On at 07:00 / Off" (source `GET /api/reorder/settings`: `enabled`, `runHour`).
  Warning notice under the strip (inline notice, `bg-warning-subtle text-warning` + icon, not danger) (A-37, BR-RO-15), not rendered otherwise: when `enabled` is true and the saved draft owner is no longer valid (inactive or lost `pr.manage`): "The draft owner can no longer raise requisitions – the next check will fail." with link "Choose a new owner" (opens Settings; plain text without `reorder.manage`). Source: `draftOwnerValid` on `GET /api/reorder/settings`.
- **Actions:**
  | Label | Permission | Calls | Confirm | Rule |
  |---|---|---|---|---|
  | Check now (the one primary) | `reorder.manage` | `POST /api/reorder/check-now` (201 returns the run), then goes to `/inventory/reorder/runs/<id>`; invalidate items + runs | no (it only drafts) | BR-RO-11, 23 |
  | Settings (outline) | `reorder.manage` | opens dialog (`GET`/`PATCH /api/reorder/settings`) | no | BR-RO-20 |
  | Run history (link in strip) | `inventory.view` | route | no | BR-RO-22 |
  Running: button disabled "Checking…". 409 `REORDER_RUN_BUSY` → toast "A check is already running" and link to Run history (BR-RO-12). A 201 with `state: "failed"` still opens the run detail, which shows `failureReason`.
- **States:** default filter has 0 rows (but items exist) = "Nothing is low right now" + link "Show All"; empty (no item has a reorder level) = "No item has a reorder level yet" + action "Open items" (`asset.manage` only, else text only) · loading 8 skeleton rows · error = server text + Try again · no permission = shell 403 page. With filters and no match: "Nothing matches these filters" + Reset.
- **Permissions:** open with `inventory.view`; Check now and Settings not rendered without `reorder.manage` (BR-DS-27); header keeps height. fs sees list only.
- **Picture:** wireframe.

```
+----------------------------------------------------------------------+
| Reorder                               [Settings]  [ Check now ]      |
|=====                                                                 |
| Last check 20-11-2026 07:00 · Daily schedule · (Done) PR-2611-0042 · Run history |
| Daily check: On at 07:00                                             |
| (All 40) (Will be ordered 2) (Covered 1) (Needs reorder qty 1) (OK 36) |
| [search SKU / name.........]                                         |
| SKU     |Name      |Unit|Usable|On way|Projected|Level|Order|State   |
| ADC12   |ADC12 ing.| kg |  480 |    0 |    480  | 500 |1000 |[Will..]|
| FLX-01  |Flux      | kg |    5 |    0 |      5  |  20 |  –  |[Needs.]|
| DSP-02  |Die spray | l  |   40 |   60 |    100  | 100 |  –  |[Covered] PR-26..|
|                                              1 to 25 of 40   < 1 2 >  |
+----------------------------------------------------------------------+
```

### Reorder settings (dialog)
- **Purpose:** purchase turns the daily check on/off, sets the hour and who owns the drafts.
- **Pattern:** form, dialog (3 fields). Label above 36 px field, `min-h-19`; "Cancel" then primary "Save settings"; "Saving…" while submitting.
- **Fields** (source `GET /api/reorder/settings`; BR-RO-20): Daily check `enabled` (switch, default off) · Run time `runHour` (select 00:00–23:00 IST, whole hours, default 07:00, helper "Plant time (IST)") · Draft owner `draftOwner` → sent as `draftOwnerId` (searchable select, can be cleared (sends `draftOwnerId: null`) while the switch is off; options from `GET /api/reorder/owner-candidates?q=` rows `{id,name}`, active `pr.manage` holders; helper "This person edits and submits the draft"). Footer line: "Last changed by `updatedBy.name` on `updatedAt`" (audit).
- **Actions:** Save settings · `reorder.manage` · `PATCH /api/reorder/settings` `{enabled, runHour, draftOwnerId}` · no confirm · BR-RO-20. Error 400 `REORDER_OWNER_INVALID` shows under the owner field and keeps the dialog open: "Choose an active person who can manage requisitions". Turning the switch on with no owner is refused with the same error (coordinator decision), so the field error reads "Choose a draft owner before turning the daily check on"; nothing is saved.
- **States:** loading = field skeletons · error = ErrorState inside dialog + Try again · owner not set = field shows "Not set" (switch off saves fine) · no permission = dialog never opens.
- **Permissions:** `reorder.manage`.
- **Picture:** wireframe.

```
+---------------------------------------+
| Reorder settings                  [x] |
| Daily check                           |
| [ON ]  Check every day                |
| Run time (IST)                        |
| [07:00                         v]     |
| Draft owner                           |
| [Ravi K. (back office)         v]     |
| Last changed by Ravi, 18-11-2026      |
|                  [Cancel] [Save settings] |
+---------------------------------------+
```

### Run history
- **Purpose:** see every check, who started it and what it raised.
- **Pattern:** list. `PageHeader` ("Reorder runs", back link to Reorder via breadcrumb) + `FilterBar` (All · Running · Done · Failed) + `DataTable` + `Pagination`.
- **Fields** (source `GET /api/reorder/runs`; BR-RO-22): Run no. `id` via `formatDocNo` (mono accent link) · State `state` (`StatusBadge doc="reorderRun"`: running info, done success, failed danger) · Started `startedAt` (`formatDateTime`) · Started by `startedBy.name`, or "Daily schedule" when `trigger` = schedule (same wording everywhere) · Checked `itemsChecked` (right) · Raised `itemsRaised` (right) · Skipped `itemsSkipped` (right) · PR `pr.prNumber` (mono link to `pr.id`, or –) · Reason `failureReason` (one of the fixed plain texts from `api.md`, shown as is), or "Nothing to order" when done with `pr` null (truncated). Filters: quick filters by `state` (csv) plus a Started-by select (All / Daily schedule / Manual → `trigger`); default sort `startedAt` desc.
- **Actions:** Check now (primary, same as Reorder) · `reorder.manage` · BR-RO-11.
- **States:** empty = "No check has run yet" + Check now (with key) · loading · error · no permission = 403 page.
- **Permissions:** `inventory.view`; Check now needs `reorder.manage`.
- **Picture:** wireframe.

```
+----------------------------------------------------------------+
| Reorder runs                                    [ Check now ]  |
|=====                                                           |
| (All) (Running) (Done) (Failed)                                |
| Started by [All v]                                             |
| Run |State |Started         |By      |Chk|Rsd|Skp|PR      |Reason  |
| R-12|[Done]|20-11-26 07:00  |Daily s.| 40|  2|  1|PR-26.. |        |
| R-11|[Fail]|19-11-26 07:00  |Daily s.|  –|  –|  –|  –     |Owner.. |
| R-10|[Done]|18-11-26 15:10  |Ravi K. | 40|  0|  0|  –     |Nothing |
+----------------------------------------------------------------+
```

### Run detail
- **Purpose:** show what one check saw and decided, and take the next step.
- **Pattern:** detail, two-pane (owner standard): left = summary card + items table; right = facts card. `DetailHeader` (docNo `Run 12`, `StatusBadge doc="reorderRun"`, meta: started, finished, started by) + `DocumentFlow` (Run → PR → PO). PO step comes from the run payload `po` (`{id, poNumber, status}` or null; shown only when set, else the PR is the last step). The whole flow is hidden when the run has no PR. Breadcrumb last = "Run 12".
- **Fields** (source `GET /api/reorder/runs/:id`; BR-RO-22): Run no. `id` (via `formatDocNo`) · State `state` · Start / end `startedAt` / `finishedAt` · Started by `startedBy` or `trigger` · Draft owner `draftOwner.name` · Items checked `itemsChecked` · raised `itemsRaised` · skipped `itemsSkipped` · deferred `itemsDeferred` (shown next to Skipped in the facts card) · PR raised `pr.prNumber` + `pr.status` (`StatusBadge doc="pr"`; link only with `pr.manage`, else plain text) · Failure reason `failureReason` (fixed plain text, danger, failed only) · Items table from `items[]`: SKU `sku`, Name `name`, Unit `uom`, Usable `usableQty`, On the way `onTheWayQty`, Projected `projectedQty`, Level `reorderLevel`, Order qty `orderQty` (right), Result `outcome` (raised = success; skipped = neutral with the reason, e.g. "Needs a reorder qty"; "Deferred to next run" = neutral, shown when the item was left for the next run; `invalid_line` = label "Invalid line", neutral, with the reason text). Not paged. The "Run 12" in DocumentFlow is the run `id`.
- **Actions:**
  | Label | Permission | Calls | Confirm | Rule |
  |---|---|---|---|---|
  | Open PR-2611-0042 (primary, done with PR) | `pr.manage` (PR view) | route to PR `pr.id` | no | BR-RO-23 |
  | Check now (primary, failed or nothing raised, never while running) | `reorder.manage` | `POST /api/reorder/check-now` | no | BR-RO-11, 23 |
  A `running` run shows no primary button; the page polls the run until it ends. Never edit or delete a run (BR-RO-22): no More menu.
- **States:** empty items = "Nothing to order" text card · loading (`DetailHeader loading`, skeleton table) · error + Try again · 404 `REORDER_RUN_NOT_FOUND` = "Run not found" + back link · no permission = 403 page.
- **Permissions:** `inventory.view`; primary button hidden without its key (then no primary shown).
- **Picture:** wireframe.

```
+----------------------------------------------------------------------+
| < Reorder runs                                                       |
| Run 12  (Done)   07:00–07:01 · Daily schedule      [ Open PR-2611-0042 ] |
|=====                                                                 |
| Run 12 -> PR-2611-0042 (Draft) -> PO-2611-0007 (todo)   (hidden: no PR) |
| +-- Items ------------------------------+ +-- Result --------------+ |
| | SKU   |Unit|Usable|OnWay|Proj|Order|Res| | Checked   40           | |
| | ADC12 | kg | 480  |  0  |480 |1000 |[R]| | Raised    2            | |
| | FLX-01| kg |   5  |  0  |  5 |  –  |[S]| | Skipped   1  Deferred 0 | |
| +----------------------------------------+ | Failure   –            | |
|                                            +------------------------+ |
+----------------------------------------------------------------------+
```

### Item form (change, D6)
- **Pattern:** form. Parts inherited from the existing item form: purpose, states, permissions, actions (Save `asset.manage`, `PATCH /api/asset/items/:id`, BR-RO-09). Only the new fields are designed here.
- **Fields** (BR-RO-09; source `/api/asset/items` fields `reorderLevel`, `reorderQty`, `minOrderQty`, `orderMultiple`): stock-levels group, two columns from 768 px, label above, unit suffix inside each field, right-aligned, each ≥ 0, ≤ 3 decimals, whole for pcs/set. Row 1 Reorder level · Reorder qty; row 2 Min order qty · Order multiple. Helpers: Reorder qty "0 = never raised automatically"; Order multiple "0 = any amount". Read-only text for `inventory.view` only; 400 shows under the field.
- **Picture:** wireframe.

```
| Stock levels                                     |
| Reorder level            Reorder qty             |
| [ 500        kg ]        [ 1000       kg ]       |
| Min order qty            Order multiple          |
| [ 0          kg ]        [ 250        kg ]       |
```

### PR detail (change, D6)
- **Pattern:** detail. Parts inherited from the existing PR detail: everything except the items below ("Submit for approval" stays the draft owner's primary, BR-RO-23).
- **Added:** `meta` pair "Raised by" = "Run 12" (link to run detail, only when `reorderRunId` is set, read-only; source `GET /api/pr/getprdetails/:id`) · tag next to the status: `StatusBadge doc="prSource" status="reorder"` (new status doc in `status-tone.ts`, neutral tone, label "Reorder" + icon) · `DocumentFlow` first step "Run 12" (done). PR list: quick filter "Raised by reorder" = `raisedByReorder=true` on `GET /api/pr/getprs` (BR-RO-17).
- **Picture:** wireframe.

```
| PR-2611-0042 (Draft) [Reorder]        [ Submit for approval ] |
| Requester Ravi K. · Raised by: Run 12 (link) · Est. ₹2,40,000.00 |
| Run 12 -> PR-2611-0042 -> PO (todo)                           |
```

## Choices made
Moved to `../assumptions.md` (A-05, A-10, A-28, A-30..A-37, A-44, A-49) by spec-analyst, 2026-11-20.
| Question | Choice | Source |
|---|---|---|
