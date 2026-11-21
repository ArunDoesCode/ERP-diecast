# Purchase returns — screens

> Written by ui-ux-designer from `../spec.md` and `api.md` (endpoints below are under `/api/purchase-return`). Patterns, components and tokens come from
> the `design-system` skill. Pictures are ASCII wireframes, not screenshots. Light and dark both use tokens only.

## Screen list
| Screen | Route | Pattern | Picture |
|---|---|---|---|
| Returns list (+ Awaiting return tab) | `/purchase-returns` | list | wireframe 1 |
| New / edit return | `/purchase-returns/new?grnId=` · `/purchase-returns/[id]/edit` | form (own page) | wireframe 2 |
| Return detail | `/purchase-returns/[id]` | detail (two-pane) | wireframe 3 |
| Debit note / challan print | `/purchase-returns/[id]/debit-note` · `/purchase-returns/[id]/challan` | print sheet | wireframe 4 |
| GRN detail: "Return to supplier" | existing GRN detail | detail (change) | wireframe 5 |

## Status map (answers open question 4)
Add `purchaseReturn` to `src/lib/status-tone.ts`, existing tones only:
| Doc | Status | Label | Tone |
|---|---|---|---|
| `purchaseReturn` | draft | Draft | neutral |
| `purchaseReturn` | posted | Posted | success |
| `purchaseReturn` | cancelled | Cancelled | closed |
| `debitNote` | issued | Issued | success |
| `debitNote` | cancelled | Cancelled | closed |

Same words and tones as PO / PR (draft neutral, cancelled closed). Posted is success (done), not info: nothing
is left to wait for.

### Returns list
- **Purpose:** stores and back office see all returns and what still waits to go back.
- **Pattern:** list. `PageHeader` "Purchase returns", no primary button (a return starts from a GRN; see Choices).
- **Fields:** Return no. (mono link) · Status (`StatusBadge doc="purchaseReturn"`) · Supplier · GRN no. (link) · PO no. · Lines (count) · Debit note total (money, right; `–` for draft) · Date · source: `GET /getreturns` (proNumber, status, grnNumber, poNumber, supplier name, lines count, totalPaise, createdAt; filters status, supplierId, dateFrom/dateTo, q; sort id / proNumber / createdAt / status).
  Quick tabs (FilterBar): All · Draft · Posted · Cancelled · **Awaiting return** (counts from `meta.statusCounts` and `meta.awaitingCount`). Active tab lives in the URL (nuqs). Filters on return tabs: supplier, date range, search by no.; the Awaiting tab shows only the supplier filter.
- **Awaiting return tab:** same page, table swaps to GRN lines: GRN no. (link) · Supplier · Item · Heat no. · Rejected qty (qty + uom) · Open to return (qty + uom) (rejected − on non-cancelled returns) · Row action "Return to supplier" (opens `/purchase-returns/new?grnId=`). Source: `GET /awaiting` (grnNumber, item, batchNumber→Heat no., rejectedQty, awaitingQty = open to return, uom, supplier; sort grnId / grnNumber / receivedDate).
- **Actions:** open return (view) · "Return to supplier" on awaiting rows (`purchase_return.edit_draft`, BR-PRT-36, 39).
- **States:** empty "No returns yet. Returns start from a GRN." (action: Go to GRNs, hidden without `grn.view`) · awaiting empty "Nothing waits to go back." · 8 skeleton rows · `ErrorState` + Try again · no permission: "You can't view purchase returns" (`purchase_return.view`).
- **Permissions:** open: `purchase_return.view`. Awaiting row button hidden without `edit_draft`.

```
+------------------------------------------------------------------+
| Purchase returns                                                 |
| ==                                                               |
| [All 12][Draft 2][Posted 9][Cancelled 1][Awaiting return 3]      |
| supplier [v]  date [..-..]  search [........]                    |
| Return no.        Status   Supplier   GRN     PO     Total  Date |
| PRT-2026-11-0001  Posted   Hindalco   GRN-1   PO-1  ₹4,956 20 Nov|
| PRT-2026-11-0002  Draft    Hindalco   GRN-4   PO-3      –  21 Nov|
| 1 to 25 of 12                                       < 1 >        |
+------------------------------------------------------------------+
```

### New / edit return
- **Purpose:** stores prepare a return from one GRN; edit a draft.
- **Pattern:** form, own page, two columns from 768 px, label above each 36 px field. Actions bottom right: "Cancel" · "Save draft" (primary). "Post" lives on the detail, not here (one primary).
- **Fields:** GRN (read-only, mono link; prefilled from `grnId`) · Supplier, PO (read-only, copied, BR-PRT-01) · Reason (textarea, required, 3–500, BR-PRT-08) · Vendor return / RMA ref, Transporter, Vehicle no., Remarks (optional text) · Replacement expected (checkbox; hint "PO reopens for a replacement GRN"; BR-PRT-22).
  Lines table: one row per GRN line + source. Read-only: Item · Heat no. · Unit · Source (Rejected / Accepted) · Rate (money) · GST % · Open to return (cap left). Editable: Qty (right-aligned, unit shown, ≤ 3 decimals, whole for whole-number units, BR-PRT-04). "Add accepted qty" row action adds an accepted line for a GRN line (BR-PRT-03, only QA-decided lines, BR-PRT-02). Remove line (at least one stays, BR-PRT-10). Prefill from "Return to supplier": rejected lines with open qty already filled. Source: `GET /prefill/:grnId` (grnNumber, supplierName, poNumber, lines: itemName, uom, batchNumber, rate, GST %, rejectedReturnable, acceptedReturnable, suggested) on new; edit loads `GET /getreturndetails/:id` (current lines, header) and `GET /prefill/:grnId` (caps). The lines table scrolls sideways on tablet.
  Impact strip above actions, live from prefill rates and GST % as Qty changes (BR-PRT-31, 40; the server stays the judge): "Stock −30 kg ADC12 · Debit note ₹7,434 · PO unchanged". Rejected lines show "No stock movement".
- **Actions:** Save draft · `purchase_return.edit_draft` · `POST /createreturn` (grnId, reason, vendorReturnRef, transporter, vehicleNo, remarks, replacementExpected, lines[{grnItemId, source, qty}]) / `PATCH /updatereturn` · no confirm · BR-PRT-10 / 23. Cancel (leave page; confirm only if form dirty).
- **States:** loading skeleton form · error on load `ErrorState` · cap errors inline on the Qty field (BR-PRT-05, 06 message "Only 15 kg left to return") · `PRT_CAP_EXCEEDED` details {cap, reserved} fill the message · 409 `PRT_NOT_EDITABLE` shows "This return is already posted" with link to detail · GRN with nothing returnable (`mainAction: none`): "Nothing left to return on this GRN" with link back to the GRN, no form · no permission: "You can't create returns".
- **Permissions:** `purchase_return.edit_draft`.

```
+------------------------------------------------------------------+
| New purchase return                                              |
| ==                                                               |
| GRN: GRN-1 (read-only)        Supplier: Hindalco   PO: PO-1      |
| Reason *                      RMA ref        Transporter         |
| [porosity in heat H-881   ]   [.........]    [..............]    |
| Vehicle no.  [........]  Remarks [..........]                    |
| [ ] Replacement expected                                         |
| Item     Heat   Source    Rate     GST  Open   Qty   (x)        |
| ADC12    H-881  Rejected  ₹210.00  18%  20 kg  [20 ] kg          |
| + Add accepted qty                                               |
| Stock 0 kg (rejected) · Debit note ₹4,956 · PO unchanged         |
|                               [Cancel]  [Save draft]             |
+------------------------------------------------------------------+
```

### Return detail
- **Purpose:** see a return, take the next step, print.
- **Pattern:** detail, two-pane at 1024 px+ (left: lines and totals; right: header facts, debit note, audit); single column below.
  `DetailHeader` (docNo = return no., `StatusBadge`, meta: Supplier, GRN, PO, Date) + `DocumentFlow` PO → GRN → Return (current), debit note shown in the right pane.
- **Left pane:** Lines table (Item · Heat · Source · Qty+unit · Rate · Taxable · GST % · Value) · Totals (Taxable, CGST+SGST or IGST, Total; BR-PRT-31, 32) · "What happens on post" card for draft (BR-PRT-40) · Reason.
- **Right pane:** Facts (RMA, transporter, vehicle, replacement expected, remarks) · Debit note card (DN no., Challan no., date, `StatusBadge doc="debitNote"`) only when posted · Activity: created / edited / posted / cancelled by + at, status before → after, cancel reason (BR-PRT-41).
- **Actions:** next step on the header, one primary:
  | Status | Primary | Others | Key · rule |
  |---|---|---|---|
  | draft | Post return | Edit · More: Cancel draft | `purchase_return.post` · `edit_draft` · BR-PRT-12, 37 |
  | draft, user without `post` | Edit (primary) | More: Cancel draft | BR-PRT-37 |
  | posted | Print debit note | Print return challan · More: Cancel return | `view` · `cancel_posted` · BR-PRT-35, 37 |
  | cancelled | none | Print debit note (shows CANCELLED) | BR-PRT-28 |
  Post confirms in a dialog naming the return and the impact lines ("Post PRT-…-0001? Stock −30 kg, debit note ₹7,434."). Cancel draft: dialog, no reason (BR-PRT-11). Cancel return: dialog with required Reason (3–500) and effect text ("Stock comes back +30 kg; debit note is marked cancelled"; BR-PRT-25..28). Running: "Posting…" / "Cancelling…" disabled. Calls: post `POST /:id/post`, cancel draft `POST /:id/cancel-draft`, cancel return `POST /:id/cancel` {reason}. Errors in plain words: `INSUFFICIENT_STOCK` (BR-PRT-16), `PRT_HSN_MISSING` "Item X has no HSN code" (BR-PRT-34), `PRT_COMPANY_SETTINGS_MISSING` "Plant GSTIN is not set", `PRT_CAP_EXCEEDED` (BR-PRT-07), `PRT_REPLACEMENT_PO_CLOSED` "PO is closed; untick replacement", `PRT_NOT_EDITABLE` / `PRT_NOT_POSTED` "Someone already changed this return; reload". All data from `GET /getreturndetails/:id`: header, `lines`, `debitNote`, `events` (action, from → to, reason, who, when), `preview` (stockOut, debitNoteTotalPaise, poEffect) for drafts.
- **States:** loading `DetailHeader loading` + skeleton cards · error `ErrorState` · 404 "Return not found" · no permission as list.
- **Permissions:** `purchase_return.view`; hidden buttons per table above.

```
+------------------------------------------------------------------+
| < Purchase returns                                               |
| PRT-2026-11-0001 [Posted]   Hindalco · GRN-1 · PO-1  [Print debit note] [More v] |
| PO-1 > GRN-1 > PRT-2026-11-0001 (current)                        |
| +-------------------------------+ +----------------------------+ |
| | Lines                         | | Facts: RMA, vehicle        | |
| | ADC12 H-881 Rej 20kg ₹4,956   | | DN/26-27/12 · PRC/26-27/3  | |
| | Taxable 4,200 CGST 378 SGST378| |   [Issued]                 | |
| | Total ₹4,956                  | | Activity: posted by, at    | |
| | Reason: porosity in H-881     | |   Draft -> Posted          | |
| +-------------------------------+ +----------------------------+ |
+------------------------------------------------------------------+
```

### Debit note and return challan print view
- **Purpose:** accounts print the debit note; stores print the truck challan.
- **Pattern:** print sheet, not a standard pattern: the detail page with a print stylesheet, same as the SCO challan print; always light, in both themes. Routes `/purchase-returns/[id]/debit-note` and `/challan`. Screen toolbar via `PageHeader` ("Debit note DN/26-27/12", actions: Print primary, Back to return); `print:hidden` hides toolbar, shell, sidebar. No `<h1>` in the sheet.
- **Fields, debit note (BR-PRT-33):** plant name, address, GSTIN · supplier name, address, GSTIN · DN no. and date · return no. · **challan no. printed next to the DN no.** (coordinator decision) · GRN no. and supplier challan no. · PO no. · only the linked supplier bill no. and date (if recorded) · lines: item, HSN, heat no., qty+unit, rate, taxable, GST %, CGST/SGST or IGST · totals · reason. "CANCELLED" mark across the sheet when cancelled (BR-PRT-28). Source: `GET /getreturndetails/:id` (`debitNote` snapshots, `debitNote.supplierBill`).
- **Fields, challan (BR-PRT-35):** plant, supplier, **challan no.** (own consecutive per-FY number, GST Rule 55; sample `PRC/26-27/0001`, source: `challanNumber` on `GET /getreturndetails/:id`) next to return no., date, vehicle no., lines: item, HSN, heat no., qty, unit, value (taxable + GST); signature boxes.
- **Actions:** Print · `purchase_return.view` · `window.print()` on the details data (no print endpoint) · no confirm · BR-PRT-33, 35. Both routes on a draft show "Post the return to print".
- **States:** loading skeleton sheet · error `ErrorState` · missing plant GSTIN is blocked at post, so the sheet never shows a blank (BR-PRT-34) · no permission as list.

```
+---------------- screen toolbar (hidden in print) ---------------+
| Debit note DN/26-27/12                  [Back] [ Print ]       |
+------------------------------------------------------------------+
| DiecastOS Pvt Ltd, address, GSTIN         DEBIT NOTE  [CANCELLED]|
| To: Hindalco, address, GSTIN              DN date Challan no. Return PO|
| GRN-1 · Challan CH-77 · Bill B-9 (12 Nov)                        |
| Item  HSN  Heat   Qty  Rate   Taxable GST% CGST SGST             |
| ADC12 7601 H-881  20kg 210.00 4,200   18   378  378              |
| Taxable 4,200 · CGST 378 · SGST 378 · Total ₹4,956               |
| Reason: porosity in heat H-881                                   |
+------------------------------------------------------------------+
```

### GRN detail: "Return to supplier" (change to existing screen)
- **Purpose:** next step on a GRN with rejected or returnable goods.
- **Pattern:** detail (existing `GrnDetailView`); no new layout.
- **Changes:**
  - Header action (BR-PRT-36, `purchase_return.edit_draft`): **primary "Return to supplier"** when any line has rejected qty not yet on a non-cancelled return; link `/purchase-returns/new?grnId=` (prefilled). Only accepted qty returnable: outline button, opens empty draft. Nothing returnable: hidden. If the GRN's normal next step is also primary (e.g. QA decision pending), that stays primary and the return is outline: one primary only. Pending-QA lines cannot be returned (BR-PRT-02), so no button for a GRN with all lines pending.
  - Lines table: per line "Rejected 20 · returned 15", "Accepted 980 · returned 30" (BR-PRT-38).
  - `DocumentFlow`: add returns as steps (number, `StatusBadge purchaseReturn`); PO detail gets the same plus "Returned" per line.
- **Actions:** "Return to supplier" · `purchase_return.edit_draft` · `GET /prefill/:grnId`, then opens the form · no confirm · BR-PRT-36 (`mainAction`: prefilled = primary, secondary = outline, none = hidden).
- **States:** unchanged; button absent while loading.

```
+------------------------------------------------------------------+
| GRN-1 [Accepted]  Hindalco · PO-1     [Return to supplier] [More]|
| PO-1 > GRN-1 > PRT-2026-11-0001 [Draft]                          |
| L1 ADC12 H-881  Arrived 1000 · Accepted 980 · Rejected 20        |
|                 Rejected 20 · returned 0 | Accepted · returned 0 |
+------------------------------------------------------------------+
```

## Choices made
Moved to `../assumptions.md` (A-33..A-40) by spec-analyst, pass 2.
| Question | Choice | Source |
|---|---|---|

## Questions
None that change what a factory user does. Note for spec-analyst: debit note FY number format (`DN/26-27/12`) shown here is a sample; data.md decides.
