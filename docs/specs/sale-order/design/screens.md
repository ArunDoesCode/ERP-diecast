# Sale order — screens

> Written by ui-ux-designer from `../spec.md`. Fields name their endpoint and field from `api.md` (18 endpoints, written). Patterns, components and tokens come from the
> `design-system` skill. Pictures are wireframes, not screenshots (the caller asked for ASCII; no running app).
> Owner standards applied everywhere: two-pane detail, full lists, full-page forms, label above field, keyboard
> reachable (Tab order = reading order; Enter submits; Esc closes dialogs), light + dark (tokens only).

## Screen list
| Screen | Route | Pattern | Picture |
|---|---|---|---|
| Customer list | `/customers` | list | wireframe 1 |
| Customer form | `/customers/new`, `/customers/[id]/edit` | form, full page | wireframe 2 |
| Sale order list | `/sale-orders` | list | wireframe 3 |
| Sale order form | `/sale-orders/new`, `/sale-orders/[id]/edit` | form, full page | wireframe 4 |
| Sale order detail | `/sale-orders/[id]` | detail, two-pane | wireframe 5 |
| Explosion | `/sale-orders/[id]/explosion` (`?run=E1` for an old one) | detail (table) | wireframe 6 |

Small dialogs, no own picture: Hold / Close / Cancel (reason textarea 3–500 chars, label above, names the SO,
BR-SO-16/17/18) · Deactivate customer (confirm, names it, BR-SO-02) · Confirm SO (names it, BR-SO-12).
New status entries in `status-tone.ts`, existing tones only (see Choices made).

## Status map (same status = same colour everywhere)
| Doc key | Value | Label | Tone |
|---|---|---|---|
| `so` | draft / confirmed / on_hold / closed / cancelled | Draft / Confirmed / On hold / Closed / Cancelled | neutral / info / warning / closed / closed |
| `soSnapshot` (derived from `status` + `outOfDate`) | current / out_of_date / superseded | Current / Out of date / Superseded | success / warning / closed |
| `customer` | active / inactive | Active / Inactive | existing `ACTIVE` map |
| `soRowTag` | no_bom / buy_as_is / inactive / loop | No BOM / Buy as is / Inactive item / BOM loop (via `StatusBadge doc="soRowTag"`) | neutral / neutral / closed / danger |
Linked PR / SCO use the existing `pr` / `sco` badges.

### Customer list
- **Purpose:** back office finds a customer, adds or deactivates one.
- **Pattern:** list.
- **Fields:** name (accent link to edit) · state · GSTIN (mono, `–` if none) · status badge (`isActive`) · source: `GET /api/customers` (`name`, `stateCode` shown as state name, `gstin`, `isActive`; query `q`, `isActive`; sort `name`; BR-SO-01).
- **Filters (URL/nuqs):** chips Active (default) / Inactive / All; name search. Page size 10, 1–100.
- **Actions:** "Add customer" (primary) · `customer.manage` · goes to form · BR-SO-01. Row "Deactivate" / "Activate" in a row menu · `customer.manage` · confirm dialog · BR-SO-02.
- **States:** empty "No customers yet" + Add customer · filters "Nothing matches these filters" + Reset · loading 8 skeleton rows · error `ErrorState` + Try again · no `so.view` → shell no-access page.
- **Permissions:** `so.view` opens (address and GSTIN are `so.view` data). Without `customer.manage`: Add and row menu not rendered.
- **Picture:** wireframe 1.
```
+------------------------------------------------------------+
| Customers                                  [ Add customer ]|
| [Active][Inactive][All]            [search name.........]  |
| Name              State        GSTIN            Status     |
| Rane Brakes       Tamil Nadu   33AABCR1234F1Z5  Active  ...|
| Sundaram Clayton  Karnataka    –                Inactive ...|
| 1 to 10 of 14                        < 1 2 >  10 per page  |
+------------------------------------------------------------+
```

### Customer form
- **Purpose:** create or edit one customer.
- **Pattern:** form, full page (owner standard; the skill would allow a dialog for ≤ 6 fields). `PageHeader` title "Add customer" / "Edit Rane Brakes". Two columns from 768 px.
- **Fields:** Name* (≤ 120, unique ignoring case) · State* (select, shows GST code "Karnataka (29)") · GSTIN (15 chars, uppercase, mono; hint "First two digits must match the state") · Address* (textarea, full width) · Active (edit only, switch). Source: `GET /api/customers/:id`; save `POST /api/customers` / `PATCH /api/customers/:id` with `name`, `stateCode`, `address`, `gstin`, `isActive` (BR-SO-01).
- **Actions:** "Cancel" (back) then "Save customer" (primary; "Saving…") · `customer.manage` · POST / PATCH · no dialog · BR-SO-01, 03. 409 duplicate name and 400 GSTIN-vs-state show under the field.
- **States:** loading skeleton fields (edit) · error `ErrorState` (404 "Customer not found") · no `customer.manage` → shell no-access.
- **Permissions:** `customer.manage`.
- **Picture:** wireframe 2.
```
+------------------------------------------------------------+
| Add customer                                               |
| Name *                       State *                       |
| [Rane Brakes............]    [Tamil Nadu (33)        v]    |
| GSTIN                        Address *                     |
| [33AABCR1234F1Z5........]    [Plot 4, Sipcot Hosur.....]   |
| First two digits = state     [...........................]  |
|                                    [ Cancel ] [Save customer]|
+------------------------------------------------------------+
```

### Sale order list
- **Purpose:** back office / planning sees all orders and what each needs next.
- **Pattern:** list.
- **Fields:** SO no. (mono accent link to detail) · status (`StatusBadge doc="so"`) · customer · customer PO no. · order date · next delivery (earliest open line, `formatDate`) · value (`formatMoney`, right) · explosion (`soSnapshot` badge, or `–` when none). Source: `GET /api/sale-orders` (`soNumber`, `status`, customer name, `customerPoNumber`, `orderDate`, `totalAmountPaise`; `nextDeliveryDate`, `snapshotStatus` (current / out_of_date / superseded / none; `none` shows `–`)); chip counts from `meta.statusCounts`. Filters map to `status` (multi), `customerId`, `q`; sort `soNumber`, `orderDate`, `createdAt`, `totalAmountPaise`; default `createdAt desc` (BR-SO-05, 06, 11, 38).
- **Filters (URL/nuqs):** chips Open (draft + confirmed + on hold, default) / Draft / Confirmed / On hold / Closed / Cancelled / All with counts (`meta.statusCounts`); customer select; search (SO no. or customer PO). Default sort newest first. Page size 10, 1–100.
- **Actions:** "New sale order" (primary) · `so.manage` · goes to form · BR-SO-05.
- **States:** empty "No sale orders yet" + New sale order · filters "Nothing matches these filters" + Reset · loading 8 skeleton rows · error `ErrorState` + Try again · no `so.view` → shell no-access.
- **Permissions:** `so.view` opens (value is `so.view` data, BR-SO-51). No `so.manage`: New not rendered.
- **Picture:** wireframe 3.
```
+----------------------------------------------------------------------+
| Sale orders                                       [ New sale order ] |
| [Open 12][Draft][Confirmed][On hold][Closed][Cancelled][All] Cust[v] |
|                                              [search no. / cust PO]  |
| SO no.       Status    Customer    Cust PO  Ordered Next del. Value   Explosion |
| SO-2611-0002 Draft     Rane Brakes RB/4480  20 Nov  15 Feb 27 2,10,000 -         |
| SO-2611-0001 Confirmed Rane Brakes RB/4471  18 Nov  15 Jan 27 1,85,000 Out of date|
| 1 to 10 of 12                                  < 1 2 >  10 per page  |
+----------------------------------------------------------------------+
```

### Sale order form
- **Purpose:** enter a customer's order (draft), or edit it within the limits of its status.
- **Pattern:** form, full page. `PageHeader` "New sale order" / "Edit SO-2611-0001". Header fields in two columns, then a full-width lines table with "Add line".
- **Header fields:** Customer* (select, active only) · Order date* (picker, not future, default today) · Customer PO no. (≤ 50) · Customer PO date · Notes (textarea) · **Ship to** (optional, a checkbox labelled "Ship to a different address" that reveals the two fields; wireframe uses the same label): Ship-to address (≤ 300) + Ship-to state (select, required once an address is typed; empty = customer address is used, hint shown). Source: `POST /api/sale-orders` / `PATCH …/:id` (`customerId`, `orderDate`, `customerPoNumber`, `customerPoDate`, `notes`, `shipToAddress`, `shipToStateCode`); customer options `GET /api/customers?isActive=true&q=` (BR-SO-06).
- **Line fields (table, one row each):** Item* (searchable select, active items; SKU + name) · Unit (read-only, from item) · Qty* (right, unit suffix; whole for pcs / set, else 3 decimals) · Unit price* (₹, right, 2 decimals, 0 allowed) · Delivery date* (picker, not before today) · GST %* (select from the supplier GST set, default 0; stored for dispatch, no tax is added to the SO, hint "Stored only, no tax shown here") · Line value (read-only, calculated) · remove button (icon, labelled). Edit of a confirmed SO adds a read-only "Delivered" column. Footer: SO value (`formatMoney`, right, "calculated"). Source: `lines[]` (`itemId`, `qty`, `unitPricePaise`, `gstPercent`, `deliveryDate`, `notes`; edits send `id`, `removeLineIds`, `editVersion`); `deliveredQty` from `GET /api/sale-orders/:id` (BR-SO-07, 08, 11). 409 codes `STALE_VERSION` ("Someone changed this order. Reload." + Reload button), `SO_FIELD_LOCKED`, `QTY_BELOW_DELIVERED`, `LIVE_DOCUMENTS_LINKED`, `SO_NOT_EDITABLE` map to the messages below.
- **Actions:** "Cancel" then "Save draft" (primary; "Saving…") on new and draft edit; "Save changes" on a confirmed SO · `so.manage` · POST / PATCH · no dialog · BR-SO-05, 10, 13. Errors: duplicate customer PO and same item + same date show 409 / 400 messages on the field or row; line errors name the row number; zero lines → "Add at least one line".
- **Confirmed SO limits (BR-SO-13, 14):** customer select and each existing line's Item are read-only text; Qty min = delivered; qty drop or line remove refused by the server with 409 listing PR / SCO numbers, shown as an inline banner above the table (numbers are links); remove button not rendered on a line that has delivered qty. On hold / closed / cancelled: route redirects to detail.
- **States:** loading skeleton fields · error `ErrorState` (404 "Sale order not found") · no `so.manage` → shell no-access.
- **Permissions:** `so.manage`.
- **Picture:** wireframe 4.
```
+----------------------------------------------------------------------+
| New sale order                                                       |
| Customer *             Order date *        Customer PO no.           |
| [Rane Brakes      v]   [20 Nov 2026]       [RB/4471........]         |
| Customer PO date       Notes              [ ] Ship to a different address|
| [18 Nov 2026]          [..................................]         |
| Lines                                                                |
| Item *         Unit Qty *   Price *   Delivery * GST%  Value |
| HSG-MC Housing pcs [1,000] [185.00] [15 Jan 27] [18 v] 1,85,000 [x]|
| [ + Add line ]                       SO value (calculated) 1,85,000.00|
|                                       [ Cancel ] [ Save draft ]      |
+----------------------------------------------------------------------+
```

### Sale order detail
- **Purpose:** see one order, take its next step, follow it to the PRs / SCOs it caused.
- **Pattern:** detail, two-pane (owner standard; overrides the skill's one-column default). Left pane wide, right pane narrow (≤ 420 px); the panes stack below a 1280 px viewport; the Lines table scrolls sideways inside its card.
- **DetailHeader:** docNo `SO-2611-0001` · `StatusBadge doc="so"` · meta: customer, customer PO, order date, ship-to (only if set), value (`so.view`), confirmed by / at; source `GET /api/sale-orders/:id` · back to `/sale-orders`. Then `DocumentFlow`: SO → Explosion E2 (soSnapshot badge) → PR-… / SCO-… (one step per created PR / SCO with its own badge, and one "Delivery note DN/26-27/1" step per delivery note with the `dn` status of the dispatch design, link to the note; one step only = not rendered, BR-SO-49).
- **Left pane cards:** (1) *Lines* table: # · item (SKU + name) · qty + unit · delivered · open qty · unit price · GST % · delivery · line value; footer SO value. (2) *Notes*. (3) *Customer*: name, state, GSTIN, address, and ship-to address + state when set.
- **Right pane panels:** (1) *Explosion:* latest run number, who and when, `soSnapshot` badge; when out of date a warning line "Out of date: order or a BOM changed. Re-run before creating drafts."; link "Open E2"; source `snapshotStatus` on `GET /api/sale-orders/:id`. Older runs listed as "E1 Superseded" links, from `GET /api/sale-orders/:id/explosions`. Empty: "Not exploded yet." (2) *Raised documents* (`raisedDocuments[{type, id, number, status, runNo}]`): PR / SCO number (mono accent link) · type · `StatusBadge` · run no. (E1); empty "Nothing raised yet." (3) *Delivery notes:* note no. (mono accent link to `/delivery-notes/<id>`) · date · status badge (dispatch design) · lines / qty; list of this SO's notes (BR-DSP-38, source: dispatch `api.md` notes list filtered by SO); empty "Nothing dispatched yet." + "Dispatch" link when allowed; panel needs `dispatch.view`, otherwise not rendered. (4) *Activity:* audit trail from `GET /api/sale-orders/:id/audit` (columns `at`, `action`, actor, before → after), who · when · action · before → after (BR-SO-52).
- **Next step (one primary in DetailHeader, BR-SO-49):** draft → "Confirm" (`so.manage`, confirm dialog, "Confirming…") · confirmed, no run → "Explode BOM" (primary, `so.explode`, "Exploding…", then opens the new run) · confirmed, run current → "Create draft PRs / SCOs" (`so.explode`, link to explosion screen) · confirmed, run out of date → "Explode BOM" (re-run) · on hold → "Resume" (`so.manage`) · closed / cancelled → none. On a confirmed SO with any line open qty > 0 a second button **"Dispatch"** (outline) sits beside the main one: `dispatch.manage`, opens `/delivery-notes/new?so=<id>`, needs no explosion (BR-DSP-37). It becomes the primary button only when it is the user's only next step (user holds `dispatch.manage` but not `so.explode`, or the explosion step is done and nothing is left to raise); never two primaries. Not shown on a fully delivered, on-hold, closed or cancelled SO. A user without the key sees no button and a plain muted line ("Waiting for confirmation" / "Waiting for explosion").
- **More menu:** Edit (draft, confirmed; `so.manage`, BR-SO-10, 13) · Hold (confirmed; dialog buttons "Hold order" / "Keep order", BR-SO-16) · Close (confirmed / on hold; dialog buttons "Close order" / "Keep order", BR-SO-17) · Cancel (not closed / cancelled; dialog buttons "Keep order" and "Cancel sale order" (danger), BR-SO-18; 409 with live PR / SCO numbers shown as an error toast with links, BR-SO-19). All dialogs name the SO and need the reason.
- **States:** loading `DetailHeader loading` + skeleton cards · error `ErrorState` + Try again (404) · no `so.view` → shell no-access · closed: banner "Closed — fully delivered" (`closeKind` = fully_delivered, no reason) or "Closed by hand" with reason, who, when (`closeKind` = manual); cancelled: banner with reason, who, when; all edit actions gone.
- **Permissions:** `so.view` opens; price columns and value are `so.view` only. Coordinator decision: the floor supervisor does not hold `so.view`, so prices stay off the floor (spec seed roles line says `fs` has it: spec-analyst to align `spec.md`). Hidden when missing: Confirm / Edit / Hold / Resume / Close / Cancel (`so.manage`); Explode / Create (`so.explode`).
- **Picture:** wireframe 5.
```
+----------------------------------------------------------------------+
| < Sale orders  SO-2611-0001 [Confirmed]     [Explode BOM] [Dispatch] [More v]|
| Rane Brakes · PO RB/4471 · Ordered 18 Nov 26 · Value 1,85,000.00     |
| SO-2611-0001 > Explosion E2 [Out of date] > PR-2611-0007 > DN/26-27/1 |
| +-------------------------------------------+ +--------------------+ |
| | Lines                                     | | Explosion          | |
| | Item     Qty  Deliv. Open Price  Del. Value| | E2 · Arun · 20 Nov | |
| | HSG-MC 1,000 pcs  0  1,000 185.00 15Jan.. | | ! Out of date...   | |
| +-------------------------------------------+ | Raised documents   | |
| | Notes · Customer                          | | PR-2611-0007 Draft | |
| |                                           | | Delivery notes     | |
| +-------------------------------------------+ | Activity           | |
|                                               +--------------------+ |
+----------------------------------------------------------------------+
```

### Explosion
- **Purpose:** planning / purchase sees what the order needs level by level, and raises draft PRs and SCOs for the shortage.
- **Pattern:** detail (`DetailHeader` + `DocumentFlow` + one full-width table card). Two panes do not fit 11 numeric columns; the SO's other data sits in the DetailHeader meta (Choices made).
- **DetailHeader:** docNo `SO-2611-0001/E2` · `soSnapshot` badge · meta: customer, run by / at, BOM revisions used (`bomRevisions[]`, count, expandable list) · back to the SO. No price anywhere (BR-SO-51).
- **Banner (BR-SO-38):** when out of date, a warning alert above the table: "Out of date. The order or a BOM changed after this run. Re-run to create drafts." text only, no button; the primary "Re-run explosion" is in the header. Superseded run: info alert "Old run, read only. Open E2." Table stays readable; pick boxes and Create are not rendered.
- **Table (11 data columns + a pick box, fits 1366 px: Item 220 px, Type 130, Rev 56, seven number columns 72 px, last column 180):**
  1 Item (SKU + name, indent and "L2" chip show level, chevron opens "Needed by" sources as SKU + level, BR-SO-25; this first column is sticky) · 2 Type (cast / job work / assemble / buy + `StatusBadge doc="soRowTag"` tag: No BOM "fix BOM and re-run", Buy as is, Inactive item, BOM loop) · 3 Rev (BOM revision used, `–` for buy) · 4 Gross · 5 Free (stock) · 6 Reserved (for other orders) · 7 Open PR · 8 Open PO · 9 Open SCO · 10 Net (bold) · 11 Raise (qty input when picked, or raised document link PR-… / SCO-…).
  Quantities `formatQty` with unit suffix (alloy kg 3 decimals, parts pcs whole), right-aligned `tabular-nums`; unit is therefore not its own column. Source: `GET /api/sale-orders/:id/explosions/:eid/rows` (`sku`, `name`, `level`, `type`, `tag`, `bomRevision`, `uom`, `grossQty`, `freeQty`, `reservedOtherQty`, `openPrQty`, `openPoQty`, `openScoQty`, `netQty`, `lateSupplyQty`, `raised`, `sources[{soLineId, lineNo, qty, sourceSku, sourceLevel}]`, `jobWorker.candidates`, `selectable`, `blockReason`); header `GET …/explosions/:eid` (`number`, `status`, `outOfDate`, `outOfDateReasons`, `bomRevisions[]`). At tablet width (1024 px) the table scrolls sideways inside the Table wrapper while the Item column stays fixed. Rows are paged, 50 per page (max 100), with `Pagination` under the table; sort `level, sku`. `lateSupplyQty` (supply after the delivery date, BR-SO-32) shows as an always-visible muted line in the Open PO / Open SCO cell, "+120 late" (not counted, BR-SO-32). Create: `POST …/explosions/:eid/drafts` with `rows[{rowId, qty, vendorId, expectedReturnDate}]`; re-run: `POST /api/sale-orders/:id/explosions`.
- **Row types (BR-SO-44):** Buy and job work with net > 0 and not inactive: pick box. Cast / assemble: no pick box, Raise cell shows muted "Plan: cast 821, pour 865" (assemble: "Plan: assemble N"). Net 0: no box, "Covered". Flagged rows (no BOM line, inactive, loop): no box, tag explains. A user without `pr.manage` gets no box on buy rows, without `sco.manage` none on job-work rows (not rendered).
- **Picked row:** Raise cell shows qty input (default net, aria-label "Qty to raise"; above net → field error "Can't be more than net 553.800 kg"; below net → muted "still short by 53.800 kg", BR-SO-39). A picked job-work row opens a second line under it with two labelled fields: Job worker (select of `jobWorker.candidates`, active vendors with the same service, defaults from the BOM; names only returned to users with `so.explode`) and Return date (picker, defaults to delivery date, empty with "Past due" when it passed, BR-SO-41, 43); send qty shown read-only "Send 1,021 HSG-RC" (BR-SO-42). Row error from the server (400 per row) shows in that line.
- **Actions:** "Create drafts (N)" (primary, DetailHeader, not rendered while out of date; N = picked rows; disabled when 0; "Creating…" while running; double click blocked, BR-SO-46) · `so.explode` + `pr.manage` for buy rows / `sco.manage` for job-work rows · one call, all or nothing · no dialog; a toast then lists the new PR / SCO numbers as links and the Raise cells turn into links. "Re-run explosion" (outline; **primary instead of Create drafts when the run is out of date**, since drafts are blocked) · `so.explode` · POST new run, "Exploding…" · no dialog; drafts already raised stay (BR-SO-36). Select-all box in the header picks every pickable row. Keyboard: arrow keys move between row boxes, Space toggles, Tab reaches inputs.
- **States:** empty run (every row covered) "Nothing to raise: stock and open supply cover this order." + link to SO · loading 8 skeleton rows · error `ErrorState` + Try again · 409 "re-run first" / "already raised" as error toast + banner refresh · no `so.explode` and no `so.view` → shell no-access; `so.view` only: read-only table, no boxes, no buttons.
- **Permissions:** `so.view` opens; `so.explode` for Re-run and Create; row-level keys above.
- **Picture:** wireframe 6.
```
+----------------------------------------------------------------------------------+
| < SO-2611-0001  SO-2611-0001/E2 [Current]  [Create drafts (2)]  |
| ! Out of date. Order or a BOM changed. Re-run to create drafts. (if so)|
| [x] Item          Type        Rev  Gross  Free Resv  PR   PO   SCO   Net  Raise  |
| [ ] HSG-MC L1     Job work    A    1,000  0    0     0    0    0   1,000 [1000]  |
|     Job worker [Sai CNC v]  Return by [15 Jan 27]  Send 1,021 HSG-RC             |
| [ ] HSG-RC L2     Cast        A    1,021  200  0     0    0    0    821  Plan:   |
|                                                                    cast 821,pour 865|
| [x] ADC12 L3 kg   Buy         -  723.800  100  50    0    120  0  553.800 [553.800]|
|     Needed by: HSG-RC L2 · Open PO 120 · +120 late (not counted)                   |
| [x] BUSH-M6 L3    Buy No BOM  -    1,730  500  0     0    0    0  1,230 [1230]   |
| [ ] HSG-XX L1     ! No BOM - fix BOM and re-run                                   |
| 5 rows · 2 picked: 1 PR with 2 lines                                              |
+----------------------------------------------------------------------------------+
```

## Choices made
Design choices not asked of the owner. spec-analyst moves these rows into `../assumptions.md`.
| Question | Choice | Source |
|---|---|---|
Moved to `../assumptions.md` (A-55..A-64) by spec-analyst, 2026-11-20.
