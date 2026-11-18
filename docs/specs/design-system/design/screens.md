# Design system — screen patterns

> status: draft. Four patterns every screen picks from. Tokens, status map, components and motion
> rules are in `../spec.md`; nothing here invents a new one. Live sample: `../preview.html`.
> Pictures in `screens/` were rendered from `preview.html` at about 950 px wide (tablet width), so
> the right-hand table columns scroll out of view; at desktop width they fit.

## Pattern list
| Pattern | Used for | Reference view (first to adopt) | Picture |
|---|---|---|---|
| list | Any queue or register | Purchase orders | `screens/option-A-light.png`, `option-A-dark.png`, `option-B-light.png`, `option-B-dark.png` |
| detail | One document | Purchase order detail | `screens/states-A-light.png` (document chain, dialog, toasts) |
| form | Create or edit | New purchase requisition | wireframe below |
| dashboard | Home page | Landing (pilot feature) | stat cards in `screens/option-A-light.png` |

Other pictures: `screens/colours-*.png` (tokens with contrast ratios), `screens/motion-A-light.png`,
`screens/today-vs-proposed-A-dark.png`.

Every pattern sits inside the shell: sidebar (icons, active tint) + top bar (fold button,
breadcrumbs, search stub, user menu). A list and its detail are separate routes, never a split panel.

### List
- **Purpose:** find a document, see its status, start the next action.
- **Components:** `PageHeader` · `FilterBar` · `DataTable` (existing) · `StatusBadge` · `Pagination` ·
  `EmptyState` · `ErrorState`.
- **Layout rules:** document number first (mono, link to detail), status second, party, item or
  summary, numbers right-aligned, dates last. One primary button in the header ("New …"), shown only
  with the create permission. Quick filters are status groups with counts; other filters sit right.
  Filter and page state live in the URL.
- **States:** loading = 8 skeleton rows under the real header row · empty with no filters = `EmptyState`
  with one create action · empty with filters = "Nothing matches these filters" + "Reset filters" ·
  error = `ErrorState` with "Try again" · no permission = the route's existing guard.
- **Motion:** row hover (4), button press (5), skeleton (6), status flash after an action taken from
  the row (7).

```
+-----------+----------------------------------------------------------+
| sidebar   | [=] Purchase > Purchase orders        [search....] (RK)  |
|           +----------------------------------------------------------+
| > Orders  | Purchase orders                    [Export] [+ New PO]   |
|           | 23 open orders worth ₹18,42,500                          |
|           | (All 41) (Waiting on me 3) (In transit 9)   [Supplier v] |
|           | PO no.  | Status    | Supplier | Item |   Qty |    Value |
|           | PO-0191 | o Draft   | ...      | ...  | 2,000 | 4,82,000 |
|           | 1 to 25 of 41                               < 1 2 >      |
+-----------+----------------------------------------------------------+
```

### Detail
- **Purpose:** read one document, see where it is in the chain, act on it.
- **Components:** `DetailHeader` · `DocumentFlow` · `StatusBadge` · cards for sections · line-items
  `DataTable` · `ErrorState` · confirm dialogs (existing `alert-dialog`).
- **Layout rules:** header = back link, mono document number, status badge, up to four meta pairs
  (supplier, date, value, raised by), actions on the right. `DocumentFlow` directly under the header.
  Then sections as cards in one column up to 1100 px wide: summary, line items, history. Money
  totals right-aligned under the lines table. Destructive actions sit in a "More" menu and always
  confirm in a dialog that names the document and what cannot be undone.
- **States:** loading = skeleton header + two skeleton cards · not found = `EmptyState` "This
  document does not exist" + link back to the list · error = `ErrorState` · action running = the
  pressed button is disabled and shows its "…ing" label.
- **Motion:** dialog (1), toast (2), button press (5), skeleton (6). The status badge changes with
  no animation of its own.

```
| < Purchase orders                                                    |
| PO-2026-0187  (o Dispatched)                 [Record receipt] [More] |
| Supplier Meenakshi Tools   Date 12 Nov 2026   Value ₹68,400.00       |
| [Requisition PR-0412 done]--[Purchase order current]--[Receipt todo] |
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
  ("Save draft", "Submit for approval"). Required fields are marked in the label. Money and quantity
  fields are right-aligned with the unit shown inside the field.
- **States:** loading reference data = skeleton fields · submitting = primary button disabled with
  "Saving…" · field error = inline message in danger tone under the field · server error = error
  toast that stays, form values kept · leaving with unsaved changes = confirm dialog.
- **Motion:** dialog (1), toast (2), button press (5). No animated field validation.

```
| New purchase requisition                                             |
| [Department v      ] [Needed by  dd Mon yyyy ]                       |
| [Reason............................................ ]               |
| Item            | Qty        | Unit | Est. rate  |                   |
| [search item v] | [   2,000] | kg   | [  241.00] | [x]               |
| [+ Add line]                              [Cancel] [Submit]          |
```

### Dashboard
- **Purpose:** show what needs the user's attention now and link straight to it.
- **Components:** `PageHeader` · `StatCard` (3 or 4 in a row) · short lists built from `DataTable`
  with `StatusBadge` · `EmptyState` per panel.
- **Layout rules:** stat cards first, each with a tone that matches its meaning (waiting = warning,
  moving = info), a one-line hint, and a link to the filtered list. Below, at most two panels of
  five rows each ("Waiting on me", "Late deliveries") with a "See all" link. No charts until a
  charts feature is specified; when they come they use `--chart-1` to `--chart-5` in order.
- **States:** each card and panel loads on its own (skeleton value, skeleton rows) · a failed card
  shows "–" with a retry icon, the rest of the page still works · zero is shown as "0" with a calm
  hint ("Nothing waiting"), not as an empty state.
- **Motion:** count-up on first load only (8), skeleton (6), row hover (4).

```
| Home                                                                 |
| [Pending approvals 7] [Open purchase orders 23] [GRNs awaiting QA 4] |
| Waiting on me                         | Late deliveries              |
| PR-0412  o Pending approval   2 days  | PO-0185  o Partly received   |
```

## Choices made
Design choices not asked of the owner are rows A-01 to A-26 in `../assumptions.md`.
