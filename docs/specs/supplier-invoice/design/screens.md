# Supplier invoice — screens

> Written by ui-ux-designer from `../spec.md`, `api.md` and `data.md`. Sources are the endpoints in `api.md`
> (paths shortened: `list` = `GET /api/supplier-invoice/getsupplierinvoices`, `detail` = `GET …/getsupplierinvoicedetails/:id`,
> `getbillablelines` = `GET …/getbillablelines`, `tol` = `/api/company/invoice-tolerances`). Checked by design-reviewer before freeze.
> Patterns, components and tokens come from the `design-system` skill. Pictures are wireframes, not screenshots
> (no mock route was created).

## Screen list
| Screen | Route | Pattern | Picture |
|---|---|---|---|
| Invoice list | `/supplier-invoices` | list | wireframe below |
| Invoice entry / edit | `/supplier-invoices/new?grnId=…` and `/supplier-invoices/[id]/edit` | form (own page) | wireframe below |
| Invoice detail | `/supplier-invoices/[id]` | detail (two-pane) | wireframe below |
| Release dialog (and Cancel dialog) | on detail | dialog | wireframe below |
| Tolerance settings | existing `/subcontracting/settings`, new card "Invoice matching" | form card | wireframe below |
| Next step button | on GRN detail and PO detail | action only | text below |

Not designed: a payment screen, a legacy list (no rule needs them).

## Status map (D6 answered)
New `StatusDoc` `supplierInvoice` in `status-tone.ts`, existing tones only. Same colour in list, detail, flow.
| Value | Label | Tone |
|---|---|---|
| draft | Draft | neutral |
| blocked | Blocked | warning (waiting on someone) |
| approved | Payable | success |
| cancelled | Cancelled | closed |
| legacy (old BR-PO-15 rows, no lines) | Legacy | closed; read-only, no actions, no filter chip, listed only under "All" |
| overdue (derived: approved and due date < today, BR-SINV-28) | Overdue | danger (`text-destructive` on `bg-destructive-subtle`) with label and icon; shown as a second badge beside "Payable", never replaces it |
Match chips use a new `StatusDoc` `supplierInvoiceMatch` in `status-tone.ts` (existing tones only): `ok` = OK, success; `qty`, `price`, `tax`, `tax_rate`, `total`, `charge` = Qty, Price, Tax, Tax rate, Total, Charge not on PO, each danger (`text-destructive`) as a label chip; `below_po_rate` = Below PO rate, info. Label and icon always, never colour alone.

### Invoice list
- **Purpose:** accounts and owner find bills, see what is blocked, payable or overdue.
- **Pattern:** list (`PageHeader` + `FilterBar` + `DataTable` + `Pagination`, state in URL).
- **Fields:** Our no. `SINV-…` (mono accent link, BR-SINV-11) · Status badge (+ Overdue badge) · Supplier invoice no. (BR-SINV-05) · Supplier name · PO no. (link) · Invoice date · Due date (BR-SINV-28) · Bill total right-aligned `formatMoney` (BR-SINV-10). Source: `list` rows: `ourNumber`, `status`, `overdue`, `invoiceNumber`, `supplier`, `poNumber`, `dueDate`, `invoiceDate`, `totalPaise`.
- **Filter chips (one call, counts, BR-SINV-37):** All · Draft · Blocked · Payable · Overdue · Cancelled. Counts from `list` `meta.statusCounts` (draft, blocked, payable, overdue, cancelled); chip value = `status` param (`payable` = approved). Search box = `q` (≤ 100). Sort: `sortBy` (`ourNumber`, `invoiceNumber`, `invoiceDate`, `dueDate`, `totalPaise`), default `createdAt` desc. Page size 10 default, max 100.
- **Actions:** "Enter supplier invoice" (primary, `invoice.manage`) opens the form; PO picker first, then lines load from `getbillablelines?poId=`; row click opens detail.
- **States:** empty "No supplier invoices yet" + "Enter supplier invoice" (no button without key); filtered empty "Nothing matches these filters" + Reset; loading 8 skeleton rows; error + "Try again"; no permission: no menu entry, direct URL shows the standard no-access page (BR-SINV-33).
- **Permissions:** `invoice.view` opens. `invoice.manage` shows the primary button.

```
+------------------------------------------------------------------------+
| Supplier invoices                              [ Enter supplier invoice ]
| ====                                                                   |
| (All 41)(Draft 3)(Blocked 2)(Payable 30)(Overdue 4)(Cancelled 2) [search]
| Our no.        Status          Supplier inv  Supplier   PO     Date  Due   Total
| SINV-2026-11-3 [Blocked]       INV-44        Bharat..   PO-..7  10-11 10-12 2,77,536.00
| SINV-2026-11-1 [Payable][Overdue] INV-12     Sri Metals PO-..5  02-10 01-11 1,18,000.00
| SINV-2026-11-2 [Draft]         INV-45        Bharat..   PO-..7  12-11 12-12   54,000.00
|                                          1 to 10 of 41  [<] 1 [>]       |
+------------------------------------------------------------------------+
```

### Invoice entry / edit
- **Purpose:** accounts types the paper bill against one PO; sees computed vs typed and the match before submitting.
- **Pattern:** form on its own page (D7 answered: > 6 fields), two columns from 768 px, label above 36 px fields, actions bottom right.
- **Entry paths:** from GRN or PO "Enter supplier invoice" prefilled (BR-SINV-38): PO fixed, supplier copied and read-only (BR-SINV-01), item lines prefilled with billable qty, PO rate, PO GST %. From the list: first pick PO (select), then lines load. Edit route only for status draft (BR-SINV-11).
- **Header fields:** Supplier (read-only, `getbillablelines.supplier`) · PO no. (read-only, `getbillablelines.po`) · Supplier invoice no.* (`invoiceNumber`; BR-SINV-05, upper-cased on blur, error names the allowed characters; 409 `SINV_DUPLICATE_NUMBER` shown on the field, BR-SINV-06) · Invoice date* (`invoiceDate`, BR-SINV-07, max today, min PO date) · Due date (read-only, computed in the form from `getbillablelines.po.paymentTermsDays`; server value wins, BR-SINV-28) · Reverse charge (`reverseCharge`) · ITC not eligible (`itcNotEligible`) (BR-SINV-17). No remarks field (not in the API).
- **Item lines (grid, one row per GRN line, BR-SINV-01..03, 08):** GRN no. · Item · Billable qty (read-only, `billableQty` + `uom`) · Billed qty* (`qty`) · Rate ₹* (`ratePaise`) · GST %* (`gstPercent`) (slab select) · PO rate (`poRatePaise`) · Taxable (computed, BR-SINV-13) · Match result chip per line (`supplierInvoiceMatch`, live in the browser using `poRatePaise`, `poGstPercent`, `billableQty` and `GET tol`; the server result at submit is final: Qty, Price, Tax rate, "Below PO rate", OK). Remove-line button; a line can't be added twice.
- **Charge lines (max 10, BR-SINV-09):** `charges[]`: Type (`type`: freight, packing, tooling, other) · Description (≤ 200) · Taxable ₹ (`taxablePaise`) · GST %. A visible note "Charge lines need a release" (BR-SINV-41).
- **Totals panel (right, sticky from 1280 px; below 1280 px it stacks under the grid, and the grid scrolls inside the table wrapper):** two columns, Computed (live in browser; server values replace them after save, BR-SINV-13..16) vs Printed on bill (`printed.taxablePaise`, `cgstPaise`, `sgstPaise`, `igstPaise`, `totalPaise`, BR-SINV-10): Taxable · CGST · SGST · IGST · Total. Tax columns for the wrong tax type are greyed out with the tax type named ("Same state: CGST + SGST", BR-SINV-14). Difference per row; red + "Tax" / "Total" chip when beyond ₹1.00 (BR-SINV-19, 20). Footer: "Expected result: Payable" or "Expected result: Blocked, N checks fail".
- **Actions:** Cancel (outline) · Save draft (secondary, `invoice.manage`, `POST createsupplierinvoice` or `PATCH updatesupplierinvoice` when editing, no checks run, BR-SINV-11) · Submit (the one primary, `invoice.manage`, save then `POST :id/submit`, runs match, BR-SINV-23) → "Submitting…". After submit go to detail, which shows the result. No confirm dialog on submit: blocked is saved, not lost.
- **States:** loading skeleton of the form; PO with nothing billable (`getbillablelines` returns no lines, or 400 PO status not billable): `EmptyState` "Nothing left to bill on this PO" + back to PO (BR-SINV-02, 04); 400/409 messages from server shown on the field or in a top alert (`SINV_NOTHING_TO_BILL`, `SINV_AMOUNT_TOO_LARGE`, `SINV_BUSY`, `SINV_STALE_QTY`); `SINV_PO_NOT_BILLABLE` (409, PO status changed: alert with the server text and a link back to the PO); `SINV_COMPANY_SETTINGS_MISSING` (BR-SINV-18): alert on top with the server text and a link to settings; no permission page.
- **Permissions:** `invoice.manage` (`getbillablelines` needs it). Inactive supplier still allowed (BR-SINV-12), no warning.

```
+------------------------------------------------------------------------+
| Enter supplier invoice   (from GRN-2026-11-12)                         |
| ====                                                                   |
| Supplier: Bharat Alloys     PO: PO-2026-11-7                           |
| Supplier invoice no.*[INV-44    ]  Invoice date*[10-11-2026]  Due 10-12-2026
| [ ] Reverse charge  [ ] ITC not eligible                               |
| Items                                                                  |
| GRN        Item   Billable  Billed*  Rate*   GST*  PO rate  Taxable   Match
| GRN-..12   ADC12  980 kg    [980  ]  [241.00][18%] 240.00 2,36,180.00 [Price]
| Charges (0/10)  [ + Add charge ]            +----Computed--Printed--Diff-+
|                                             | Taxable  2,35,200 [     ] |
|                                             | CGST        21,168 [     ] |
|                                             | SGST        21,168 [     ] |
|                                             | IGST   (not used)          |
|                                             | Total    2,77,536 [     ] |
|                                             | Expected result: Blocked   |
|                                [Cancel] [Save draft] [Submit]            |
+------------------------------------------------------------------------+
```

### Invoice detail
- **Purpose:** see the bill, why it is blocked or payable, and act on it.
- **Pattern:** detail, two panes (owner standard). `DetailHeader` (docNo `SINV-…`, status badge + Overdue badge, meta: supplier, supplier inv no., invoice date, due date, reverse charge / ITC flags, back to list) then `DocumentFlow` PR → PO → GRN(s) → Invoice from `detail.flow {pr[], po, grns[]}` (BR-SINV-39; several GRN steps allowed).
- **Header slot:** `DetailHeader` status slot holds both badges (status + Overdue).
- **Left pane (wide):** Card "Match result" (only when not draft): one row per `detail.mismatches` (`check` qty, price, tax, tax_rate, total, charge; `lineId`, `head`, `expected`, `billed`, `unit` paise / milli_qty / bp, shown in plain units), text "Qty: billable 980 kg, billed 990 kg" with expected vs billed, `detail.tolerances` shown ("price 0%, weight 0.5%", BR-SINV-23). Card "Items": GRN no., item, billed qty, rate, PO rate, GST %, taxable, tax, line total, per-line match chip (BR-SINV-39). Card "Charges" when any.
- **Right pane (narrow; below 1280 px it stacks under the left pane in the order Totals, Payment, Release, History):** Card "Totals": computed (`taxablePaise`, `cgstPaise`, `sgstPaise`, `igstPaise`, `totalPaise`) vs printed per head, `debitNotes[]` (one line per linked note: number, status badge, offset `billOffsetPaise`, the amount taken off this bill; BR-SINV-31) and `netPayablePaise` = bill total − sum of `billOffsetPaise` of non-cancelled notes (not the notes' own totals). Card "Payment": `dueDate`, `paymentStatus` "Unpaid" (BR-SINV-28). Card "Release" when released: `releasedBy`, `releasedAt`, `releaseReason`, mismatch list at that time from history `detail` (BR-SINV-25). Card "History": `detail.history`: who, when, from → to, reason (BR-SINV-35).
- **Actions by status (not rendered when not allowed, BR-DS-27):**
  - draft: Edit (`PATCH`), Submit (primary, `POST :id/submit`), More: Delete (`DELETE deletesupplierinvoice/:id`, confirm dialog), all `invoice.manage`.
  - blocked: Release (primary, `POST :id/release`, `invoice.release`, hidden for anyone with a create, edit, back-to-draft or submit row in the bill's history, BR-SINV-25; `SINV_SELF_RELEASE` 403 still handled), Back to draft (outline, `POST :id/back-to-draft`, `invoice.manage`, BR-SINV-24), More: Cancel (`POST :id/cancel`, `invoice.manage`, BR-SINV-26).
  - approved: More: Cancel only (`invoice.manage`); no edit (BR-SINV-26, 28).
  - cancelled: none; shows `cancelReason`.
  - legacy: none; shows the old amount only.
  Every dialog names the document; running state "Releasing…", "Cancelling…".
- **States:** loading: `DetailHeader loading` + card skeletons; 404 "Invoice not found" + back; error + "Try again"; 409 `SINV_BUSY` / `SINV_STALE_QTY` on action: toast "Changed by someone else" and refetch (BR-SINV-34); no permission page.
- **Permissions:** `invoice.view` opens; amounts only for `invoice.view`.
- Source: `detail` (one call). Its `overdue` flag drives the Overdue badge.

```
+------------------------------------------------------------------------+
| < Supplier invoices                                                    |
| SINV-2026-11-3 [Blocked]   Bharat Alloys · INV-44 · 10-11-2026 · due 10-12
| ====                       [Back to draft] [ Release ]  [More v]       |
| PR-..4 > PO-2026-11-7 > GRN-2026-11-12 > (SINV-2026-11-3)              |
| +--Match result---------------------------+ +--Totals--------------+   |
| | [Price] PO 240.00, bill 241.00 (line 1)  | | Computed   Printed   |   |
| | tolerance: price 0%, weight 0.5%         | | Taxable  ...   ...   |   |
| +--Items----------------------------------+ | CGST/SGST ...        |   |
| | GRN  Item  Qty  Rate  PO   GST  Total  M | | Total  2,77,536.00   |   |
| | ..12 ADC12 980  241   240  18%  ...  [Price]| Net payable ...     |   |
| +------------------------------------------+ +--Payment: Unpaid-----+   |
|                                              +--History-------------+   |
+------------------------------------------------------------------------+
```

### Release dialog (Cancel dialog uses the same shape)
- **Purpose:** a second person accepts a blocked bill, with a reason.
- **Pattern:** dialog (≤ 6 fields). Title "Release SINV-2026-11-3?". Body lists the current mismatches read-only (from `detail.mismatches`, already loaded), so the person sees what they accept. Field: Reason* (`reason`, textarea, 3–500, counter, BR-SINV-25). Buttons: Cancel, then the one primary "Release invoice" (`invoice.release`) → "Releasing…". Success toast; no badge flash on detail.
- **Cancel variant:** title "Cancel SINV-…?", Reason* (min 10 chars for a payable bill, min 3 for a blocked one, max 500; counter and field error show the minimum that applies; server code `SINV_REASON_LENGTH`), dismiss button "Keep invoice", primary "Cancel invoice" in danger style, text "Its quantity becomes billable again" (BR-SINV-27). `invoice.manage`.
- **States:** 403 (self-release) or 409 shown as an alert inside the dialog; dialog stays open. Reason too short: field error, no call.

```
+---------------------------------------+
| Release SINV-2026-11-3?               |
| This bill is blocked for:             |
|  - Price: PO 240.00, bill 241.00      |
| Reason*                               |
| [ metal price rose, agreed by phone ] |
|                       3 to 500 chars  |
|              [Cancel] [Release invoice]|
+---------------------------------------+
```

### Tolerance settings
- **Purpose:** owner sets the two match tolerances.
- **Pattern:** new card "Invoice matching" on the existing company settings page (`/subcontracting/settings`, `CompanySettingsForm`), same field look. Not a new screen.
- **Fields:** Price tolerance % (0–10, 2 decimals) · Weight tolerance % (0–10, 2 decimals), help text "Billing above this blocks the invoice. Pieces always match exactly. A change applies to the next submit only" (BR-SINV-22, 32). Source: `GET tol` (`invoice.view`) and `PATCH tol` (`company.manage`), fields `priceTolerancePercent`, `weightTolerancePercent`. The card does not use `GET /api/company/settings`.
- **Actions:** Save (primary, `PATCH tol`, `company.manage`, BR-SINV-32) → "Saving…". Change appears in the existing settings history.
- **States:** loading, error + retry (page existing); 400 "Save company details first" shown as alert; users with `invoice.view` but not `company.manage` see the values read-only (spec Security table); no permission as the page already does.

```
+-- Invoice matching ----------------------------+
| Price tolerance %   [ 0.00 ]                   |
| Weight tolerance %  [ 0.50 ]                   |
| Billing above this blocks the invoice.         |
|                                   [ Save ]     |
+------------------------------------------------+
```

### Next step "Enter supplier invoice" (GRN and PO detail)
- Button in the detail header of GRN (status `accepted`/`partial_accepted`) and PO (has billable qty), shown only with `invoice.manage` and billable qty > 0 (BR-SINV-38). Secondary (outline) so the page keeps its own primary. Links to `/supplier-invoices/new?grnId=…&poId=…` (GRN) or `?poId=…` (PO); the form reads `getbillablelines?poId=&grnId=`.
- PO: the old "Record invoice" button and `MarkPoInvoicedDialog` are removed (BR-SINV-29, D8). PO status Invoiced is now set by the system.
- GRN/PO detail get an "Invoices" card (BR-SINV-39 link back from the bill) for `invoice.view`: our no. (mono link), status badge, total; data from `getsupplierinvoices?grnId=` (GRN) or `?poId=` (PO). States: loading 3 skeleton rows; empty "No invoices yet" (+ "Enter supplier invoice" when BR-SINV-38 allows and the user has `invoice.manage`); error + "Try again"; card not rendered without `invoice.view`.

## Choices made
| Question | Choice | Source |
|---|---|---|
Moved to `../assumptions.md` (A-29 … A-36; legacy badge in A-13) by spec-analyst, 2026-11-20.
