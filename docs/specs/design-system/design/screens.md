# Design system — screen patterns

> status: draft. Four patterns every screen picks from. Tokens, status map, components and motion
> rules are in `../spec.md`; nothing here invents a new one. Live sample: `../preview.html`.
> Rule ids (`BR-DS-NN`) point into the spec's Rules table.
> Pictures in `screens/` were rendered from `preview.html` at about 950 px wide (tablet width), so
> the right-hand table columns scroll out of view; at desktop width they fit.

## Pattern list
| Pattern | Used for | Reference view (first to adopt) | Picture |
|---|---|---|---|
| list | Any queue or register | Purchase orders | `screens/option-A-light.png`, `option-A-dark.png` |
| detail | One document | Purchase order detail | `screens/states-A-light.png` (document chain, dialog, toasts) |
| form | Create or edit | Purchase order create / edit | wireframe below |
| dashboard | Home page | none in this work (home dashboard feature) | stat cards in `screens/option-A-light.png` |

Other pictures: `screens/colours-*.png` (tokens with contrast ratios), `screens/motion-A-light.png`,
`screens/today-vs-proposed-A-dark.png`.

Every pattern sits inside the shell: sidebar (icons, active tint and bar — BR-DS-21) + top bar (fold
button, the one breadcrumb trail — BR-DS-22, search stub, user menu). A list and its detail are
separate routes, never a split panel. Rules that hold on every pattern: tokens only (BR-DS-01), light
and dark (BR-DS-15), one `h1` (BR-DS-22), solid blue focus ring (BR-DS-20), colour weight only in the
seven places (BR-DS-26), nothing rendered that the user has no permission for (BR-DS-27).

### List
- **Purpose:** find a document, see its status, start the next action.
- **Components:** `PageHeader` · `FilterBar` · `DataTable` (existing) · `StatusBadge` · `Pagination` ·
  `EmptyState` · `ErrorState`.
- **Layout rules:** document number first (mono, accent link to detail — BR-DS-19, BR-DS-26), status
  second (BR-DS-03, BR-DS-05), party, item or summary, numbers right-aligned, dates last (BR-DS-18).
  Header row on the `--table-header` tint. One primary button in the header ("New …", BR-DS-06).
  Quick filters are status groups with counts, the selected one solid accent (BR-DS-07); other
  filters sit right. Filter and page state live in the URL. Shape of the page: BR-DS-17.
- **States:** loading = 8 skeleton rows under the real header row · empty with no filters = `EmptyState`
  with one create action · empty with filters = "Nothing matches these filters" + "Reset filters" ·
  error = `ErrorState` with "Try again" (BR-DS-17, skeleton BR-DS-14).
- **Permission-hidden (BR-DS-27):** no create permission → no "New …" button, also not in the empty
  state (its text stays); no export permission → no "Export"; row actions the user may not take are
  not rendered; no view permission → the route's existing guard, nothing of the page shows.
- **Motion (BR-DS-09):** row hover (4), button press (5), skeleton (6), status flash after an action
  taken from the row (7, BR-DS-12).

```
+-----------+----------------------------------------------------------+
| sidebar   | [=] Purchase > Purchase orders        [search....] (RK)  |
|           +----------------------------------------------------------+
| > Orders  | Purchase orders                    [Export] [+ New PO]   |
|           | 23 open orders worth ₹18,42,500                          |
|           | (All 41) (Waiting on me 3) (In transit 9)   [Supplier v] |
|           | PO no.  | Status    | Supplier | Item |   Qty |    Value |
|           | PO-0191 | ◌ Draft   | ...      | ...  | 2,000 | 4,82,000 |
|           | 1 to 25 of 41                               < 1 2 >      |
+-----------+----------------------------------------------------------+
```

### Detail
- **Purpose:** read one document, see where it is in the chain, act on it.
- **Components:** `DetailHeader` · `DocumentFlow` · `StatusBadge` · cards for sections · line-items
  `DataTable` · `ErrorState` · confirm dialogs (existing `alert-dialog`).
- **Layout rules:** header = back link, mono document number, status badge, up to four meta pairs
  (supplier, date, value, raised by), actions on the right. `DocumentFlow` directly under the header;
  its current step has the solid accent label strip and `aria-current="step"` (BR-DS-07).
  Then sections as cards in one column up to 1100 px wide: summary, line items, history. Money
  totals right-aligned under the lines table. Destructive actions sit in a "More" menu and always
  confirm in a dialog that names the document and what cannot be undone (BR-DS-08).
- **States:** loading = skeleton header + two skeleton cards · not found = `EmptyState` "This
  document does not exist" + link back to the list · error = `ErrorState` · action running = the
  pressed button is disabled and shows its "…ing" label (no spinner — BR-DS-10).
- **Permission-hidden (BR-DS-27):** an action the user may not take is not rendered; a "More" menu
  with nothing left in it is not rendered; a chain step whose document the user may not open is
  plain text, not a link; money meta the role may not see follows the module's existing rule.
- **Motion (BR-DS-09):** dialog (1), toast (2), button press (5), skeleton (6). The status badge
  changes with no animation of its own.

```
| < Purchase orders                                                    |
| PO-2026-0187  (→ Dispatched)                 [Record receipt] [More] |
| Supplier Meenakshi Tools   Date 12 Nov 2026   Value ₹68,400.00       |
| [Requisition PR-0412 done]--[#Purchase order# now]--[Receipt todo]   |
| +- Line items ----------------------------------------------------+ |
| | Item | Qty | Rate | Amount                                      | |
| +- History ---------------------------------------------------------+ |
```

### Form
- **Purpose:** create or edit one document with as little typing as possible.
- **Components:** `PageHeader` (page forms) or dialog title (short forms) · existing `Form`,
  `FloatingLabelInput`, `SearchableSelect` per the `ui-form-standards` skill · line-items table ·
  `ErrorState` for load failures.
- **Layout rules:** up to six fields = dialog; more, or any line items = its own page. Fields in two
  columns from 768 px, one column below. Every field keeps `min-h-19` so errors do not shift the
  layout. Actions bottom right: secondary "Cancel" then one primary button named for what it does
  ("Save draft", "Submit for approval", BR-DS-06). Required fields are marked in the label. Money
  and quantity fields are right-aligned with the unit shown inside the field (BR-DS-18). Field
  borders use `--input` (3:1, BR-DS-02); the focused field shows the ring (BR-DS-20).
- **States:** loading reference data = skeleton fields · submitting = primary button disabled with
  "Saving…" · field error = inline message in danger tone under the field · server error = error
  toast, form values kept · reference data fails to load = `ErrorState` with "Try again" · no
  options to pick from = the select says so in plain words · leaving with unsaved changes = confirm
  dialog.
- **Permission-hidden (BR-DS-27):** no create or edit permission → the entry button is not rendered
  and the route's existing guard blocks the page; a field or a submit button the role may not use
  ("Submit for approval") is not rendered, never shown disabled without a reason.
- **Motion (BR-DS-09):** dialog (1), toast (2), button press (5). No animated field validation.

```
| New purchase order                                                   |
| [Supplier v        ] [Expected by  dd Mon yyyy ]                     |
| [Notes............................................. ]               |
| Item            | Qty        | Unit | Rate       |                   |
| [search item v] | [   2,000] | kg   | [  241.00] | [x]               |
| [+ Add line]                              [Cancel] [Submit]          |
```

### Dashboard
- **Purpose:** show what needs the user's attention now and link straight to it.
- **Components:** `PageHeader` · `StatCard` (3 or 4 in a row) · short lists built from `DataTable`
  with `StatusBadge` · `EmptyState` per panel.
- **Layout rules:** stat cards first, each with a status tone that matches its meaning (waiting =
  warning, moving = info; never the accent — BR-DS-07), a 3 px left edge in that tone (BR-DS-26), a
  one-line hint, and a link to the filtered list. Below, at most two panels of
  five rows each ("Waiting on me", "Late deliveries") with a "See all" link. No charts until a
  charts feature is specified; when they come they use `--chart-1` to `--chart-5` in order.
- **States:** each card and panel loads on its own (skeleton value, skeleton rows) · a failed card
  shows "–" with a retry icon, the rest of the page still works · zero is shown as "0" with a calm
  hint ("Nothing waiting"), not as an empty state.
- **Permission-hidden (BR-DS-27):** a card or panel for a module the user may not see is not
  rendered and the row closes up; no card shows a count the user could not open.
- **Motion (BR-DS-09):** count-up once per mount (8, BR-DS-13), skeleton (6, BR-DS-14), row hover (4).

```
| Home                                                                 |
| [Pending approvals 7] [Open purchase orders 23] [GRNs awaiting QA 4] |
| Waiting on me                         | Late deliveries              |
| PR-0412  ◷ Pending approval   2 days  | PO-0185  → Partly received   |
```

## Choices made
Design choices not asked of the owner are rows A-01 to A-45 in `../assumptions.md`.
