# Dispatch — screens

> Written by ui-ux-designer from `../spec.md` and `api.md` (all endpoints under `/api/dispatch`, "A:" = api.md).
> Patterns, components and tokens come from the `design-system` skill. Pictures are wireframes, not screenshots.
> Owner standards everywhere: two-pane detail, full lists, full-page forms, label above field, keyboard
> reachable (Tab = reading order, Enter submits, Esc closes), light and dark (tokens only). Answers open question 3.
> **Floor supervisor has no `so.view`:** the floor enters through Pending dispatch, never the SO screens. Where a
> screen links to an SO, the number is a plain mono label without `so.view`.

## Screen list
| Screen | Route | Pattern | Picture |
|---|---|---|---|
| Pending dispatch | `/delivery-notes/pending` | list | wireframe 1 |
| Delivery note register | `/delivery-notes` | list | wireframe 2 |
| Delivery note form | `/delivery-notes/new?so=<id>`, `/delivery-notes/[id]/edit` (draft only) | form, full page | wireframe 3 |
| Delivery note detail | `/delivery-notes/[id]` | detail, two-pane | wireframe 4 |
| Delivery note print | `/delivery-notes/[id]/print` | print (A4) | wireframe 5 |
| "Dispatch" on SO detail | `/sale-orders/[id]` (change to the sale-order screen) | detail | wireframe 6 |

Small dialogs, no picture (name the note): Post note (confirm, shows
"600 pcs leave Finished Goods", BR-DSP-10..19) · Cancel draft (reason 3–500, BR-DSP-29) · Cancel posted note
(reason 3–500, says "stock goes back", BR-DSP-30, 31) · Update transport (BR-DSP-27).
Sidebar: "Dispatch" group (Pending dispatch first, then Delivery notes) with `dispatch.view`; Pending dispatch is the floor supervisor's home.

## Status map (same status = same colour everywhere)
New doc keys `dn` and `dnTag` in `status-tone.ts`, existing tones only. Tags use `StatusBadge doc="dnTag"`. Banners are an inline notice (token block `bg-warning-subtle text-warning` or `bg-destructive-subtle text-destructive`, icon + text, same pattern as the reorder screens); no new component.
| Doc key | Value | Label | Tone |
|---|---|---|---|
| `dn` | draft / posted / cancelled | Draft / Posted / Cancelled | neutral / success / closed |
| `dnTag` | eway_needed / eway_missing | E-way needed / E-way missing | warning / warning |
| `dnTag` | eway_expired (BR-DSP-28) / short_stock (information only) | E-way expired / Short stock | danger / warning |
SO and note-list badges reuse `so` (sale-order screens) and `dn`.

### Pending dispatch
- **Purpose:** stores / back office sees what is still to ship and starts a note.
- **Pattern:** list (`PageHeader` + `FilterBar` + `DataTable` + `Pagination`).
- **Fields:** SO no. (mono; accent link to SO only with `so.view`) · customer · item (SKU + name) · ordered · delivered · open (bold) · SO date · stock at default source location (`formatQty` + unit, right; "Short stock" tag when stock < open) · row action. One row per SO line with open > 0, confirmed SO only. Source: A `GET /pending` rows `soNumber, customer, item, uom, ordered, delivered, open, soDate, stockAtLocation` (BR-DSP-39). No price in this list.
- **Filters (URL/nuqs):** customer select, item select (api `customerId`, `itemId`; options from `GET /pending` `meta.customers`, `meta.items`, distinct, ≤ 200, `dispatch.view`). Sort `soDate` asc. Page size 10, 1–100.
- **Actions:** "Dispatch" (outline, row end) · `dispatch.manage` · opens `/delivery-notes/new?so=<id>&line=<soLineId>` with that line ticked · no dialog · BR-DSP-01, 03. No primary button on the page.
- **States:** empty "Nothing waiting to ship." + link "Delivery notes" · filters "Nothing matches these filters" + Reset · loading 8 skeleton rows · error `ErrorState` + Try again · no `dispatch.view` → shell no-access.
- **Permissions:** `dispatch.view` opens. No `dispatch.manage`: row action not rendered. Stock column needs nothing extra (qty only). No money on this screen.
```
+--------------------------------------------------------------------------+
| Pending dispatch                                                         |
| Customer [All v]   Item [All v]                                   |
| SO no.        Customer     Item        Ord.   Deliv.  Open   SO date Stock|
| SO-2611-0001  Rane Brakes  HSG-MC     1,000   800     200    18 Nov   100 |
|                                       pcs     pcs     pcs            pcs [Dispatch]|
| SO-2611-0003  Kaveri Motors BUSH-M6     500   0       500    19 Nov   80  |
|                                          [!Short stock]                [Dispatch]|
| 1 to 2 of 2                                      < 1 >   10 per page     |
+--------------------------------------------------------------------------+
```

### Delivery note register
- **Purpose:** find any note, see what left, what lacks an e-way number.
- **Pattern:** list.
- **Fields:** Note no. (mono accent link; drafts show "Draft") · status (`StatusBadge doc="dn"`) · date · customer · SO no. (link with `so.view`) · qty (`totalQty`, sum of lines) · value incl. GST (`formatMoney`, right; `so.view` only) · e-way no. (mono, `–`) · valid until (`formatDateTime`; "E-way expired" tag when past, BR-DSP-28). Source: A `GET /notes` rows `id, dnNumber, noteDate, totalQty, customer, status, soNumber, valuePaise*, ewayBillNo, ewayValidUntil, ewayExpired, ewayNeeded` (BR-DSP-40); `*` = `so.view` only.
- **Filters (URL/nuqs):** chips All (default) / Draft / Posted / Cancelled (api `status`; no counts) · date range (`dateFrom`, `dateTo`, IST) · customer select (options from `GET /notes` `meta.customers`, solution-designer adding) · toggle "E-way needed but missing" (drafts only) · Default sort newest first. Page size 10, 1–100.
- **Actions:** "Pending dispatch" (outline link in the header) · `dispatch.view`. No "New note" button: a note starts from an SO (BR-DSP-01). When the register is empty the header link is not rendered; the empty state holds the one entry point (DES-011).
- **States:** empty "No delivery notes yet." + button Pending dispatch · filters "Nothing matches these filters" + Reset · loading 8 skeleton rows · error `ErrorState` + Try again · no `dispatch.view` → shell no-access.
- **Permissions:** `dispatch.view` opens; Value column not rendered without `so.view` (BR-SO-51); table keeps its other columns.
```
+---------------------------------------------------------------------------------+
| Delivery notes                                         [ Pending dispatch ]     |
| [All][Draft][Posted][Cancelled]  Date [1 Nov - 30 Nov]  Cust [All v]    |
| [ ] E-way needed but missing                                                    |
| Note no.       Status   Date    Customer     SO no.        Qty   Value     E-way no. Valid until|
| DN/26-27/2     Posted   20 Nov  Rane Brakes  SO-2611-0001  200   43,660.00  –         –        |
| DN/26-27/1     Posted   20 Nov  Rane Brakes  SO-2611-0001  600   1,30,980.00 1234 5678 9012 22 Nov 23:59|
|                                                              [! E-way expired] (if past) |
| Draft          Draft    20 Nov  Kaveri Motors SO-2611-0003  500   [!E-way missing]     |
| 1 to 3 of 7                                         < 1 2 3 >   10 per page     |
+---------------------------------------------------------------------------------+
```

### Delivery note form
- **Purpose:** stores picks lines and pieces for this truck, packs, fills transport, saves a draft, then posts.
- **Pattern:** form, full page (owner standard). `PageHeader` "New delivery note" / "Edit draft". Entered from an SO, so the SO is never chosen here. Sections in one column, each a card; header fields two columns from 768 px. Tablet: qty, package and e-way inputs use the large 40 px size.
- **1 Header (read-only, copied, BR-DSP-02):** Customer · address · state · GSTIN or "unregistered" · ship-to · SO no. (link with `so.view`) · customer PO no. Muted facts block, not inputs. Source: A `GET /pending?soId=` SO header block (customer, shipTo, SO no., customer PO, state; `dispatch.view`), not the SO detail; for a saved draft the same fields from `GET /notes/:id`.
- **1b Header (editable):** Note date* (picker, IST, default today, not future, not before SO date, BR-DSP-07) · Remarks (textarea, ≤ 500, optional) · Ship from* (select of active non-virtual locations, default Finished Goods, BR-DSP-08; changing it reloads the Stock column). Source: A `GET /pending?soId=&locationId=` (rows, open, stock, `deliveryDate` per line), `GET /settings`, existing asset locations list.
- **2 Lines (picker table, BR-DSP-03, 04, 05, 09):** one row per SO line with open > 0 (lines with open 0 are not listed). Source: A `GET /pending?soId=`, saved lines `lines[]`; save = `POST/PATCH /notes`. Columns: pick box (aria-label "Ship HSG-MC") · item (SKU + name) · delivery date · ordered · delivered · open · Stock at location · **Qty to ship*** (right, unit suffix; whole for pcs / set, else 3 decimals; ticking the box fills open qty, unticking clears) · Lot / heat no. (text ≤ 50, optional; the table scrolls inside the Table wrapper below 1024 px) · Line value (`so.view` only, from SO price and GST %). Footer Taxable, GST, Note value (`so.view`, right). Qty over open → inline "Only 400 open" and Save blocked; qty over stock → warning line "Stock here: 100. Posting will be refused." (information; the server decides at post, BR-DSP-06, 13; shown only when qty > stock). The packing grid scrolls inside its Table wrapper below 1024 px.
- **3 Packing list (optional, BR-DSP-20..22):** grid, one row per box: Package no.* · Line* (select of ticked lines) · Qty* · Net kg* · Gross kg* (≥ net) · Lot (default from the line) · remove icon. "Add package" and "Duplicate last row" (outline) for many equal boxes. Under the grid, per line "Packed 550 of 600 pcs": muted when no boxes, success when equal, warning when different with "Must equal 600 before posting". Totals: net kg, gross kg.
- **4 Transport and e-way bill (BR-DSP-23..26):** Mode* (road, rail, air, ship; default road) · Vehicle no. (road; uppercased, spaces and dashes removed on blur) · Transporter ID (road, GSTIN pattern) · Transport name · Transport doc no. and date (rail / air / ship) · Distance km (1–4,000) · E-way bill no. (12 digits, mono, grouped as typed) · E-way bill date. Fields marked * switch on with the hint.
  Source: A `transport{}` fields, `ewayNeeded`, `ewayLimitPaise`, `GET /settings`.
  **Live hint** at the panel top, always visible: warning tag "E-way bill needed" + line "Note value ₹1,30,980.00 is at or above the ₹50,000 limit (same state)" · or neutral tag "E-way bill optional" + "Note value ₹43,660.00 is below the ₹50,000 limit". Other-state customer line says "other state". Needed → mode, vehicle or transporter ID (road), distance, e-way no. and date get a "Required to post" helper and a `*`; they are never required to save a draft.
  With `so.view` the browser recomputes it on every qty change (SO line prices and GST % from the SO detail, a `so.view` call; `ewayLimitPaise`, customer vs plant state). Without `so.view` it shows the tag only, from `ewayNeeded` on each create / save response, with the muted line "Checked when you save" (before the first save: "Save the draft to check"). The server decides.
- **Actions:** "Cancel" (back, asks to discard if changed) · "Save draft" (outline; "Saving…"; POST / PATCH; BR-DSP-03..09, 20, 22, 25) · "Post note" (the one primary; opens the Post dialog; "Posting…"; BR-DSP-10..19, 21, 23, 24, 26). All `dispatch.manage`. Field errors show under the field; row errors name the line; 409 (stock, SO on hold, e-way no. reused) as an error banner above the form with the reason in plain words and nothing lost.
- **States:** loading skeleton cards · error `ErrorState` (404 "Sale order not found") · SO not confirmed → banner "This order is on hold / closed. Delivery cannot start." + link to the SO; new note: form not shown; saved draft: banner only, form stays editable, only Post is blocked (BR-DSP-01, 11) · edit of a note not draft → redirect to detail · no `dispatch.manage` → shell no-access.
- **Permissions:** `dispatch.manage`. Money cells and footer not rendered without `so.view`.
```
+----------------------------------------------------------------------------+
| New delivery note                                                          |
| Rane Brakes · Plot 4 MIDC Pune · Maharashtra · GSTIN 27ABCDE1234F1Z5    |
| SO SO-2611-0001 · Customer PO RB/4471 · Ship-to same as customer          |
| Note date *            Ship from *                                         |
| [20 Nov 2026]          [Finished Goods                     v]              |
| Lines                                                                      |
| [x] Item     Del.    Open  Stock  Qty to ship *   Lot / heat    Value      |
| [x] HSG-MC   15 Jan  1,000 700    [ 600 ] pcs     [H-231 ]      1,11,000.00|
|     Taxable 1,11,000.00   GST 19,980.00   Note value 1,30,980.00           |
| Packing list (optional)    Packed 600 of 600 pcs OK   [Add package]        |
| Pkg no.* Line *     Qty *  Net kg *  Gross kg *  Lot        [x]            |
| [1]      [HSG-MC v] [300]  [41.0]    [44.0]      [H-231]                   |
| [2]      [HSG-MC v] [300]  [41.0]    [44.0]      [H-231]                   |
| Transport and e-way bill      [! E-way bill needed]                        |
| Note value Rs 1,30,980.00 is at or above the Rs 50,000 limit (same state)  |
| Mode *[Road v] Vehicle no.[MH12AB1234] Transporter ID[...] Distance km *[350]|
| E-way bill no. *[1234 5678 9012]   E-way bill date *[20 Nov 2026]          |
|                        [ Cancel ] [ Save draft ] [ Post note ]             |
+----------------------------------------------------------------------------+
```

### Delivery note detail
- **Purpose:** read one note, post or print it, fix transport after it left, cancel it.
- **Pattern:** detail, two-pane (owner standard). Left wide, right ≤ 420 px, stacks below 1024 px.
- **DetailHeader:** docNo `DN/26-27/1` ("Draft" until posted) · `StatusBadge doc="dn"` · meta: customer, note date, value incl. GST (`valuePaise`, `so.view`), posted by / at · back to `/delivery-notes`. Then `DocumentFlow`: SO-2611-0001 (done, `so` badge from `soStatus`, link with `so.view`, else plain) → DN/26-27/1 (current). Draft: second step "Draft".
- **Fields:** as in the cards below. Source: A `GET /notes/:id` (`activity[]`, `soStatus`, `totalQty`), `GET /notes/:id/transport-history`; actions `POST /notes/:id/post`, `/cancel-draft`, `/cancel`, `PATCH /notes/:id/transport`. Price fields `*` omitted without `so.view`.
- **Left pane cards:** (1) *Lines:* # · item (SKU + name) · HSN · qty + unit · lot · price · taxable · GST % · GST (money columns `so.view` only; footer totals). (2) *Packages* (only if any): package no. · line · qty · net kg · gross kg · lot; footer totals and "Packed = note qty". (3) *Transport and e-way bill:* mode · vehicle · transporter ID / name · transport doc · distance · e-way no. · date · "Valid until 22 Nov 2026 23:59" with "E-way expired" danger tag when past (BR-DSP-28) · for a draft the live hint tag. Posted: "Update transport" (outline) in this card header. (4) *Remarks* (note `remarks`, in the Lines card footer, hidden when empty) · (5) *Change history* of transport: field · old → new · who · when (BR-DSP-27), hidden when empty.
- **Right pane panels:** (1) *Customer and ship-to:* copied name, address, state, GSTIN, ship-to, SO link, customer PO. (2) *Stock:* "Shipped from Finished Goods", "Stock posted" line count; no cost (Security). (3) *Activity:* detail `activity[]`, audit trail who · when · action · before → after, reasons included (BR-DSP-36).
- **Header actions (one primary):** draft → "Post note" (primary, `dispatch.manage`, Post dialog, "Posting…") + "Edit" (outline) · posted → "Print" (primary, `dispatch.view`, opens print route; BR-DSP-37) · cancelled → none. **More menu:** draft → "Cancel draft" (`dispatch.manage`, dialog + reason, BR-DSP-29) · posted → "Cancel note" (`dispatch.cancel` only, danger, dialog names the note, reason, says stock goes back and SO qty reopens, BR-DSP-30..33). Draft Print is allowed and shows the DRAFT watermark.
- **Update transport (posted, `dispatch.manage`, BR-DSP-27):** dialog (mode is locked after posting, not shown) with only vehicle no., transporter ID / name, transport doc no. / date, and e-way no., e-way date and Distance km only when empty (distance saved with the e-way no.); other fields not shown. Save shows "Saving…"; 409 on an e-way no. already used or on a filled one shown in the dialog.
- **States:** loading `DetailHeader loading` + skeleton cards · error `ErrorState` + Try again (404 "Delivery note not found") · no `dispatch.view` → shell no-access · cancelled: danger-free closed banner "Cancelled by Arun on 21 Nov: wrong part loaded" and all edit actions gone · 409 on Post (stock short, SO on hold, over open) → error banner naming the line with qty; note stays draft.
- **Permissions:** `dispatch.view` opens; Post / Edit / Update transport / Cancel draft: `dispatch.manage`; Cancel note: `dispatch.cancel`; price columns, value, GST: `so.view` too. Hidden = not rendered, header keeps its height.
```
+----------------------------------------------------------------------------+
| < Delivery notes  DN/26-27/1 [Posted]                 [ Print ] [More v]   |
| Rane Brakes · 20 Nov 26 · Value 1,30,980.00 · Posted by Arun, 20 Nov 14:05  |
| SO-2611-0001 [Confirmed] --> DN/26-27/1 [Posted]                           |
| +--------------------------------------------+ +-------------------------+ |
| | Lines                                      | | Customer and ship-to    | |
| | # Item    HSN  Qty  Lot   Price  Taxable GST| | Rane Brakes, Pune      | |
| | 1 HSG-MC 8708 600 pcs H-231 185.00 1,11,000 18%| | GSTIN 27ABCDE1234F1Z5 | |
| +--------------------------------------------+ | SO-2611-0001 · RB/4471  | |
| | Packages  1 · HSG-MC · 300 · 41 · 44 kg    | | Stock                   | |
| +--------------------------------------------+ | From Finished Goods     | |
| | Transport and e-way   [Update transport]   | | Activity                | |
| | Road · MH12AB1234 · 350 km                 | | Arun · posted           | |
| | E-way 1234 5678 9012 · valid to 22 Nov 23:59| +-------------------------+ |
| | Change history                             |                             |
| +--------------------------------------------+                             |
+----------------------------------------------------------------------------+
```

### Delivery note print
- **Purpose:** paper that rides with the truck. Opened by "Print"; the browser prints it (A4 portrait, 12 mm margins, black on white in both themes, no app shell, "Print" and "Back" buttons hidden in print via `@media print`).
- **Pattern:** print page; source: A `GET /notes/:id` incl. `company{}` (name, address, GSTIN). Header and column row repeat on page 2, footer "Page 1 of 2".
- **Content (BR-DSP-41):** title "Delivery note — not a tax invoice" · our name, address, GSTIN, state (`company`) · note no. and date, SO no., customer PO no. · customer name, address, GSTIN or "unregistered" · ship-to · lines: # · item · HSN · qty · unit · price · taxable · GST % · GST · totals row · packages table with net / gross kg and lots (only if any) · transport and e-way fields (mode, vehicle, transporter, distance, e-way no. and date, valid until) · signature boxes "Prepared by" and "Received by". Draft: large "DRAFT" watermark, no number ("Draft").
- **Actions:** "Print" (primary, `window.print()`, no API call, `dispatch.view`) and "Back" (outline, to the note); both hidden in print.
- Print also shows `remarks` under the lines (hidden when empty).
- **Without `so.view`:** price, taxable, GST % and GST columns and all totals are not in the HTML at all (not hidden by CSS); the qty columns stay and the print stays valid.
- **States:** loading skeleton page · error `ErrorState` · cancelled: "CANCELLED" watermark and reason line · no `dispatch.view` → shell no-access.
- **Permissions:** `dispatch.view`; money `so.view` too.
```
+--------------------------------------------------+
| DELIVERY NOTE - NOT A TAX INVOICE                |
| Diecast Works Pvt Ltd, Pune · GSTIN 27AAACD1234E1Z5|
| Note no. DN/26-27/1   Date 20 Nov 2026           |
| SO SO-2611-0001   Customer PO RB/4471            |
| To: Rane Brakes, Plot 4 MIDC, Pune · 27ABCDE1234F1Z5|
| Ship-to: same                                    |
| # Item     HSN  Qty  Unit Price  Taxable GST% GST |
| 1 HSG-MC   8708 600  pcs  185.00 1,11,000 18  19,980|
|                      Total 1,11,000 · GST 19,980 · 1,30,980|
| Packages: 1 · HSG-MC · 300 pcs · 41 / 44 kg · H-231|
| Road MH12AB1234 · 350 km · E-way 1234 5678 9012  |
| Valid until 22 Nov 2026 23:59                    |
| Prepared by ____________   Received by ________  |
+--------------------------------------------------+
```

### "Dispatch" on the confirmed sale order detail (change to the sale-order screen)
Answers open question 3; a change request to the sale-order detail screen, not edited here.
- **Button rule (BR-DSP-37, CR-SO-6):** on a confirmed SO with any line open > 0 and `dispatch.manage`, "Dispatch" shows in the DetailHeader. Next to "Explode BOM" / "Create draft PRs / SCOs" it is `variant="outline"` and that step stays the one primary (BR-DS-06; spec: "second action, not the main button"); with no other next step for this user (back office without `so.explode`) it is the primary. The floor supervisor has no `so.view` and never sees this screen; the floor uses Pending dispatch. Never inside "More". Click opens `/delivery-notes/new?so=<id>` (no dialog). Fully delivered, on hold, closed, cancelled, or no permission → not rendered.
- **Right pane:** new panel *Delivery notes* above *Raised documents*: note no. (mono accent link; "Draft" before posting) · date · qty (`totalQty`) · `StatusBadge doc="dn"`; empty "Nothing shipped yet." (BR-DSP-38; Source: A `GET /notes?soId=`; Delivered / Open columns already on the SO Lines card). Needs `dispatch.view`, else not rendered.
- **DocumentFlow:** adds one step per non-cancelled note after the SO (and after the explosion steps): `DN/26-27/1 [Posted]`.
```
+----------------------------------------------------------------------+
| < Sale orders  SO-2611-0001 [Confirmed]  [ Explode BOM ] [Dispatch] [More v]|
| SO-2611-0001 --> E2 [Current] --> DN/1 [Posted] --> DN/2 [Posted]  |
| +--------------------------------+ +-----------------------------+   |
| | Lines  ... Deliv. 800  Open 200| | Delivery notes              |   |
| +--------------------------------+ | DN/1 · 600 · DN/2 · 200 [Posted] |
|                                    | Raised documents ...        |   |
+----------------------------------------------------------------------+
```

## Choices made
Moved to `../assumptions.md` (A-46..A-54) by spec-analyst, 2026-11-20.
| Question | Choice | Source |
|---|---|---|
