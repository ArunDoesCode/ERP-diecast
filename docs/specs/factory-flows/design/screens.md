# Factory flows — screens

> ui-ux-designer, pass 2, from `../spec.md` + parts. Standard = design-system v2 (frozen spec on
> `origin/epic/design-system-v2`): graphite + indigo, 14 px body, 36 px controls (40 px "large" on shop-floor
> screens), 44 px rows, 52 px top bar, label above field (BR-DS-28, 29). Not restated here.
> Fields: "Source" = route in `api.md` (new routes and additive fields); existing fields follow the frozen module maps.
> Exceptions to the v2 patterns, owner-requested (brief: "detail pages with a side panel"): Approvals preview beside the
> list, two-pane detail pages. Every two-pane page (screens 2, 4, 5, 7, 8, 11, 12) falls back to one column below 1100 px
> (side panel under the main column; on screen 2 the preview opens as its own page). Rows per page on every list: 25 / 50 / 100 (shared `PAGE_SIZE_OPTIONS`), default 50. `Pagination` is hidden when total ≤ the chosen page size (so one short page shows no footer).
> Pictures: **wireframes, not screenshots** (v2 components are not on this branch). Each is a plain HTML file
> plus a 1440×900 light PNG in `screens/` (built with v2 tokens). Dark: `home-dark`, `po-detail-dark`.
> In list pictures the row list is cut at 6 rows, and the paging footer is not drawn (it is hidden when total ≤ the chosen page size, see above). Status colours = v2 status map; none invented.
> Shell on every screen: sidebar in BR-FF-100 order (only entries the user holds a key for), 52 px top bar
> with the one breadcrumb trail, menu badge on Approvals (BR-FF-85: hidden at 0, "99+" above 99).

## Screen list
| # | Screen | Route | Pattern | Picture |
|---|---|---|---|---|
| 1 | Home | `/home` (`/landing` redirects) | dashboard | `screens/home.png`, `home-dark.png` |
| 2 | Approvals inbox + preview | `/approvals` | list (+ preview pane, owner-requested exception) | `screens/approvals.png` |
| 3 | Requisition list | `/purchase-requisitions` | list | `screens/pr-list.png` |
| 4 | Requisition page | `/purchase-requisitions/<id>` | detail | `screens/pr-detail.png` |
| 5 | Requisition form | `…/new`, `…/<id>/edit` | form | `screens/pr-form.png` |
| 6 | Order list | `/purchase-orders` (`/tracking` redirects) | list | `screens/po-list.png` |
| 7 | Order page | `/purchase-orders/<id>` | detail | `screens/po-detail.png`, `po-detail-dark.png` |
| 8 | Order form | `…/new`, `…/<id>/edit` | form | `screens/po-form.png` |
| 9 | Goods-receipt list | `/grn` | list | `screens/grn-list.png` |
| 10 | Receive goods: pick an order | `/grn/receive` | list (shop floor) | `screens/receive-picker.png` |
| 11 | Receive goods: form | `/grn/new?po=<id>` | form (shop floor) | `screens/receive-form.png` |
| 12 | Goods-receipt page | `/grn/<id>` | detail | `screens/grn-detail.png` |

Not new screens: Create PO supplier step (dialog on screen 4), cancel / send / delay / QA decision /
approve dialogs (BR-FF-111, existing), Setup → Screens (existing).

Rules for every screen: no permission → route guard, BR-FF-04 text "You do not have access to this document"
(detail) and nothing of the data; hidden = not rendered, header keeps its height (BR-DS-27, BR-FF-45).
Every number links to a list with exactly that many rows (BR-FF-02). Tab order = reading order; the
document number is the row's link (row click is mouse only, BR-FF-110); focus ring from the system.

### 1. Home
- **Purpose:** anyone signed in sees the work waiting for them and opens it in one click.
- **Pattern:** dashboard. `PageHeader` + grid of tiles, 4 per row at 1440, 3 at 1024, 2 on a tablet in portrait.
- **Fields (tile):** label · count · hint · optional Late / Today / Later split (new `split` prop on `StatCard`: up to three chips in existing danger / warning / neutral tones, built in this feature; needs owner yes, BR-DS-24, listed in OWNER "Decided for you"). Links: the tile body is one link; each chip is a sibling link next to it, never inside it (no nested links; tab order: body, then chips). Source: `GET /api/home/getcounts`
  (`tiles[]`: `key`, `count`, `late`/`today`/`later`, `tone` (danger / waiting / moving / neutral, server-decided), `hint {kind, date?, n?}` (absent at count 0; wording is the UI's), `error`; tile absent = no key, BR-FF-11; `data.today` IST). Count = integer; hint dates `formatDate`. No ₹ (BR-FF-33).
  Order BR-FF-13 (plant head: "Waiting for my approval" first). Tone of the left edge: warning = waiting on me,
  info = moving, **danger whenever late > 0** (e.g. Goods expected and Receipts to inspect in the picture), neutral otherwise. Never accent (BR-DS-07).
- **Actions:** tile body → target list filtered (BR-FF-12); "N late" chip → same list, Late only (BR-FF-15);
  failed count → "–" + "Try again" (BR-FF-19). Keys per tile: BR-FF-20..30; "Waiting for my approval" needs none.
- **States:** loading = skeleton value per tile · empty (nothing waiting anywhere, BR-FF-17) = one `EmptyState`
  "Nothing is waiting for you" + a link per screen the user can open · tile 0 = "0" + "Nothing waiting" (muted),
  still opens its list (BR-FF-16) · error = per tile (BR-FF-19) · no permission = tile not rendered, row closes up.
- **Permissions:** see "Who can do what" in `../spec.md`; role names never checked (BR-FF-01).
- **Picture:** `screens/home.png`, `screens/home-dark.png` (wireframe, not a screenshot).

### 2. Approvals inbox + preview
- **Purpose:** an approver reads and decides pending requests without leaving the list.
- **Pattern:** list on the left, preview pane on the right (40 %). A quick-filter strip above the list: **All / Requisition / Order / Job work** with counts (`FilterBar`, BR-DS-17; one type per document, so groups do not overlap and All = their sum; counts equal rows after click, BR-FF-02). The selected row uses the neutral selected-row tone (`bg-muted`), not accent. Below 1100 px the preview opens as the page
  under the list (Back returns to the list).
- **Fields (row):** document number (link) · type (Requisition / Order / Job work) · requester · amount
  `formatMoney` · level "x of N" (row) · waiting since `formatDateTime`. Oldest first (BR-FF-80). Source: `GET /api/approval/getMyPendingApprovals`
  (existing; adds `docNumber`, `requesterName`, `amountPaise`; default sort `requestedAt` asc; BR-APR-52). **Preview** source: `GET /api/approval/getDocumentView/:docType/:docId` (`request` level x of N + who acts, `trail`, `canAct`, header + lines + totals): number + `StatusBadge approval` · requester, date, type, requester's
  note · lines (item, qty + unit, rate, amount) · total · level "x of N" and who acts, shown as the **role label** ("Back office"), never the raw role key · approval trail with notes · "Note (required)" box.
- **Actions:** Approve (primary), Send back, Reject · `approval act` (frozen, current approver only, BR-APR-33) ·
  note required (BR-APR-37), error at the box, no dialog for Approve / Send back; **Reject confirms** in a dialog that
  names the effect (BR-FF-87) · "Open full page ›" (read-only for approvers without `pr.manage` / `po.manage`,
  BR-FF-53, 83). After acting: row leaves, next row opens (BR-FF-82); "already handled" message (BR-FF-84).
- **States:** empty = "Nothing is waiting for your approval" (BR-FF-86) · loading = 8 skeleton rows, preview skeleton ·
  error = `ErrorState` + Try again · preview load fails = `ErrorState` inside the pane · a row the viewer may not read = the pane shows "You do not have access to this document" and no data (SEC-06) · no permission = any signed-in
  user may open; other people's lists need `approval.view_others_pending` (BR-FF-89).
- **Permissions:** any signed-in; rates and amounts show because the user is in the chain (BR-FF-53).
- **Picture:** `screens/approvals.png` (wireframe, not a screenshot).

### 3. Requisition list
- **Purpose:** find a requisition, see where it stands, start a new one.
- **Pattern:** list. `PageHeader` + summary strip (`FilterBar` quick chips with counts) + `DataTable` + `Pagination`.
- **Fields:** number · date · type · requester · lines · estimate · earliest required-by · status
  (`StatusBadge pr`) (BR-FF-106). Source: `GET /api/pr/getprs` (new rows `requestedByName`, `lineCount`, `earliestRequiredBy`, `sentBack`; sort adds `estimatedAmountPaise`). Strip counts: `meta.statusCounts`; filters `mine`, `toOrder`, `bucket`. Strip groups: All, Draft, In approval, To order, Ordered,
  Closed; counts equal the rows after click (BR-FF-02, 109). Estimate hidden when no `pr.manage` (BR-FF-06). Footer hidden when total ≤ page size.
- **Actions:** "New requisition" (primary) · `pr.manage` · page `…/new` · no dialog (BR-FF-111). Chip click sets /
  clears filter (URL state). Late required-by date in danger text **with the ▲ icon** (never colour alone), as in screen 6.
- **States:** empty no filter = "No requisitions yet" + New requisition · empty with filter = "Nothing matches
  these filters" + Reset · loading = 8 skeleton rows · error = `ErrorState` + Try again · no permission = guard.
- **Permissions:** open list `pr.manage`; New button same key.
- **Picture:** `screens/pr-list.png` (wireframe, not a screenshot).

### 4. Requisition page
- **Purpose:** read one requisition, see its orders, take the next step.
- **Pattern:** detail, two panes. `DetailHeader` (number, status badge, meta, actions) + `DocumentFlow` (PR → PO → GRN; a step the viewer cannot open is plain text) + main column (lines) + side panel (BR-FF-50).
- **Fields:** header: number, status, requester, date, type, estimate. Lines: item, qty, unit, estimate, required-by,
  line status (`prLine`), "On order" = PO number link (BR-FF-43). Side panel: Totals (lines + estimate), Approvals
  (live level x of N + trail with notes), Linked documents (POs, both ways, BR-FF-42), History (BR-FF-54). Source: body
  `GET /api/pr/getprdetails/:id`; panel `GET /api/document/getpanel/pr/:id` (`totals`, `approvals`, `linked[].canOpen`, `history[]`);
  approver read-only view `getDocumentView/pr/:id`. Sent-back draft: a warning strip above the lines "Sent back by B: <note>" (C-3).
- **Actions:** per BR-FF-44 table: Submit for approval (draft, creator, `pr.manage`) · **Create PO** (approved /
  partly ordered, a pending line, `po.manage`; BR-FF-48) · Edit, Cancel in "More" (frozen rules, Cancel confirms in
  a dialog) · Approve / Reject / Send back when I am the current approver (BR-FF-44, 53).
  **Create PO**: one click makes one draft PO per supplier; no dialog unless a pending line has no default
  supplier, then a dialog "Supplier for die lube" per such line (BR-FF-49) · result: one PO → opens it, several →
  stays here, success toast "2 draft orders made" + both in Linked documents; partial failure keeps the made ones
  and names the failed supplier (BR-FF-58); 409 → page reloads (BR-FF-59).
- **States:** loading = skeleton header + lines + panel · not found = BR-FF-04 text + link to list · error =
  `ErrorState` · no permission = BR-FF-04 / approver read-only (BR-FF-53) · running = button "Making orders…".
- **Permissions:** `pr.manage`, or approver read (BR-APR-51). Linked PO is text if no `po.manage` and not in chain (BR-FF-03).
- **Picture:** `screens/pr-detail.png` (wireframe, not a screenshot).

### 5. Requisition form
- **Purpose:** raise or edit a requisition on a full page.
- **Pattern:** form, two panes: details + lines on the left, Summary panel on the right (lines, estimate).
- **Fields:** type, required-by, notes; lines: item (search select), qty with the unit shown inside the field ("1,000 kg", right-aligned, whole numbers for
  pieces), estimate rate with ₹ inside the field, computed estimate. No separate Unit column. Source: frozen `POST /api/pr/createpr`, `PATCH /api/pr/updatepr`, then `POST /api/approval/submitRequest`; nothing new in `api.md`.
- **Actions:** Cancel · Save draft · **Save and submit** (primary, creator only, BR-FF-46, 47) · `pr.manage` · create
  then submit (BR-FF-05). Failed save: stays, error at field (BR-FF-56); refused submit: draft saved, page opens with
  reason (BR-FF-57). Leaving with changes: "Leave without saving?" dialog (BR-FF-112). Running = "Saving…".
- **States:** loading items = skeleton fields · empty lines = one blank row · error = `ErrorState` · no permission = guard.
- **Permissions:** `pr.manage`; "Save and submit" hidden for non-creators.
- **Picture:** `screens/pr-form.png` (wireframe, not a screenshot).

### 6. Order list
- **Purpose:** find an order, see late and unsent ones, start a new one.
- **Pattern:** list with summary strip, as screen 3.
- **Fields:** number · date · supplier · lines · total · due date (late = danger text + icon + "N days late") ·
  received % by qty · status (`StatusBadge po`) (BR-FF-107). Strip: All, Draft, In approval, To send, Open, Late.
  Source: `GET /api/po/getpos` (new rows `lineCount`, `receivedPct`; `meta.lateCount`; filters `mine`, `bucket`; sort adds `dueDate`, `totalAmountPaise`; Late = frozen BR-PO-19 on the IST day).
- **Actions:** "New purchase order" (primary) · `po.manage` · `…/new`. Chips as screen 3.
- **States / permissions:** as screen 3; key `po.manage`; empty text "No purchase orders yet".
- **Picture:** `screens/po-list.png` (wireframe, not a screenshot).

### 7. Order page
- **Purpose:** read one order, receive against it, follow its chain.
- **Pattern:** detail, two panes (BR-FF-103). `DetailHeader` + `DocumentFlow` as screen 4.
- **Fields:** header: number, status, supplier, date, expected, created by. Lines: item, ordered, received, **open**
  (bold), rate, GST, amount (BR-FF-43). Side panel: Totals (subtotal, GST, total, received %), Approvals, Linked
  documents (From PR, Receipts with QA status), History (sent, reminders, confirmation, delay, cancel / close with
  reason). Source: body `GET /api/po/getpodetails/:id` (lines add `pendingQaQty`, `openQty`); panel
  `GET /api/document/getpanel/po/:id`; approver read-only view `getDocumentView/po/:id`.
- **Actions:** BR-FF-44: Submit for approval (draft, creator) · Send to supplier (approved, `po.manage`, existing dialog)
  · **Receive goods** (dispatched / partly received, open qty, `grn.edit_draft`) → screen 11 with this PO ·
  Approve / Reject / Send back (current approver) · Edit, Cancel, Delay, Close in "More" (frozen, confirmed in dialogs).
- **States:** as screen 4. Approver without `po.manage`: read-only, no Edit / Cancel / Send (BR-FF-53).
- **Permissions:** `po.manage` or approver read. Receipts link needs `grn.view`.
- **Picture:** `screens/po-detail.png`, `screens/po-detail-dark.png` (wireframe, not a screenshot).

### 8. Order form
- **Purpose:** create or edit an order on a full page (from a requisition, or blank).
- **Pattern:** form, two panes: details + lines left; Totals and "From PR" panel right.
- **Fields:** supplier, expected delivery, notes; lines: item, qty with the unit inside the field, rate with ₹ inside the field (right-aligned), GST, amount. No separate Unit column.
  Source: frozen `POST /api/po/createpo` (one call per supplier), `PATCH /api/po/updatepo`, then `submitRequest`. "From PR-…" = `getpanel/po/:id` `linked[]`.
- **Actions:** Cancel · Save draft · **Save and submit** (primary, creator only) · `po.manage` · BR-FF-46, 47, 56, 57, 112.
- **States:** as screen 5. **Permissions:** `po.manage`.
- **Picture:** `screens/po-form.png` (wireframe, not a screenshot).

### 9. Goods-receipt list
- **Purpose:** see receipts and their QA state; the store keeper starts receiving.
- **Pattern:** list with summary strip.
- **Fields:** number · date · PO number (link only with `po.manage` or approver read, BR-FF-03) · supplier ·
  challan · lines · QA status (`StatusBadge grnQa`, map below) · status (`grn`) (BR-FF-108). Never money. Strip: All, Draft,
  QA pending, Done, Rejected. Source: `GET /api/grn/getgrns` (new rows `supplierName`, `lineCount`, `qaSummary`; filter `bucket`; `meta.statusCounts`).
- **QA column map** (`qaSummary` of the receipt's lines; the rule is in `../spec.md`, DES-002; waived counts as passed):
  | qaSummary | Badge | Tone |
  |---|---|---|
  | any line pending | Pending | warning |
  | all passed / waived | Passed | success |
  | all failed | Failed | danger |
  | some failed, none pending (mixed) | Partly accepted | warning (new `grnQa` entry in `status-tone.ts`, existing tone and the same icon as the `grn` "Partly accepted") |
- **Actions:** **Receive goods** (primary, `grn.edit_draft`, large 40 px) → screen 10 (BR-FF-60).
- **States:** empty = "No goods receipts yet" + Receive goods (if key) · others as screen 3.
- **Permissions:** `grn.view`; button `grn.edit_draft`.
- **Picture:** `screens/grn-list.png` (wireframe, not a screenshot).

### 10. Receive goods: pick an order
- **Purpose:** the store keeper finds the delivery's order fast. Tablet use.
- **Pattern:** list, shop floor: normal 44 px rows, v2 "large" 40 px controls (Receive buttons, search box, chips). No exception to the v2 size table.
- **Fields:** order number · supplier · due (late = danger + "N days late", today = warning) · "Waiting for" item +
  open qty + unit for every line (BR-FF-61). **No rates or amounts** (BR-FF-62). Search by PO number or supplier
  (BR-FF-63). Chips All / Late / Today. Source: `GET /api/grn/getreceivablepos` (`grn.edit_draft`; rows `poNumber`, `supplierName`, `dueDate`, `isLate`, `lines[]` with `itemName`, `uom`, `openQty`; `q`, `bucket`, sort `dueDate`).
- **Actions:** "Receive" per row (the row is also a link) · `grn.edit_draft` → screen 11 · no dialog. Home tile
  "Goods expected" lands here (BR-FF-71).
- **States:** empty = "No orders are waiting for goods" + (only with `po.manage`) link "Orders to send"
  (BR-FF-70) · loading = skeleton rows · error = `ErrorState` · no permission = guard.
- **Permissions:** `grn.edit_draft`.
- **Picture:** `screens/receive-picker.png` (wireframe, not a screenshot).

### 11. Receive goods: form
- **Purpose:** record what arrived against one order. Tablet use: few fields, large targets.
- **Pattern:** form, two panes: delivery + lines left, order summary + earlier receipts right (below the form at 1024).
- **Fields:** challan number (required, unique per supplier), vehicle, driver · per line: item, ordered, received so
  far, open, **arrived** box (empty at start, unit shown inside, 40 px, right-aligned; whole numbers for pieces,
  BR-FF-73) · side: order number, supplier, due, status, earlier receipts. No money. Source: order summary `GET /api/grn/getreceivablepos?poId=<id>`; earlier receipts `getpanel/po/:id` `linked[]`; save `POST /api/grn/creategrn`.
- **Actions:** "Fill open quantity" (secondary, fills only empty boxes, BR-FF-64) · Cancel · **Save goods receipt**
  (primary) · `grn.edit_draft` · existing GRN create (BR-FF-67) → GRN page. Errors stay in the form with entries
  kept (BR-FF-69); over-order = warning under the box, no block (BR-FF-66); no quantity = "Enter at least one
  arrived quantity" (BR-FF-65); order closed meanwhile → message, back to screen 10 (BR-FF-72).
- **States:** loading = skeleton lines · order not receivable on open = message + back to picker · error =
  `ErrorState` · running = "Saving…" · leaving with entries = "Leave without saving?" (BR-FF-112).
- **Permissions:** `grn.edit_draft`.
- **Picture:** `screens/receive-form.png` (wireframe, not a screenshot).

### 12. Goods-receipt page
- **Purpose:** read a receipt, see its QA state, inspect.
- **Pattern:** detail, two panes. `DetailHeader` + `DocumentFlow` as screen 4: a step the viewer cannot open (Requisition and Order for a viewer without `pr.manage` / `po.manage`, BR-FF-03) is plain text, as in the picture. No Approvals block (BR-FF-52).
- **Fields:** header: number, status, supplier, order, challan, received date. Lines: item, arrived, accepted,
  rejected, QA status (`grnQa`), per-line Inspect. Side panel: Totals (arrived / accepted / rejected, no money,
  BR-FF-51), Linked documents (order as text when the viewer cannot open it, BR-FF-03, 55), History (QA, bypass,
  correction rows). Source: body `GET /api/grn/getgrndetails/:id`; panel `GET /api/document/getpanel/grn/:id` (`totals` no money, `linked[]`, `history[]`; `approvals` null).
- **Actions:** **Inspect** (primary, any line pending, `grn.qa_decide`) opens the first pending line's QA dialog;
  each pending line also has "Inspect" (C-4) · Edit / Delete draft, Bypass, Correction in "More" (frozen keys).
- **States:** as screen 4. **Permissions:** `grn.view`; QA picture shows viewer Q.
- **Picture:** `screens/grn-detail.png` (wireframe, not a screenshot).

## Choices made
Moved to `../assumptions.md` (A-27..A-38; pre-freeze round 1: A-64, A-68..A-79).
| Question | Choice | Source |
|---|---|---|
