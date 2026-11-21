# RFQ, quotes, award, rate contracts — screens

> Written by ui-ux-designer from `../spec.md` (draft v0). Endpoints and fields: `api.md` (paths below are
> under `/api`). Pictures are ASCII wireframes,
> not screenshots (no mock pages built; nothing added under `frontend/`). Tokens and components: design-system skill.

## Screen list
| # | Screen | Route | Pattern |
|---|---|---|---|
| 1 | RFQ list | `/rfq` | list |
| 2 | New / edit RFQ | `/rfq/new`, `/rfq/[id]/edit` | form |
| 3 | RFQ detail | `/rfq/[id]` | detail |
| 4 | Quote entry (draft edit and submitted view) | `/rfq/[id]/quotes/new`, `/rfq/[id]/quotes/[quoteId]` | form |
| 5 | Comparison + award | `/rfq/[id]/compare` | detail |
| 6 | RFQ print sheet | `/rfq/[id]/print?supplier=` | print page |
| 7 | Rate contract list | `/rate-contracts` | list |
| 8 | Rate contract detail | `/rate-contracts/[id]` | detail |
| 9 | New / edit rate contract | `/rate-contracts/new`, `/rate-contracts/[id]/edit` | form |
| 10 | PO form: contract rate + override | existing PO create dialog and PO detail | change |
| 11 | "Request quotes" entry | existing `/purchase-orders` queue and PR modal | change |

## Rules for all screens
- **Standards:** two-pane detail (main left; right pane 320 px = Next step card, summary, audit: who and when), stacked below 1024 px. Full lists (no split panel). Forms are full pages (not dialogs), label above a 36 px field, `min-h-19`, actions bottom right ("Cancel" + one primary). Every control reachable by Tab in reading order; Enter submits a form; radios use arrow keys. Tokens only, light and dark.
- **Next step card** (BR-RFQ-60, 61): one primary button for the document's next step, shown only with its key; no key → text "Waiting for <role>" with no button.
- **States, every screen unless stated:** loading = skeleton in the final layout (list: 8 rows) · error = `ErrorState` + "Try again" · empty = `EmptyState` with its one action (action hidden without key) · no permission = existing route guard, nothing of the page renders (BR-RFQ-70).
- **Status badges** (`StatusBadge`; add `rfq`, `quote`, `contract` to `status-tone.ts`, existing tones only):
  | Doc | Status → tone |
  |---|---|
  | rfq | draft neutral · sent info · partially_awarded info · awarded success · closed closed · cancelled closed |
  | quote | draft neutral · submitted info · awarded success · not_awarded closed · cancelled closed |
  | contract | draft neutral · active success · expired warning · terminated closed · cancelled closed |
  | flags | "Late" danger · "Lowest" success · "Expired" closed tone (via `status-tone.ts`, with icon + label). Muted rows (expired, not quoted, inactive) use `text-muted-foreground`, never opacity |
- Money `formatMoney(paise)`; rate columns "per <uom>"; qty `formatQty(v, uom, 3)`; dates `formatDate`; doc numbers mono accent link.
- Lists 1 and 7 use `Pagination` (page size from `lib/pagination.ts`). Rendering: memoised rows; virtualise a table above about 100 lines.
- Destructive actions (cancel, close, terminate, cancel quote) sit in "More", open a dialog naming the document with a required reason box (3–500, counter), button "Cancel RFQ" etc.

### 1. RFQ list
- **Source:** `GET /rfq/getrfqs` (filters `status`, `supplierId`, `q`; sort `dueDate`, `createdAt`). Row fields `supplierCount`, `quotedCount`, `lineCount`.
- **Purpose:** purchase finds an RFQ and its status.
- **Fields:** RFQ no. · status · suppliers (count, "3 of 5 quoted") · lines (count) · quote due (red text if past and still open) · created by · created on.
- **Quick filters:** All · Draft · Sent · Partially awarded · Awarded · Closed. Right: supplier select, search by RFQ no. / notes.
- **Actions:** "New RFQ" (primary) `rfq.manage` → `/rfq/new` (BR-RFQ-01..05). Row link → detail.
- **Permissions:** open `rfq.view`; "New RFQ" hidden without `rfq.manage`.
- **States:** loading 8 skeleton rows · empty "No RFQs yet. Start one from an approved requisition." (no action, the start is on the PR queue; with filters: "Nothing matches these filters" + Reset) · error `ErrorState` + retry · no permission: route guard. `Pagination` below.
```
RFQ                                              [ + New RFQ ]
(All)(Draft)(Sent)(Part. awarded)(Awarded)(Closed) [Supplier v] [search]
RFQ no.        | Status | Suppliers | Lines | Due   | By | Created
RFQ-2026-11-1  | Sent   | 2 of 3    | 1     | 25-11 | AK | 20-11
1 to 25 of 41                                        < 1 2 >
```

### 2. New / edit RFQ (draft only)
- **Source:** save `POST /rfq/createrfq` `{dueDate, notes, supplierIds, prItemIds}` · edit `PATCH /rfq/updaterfq` (add/remove ids; 409 `RFQ_NOT_EDITABLE`) · line picker `GET /rfq/pr-lines` (`prId`, `onOpenRfq`, `q`) · supplier select: existing suppliers list · edit loads `GET /rfq/getrfqdetails/:id`. Errors `RFQ_LINE_NOT_PENDING`, `SUPPLIER_INACTIVE`, `PR_LINE_ON_OPEN_RFQ` shown under the card.
- **Purpose:** pick PR lines and suppliers, set due date.
- **Fields:** Quote due date (date, not before today; BR-RFQ-05) · Notes (0–2000) · Lines card: table of PR no., item, qty + uom (read-only, BR-RFQ-03), contract hint "Contract S1 ₹244.00" (BR-RFQ-10), remove button; "Add PR lines" opens a picker of pending lines of approved / partial_ordered PRs, lines on another open RFQ shown disabled with "On <openRfqNumber>" (link for `rfq.view` holders, plain text otherwise; fields `openRfqId`, `openRfqNumber`) (BR-RFQ-01, 02). Suppliers card: searchable multi-select, 1–10 chips, inactive suppliers not offered (BR-RFQ-04), counter "3 of 10".
- **Arrival from PR:** `/rfq/new?pr=<id>` opens with that PR's pending lines ticked.
- **Actions:** "Save draft" (primary) `rfq.manage` · "Cancel". No confirm. Edit route for a non-draft RFQ redirects to detail (BR-RFQ-06).
- **Permissions:** open and save `rfq.manage`; without it the route guard. Loading: skeleton cards. Load error: `ErrorState`.
```
New RFQ
Quote due [25-11-2026]   Notes [..................]
Lines (1)                                   [ Add PR lines ]
PR-2026-11-4 | ADC12 | 1,000 kg | Contract S1 ₹244.00 | [x]
Suppliers (3 of 10)  [Bharat x][Sri Metals x] [+ add supplier v]
                                   [ Cancel ] [ Save draft ]
```
- **States:** extra: zero lines or zero suppliers → inline error under the card; save disabled "Saving…" while running.

### 3. RFQ detail
- **Source:** `GET /rfq/getrfqdetails/:id` (header, lines with award, PO number / status, PR-line-cancelled flag, contract rate per supplier), which also carries the quotes list (no separate quotes call). Actions: `POST /rfq/:id/send`, `/cancel`, `/close` (reason). 409 `RFQ_INVALID_STATUS`, `RFQ_HAS_AWARD`.
- **Purpose:** run one RFQ from draft to award.
- **Header:** `DetailHeader` RFQ no., status, meta: due date, created by, sent by / at; `DocumentFlow` PR → RFQ → PO (one chip per awarded PO).
- **Main pane:** Lines table (item, qty, "Contract S1 ₹244.00", status "Open · Awarded to S1 → PO-2026-11-7 · PO cancelled · PR line cancelled · Dropped"; BR-RFQ-11, 31, 33). Quotes table (supplier, quote ref, status, valid till, "Late" flag, lines priced "2 of 3", total landed; row actions Open / Submit / Cancel). Suppliers with no quote show "No quote yet" + "Enter quote". Empty quotes card: "No quotes yet" with "Enter quote" (hidden without `rfq.manage`; text stays). Draft RFQ: card says "Send the RFQ to start quoting".
- **Next step card** (BR-RFQ-60): draft → "Send" · sent / partially_awarded → one primary "Enter quote" · all lines awarded → link to the PO(s). One primary only; "Compare" is a button in the header, not in the card. Actions: "Send" `rfq.manage` (confirm: "Locks lines and suppliers; nothing is e-mailed"; BR-RFQ-07, 09; 409 shown inline naming line or supplier) · "Print sheets" `rfq.view` → screen 6 (sent and every later status) · "Compare" `rfq.view` (header) · More: "Close RFQ" (BR-RFQ-35), "Cancel RFQ" (BR-RFQ-36; hidden once a line is awarded), "Edit" (draft).
- **Permissions / states:** open `rfq.view`; Send, Enter quote, Close, Cancel, Edit hidden without `rfq.manage`. States per the global rules (skeleton two-pane, `ErrorState` + retry, route guard).
- **Wireframe:**
```
RFQ-2026-11-1  [Sent]                         [ Compare ] [More v]
PR-2026-11-4 > RFQ-2026-11-1 > PO-2026-11-7
+-- Lines --------------------------------+ +- Next step ----------+
| ADC12 1,000 kg  Contract S1 ₹244.00     | | Quotes in: 2 of 3     |
|   Awarded to Bharat Alloys → PO-11-7    | | [ Enter quote ]       |
+-- Quotes -------------------------------+ | Due 25-11-2026        |
| Bharat  BA/Q/118 Submitted 30-11 2/3    | | Sent by A. on 20-11   |
| Sri M.  SM/9    Submitted  Late  1/3    | +-----------------------+
| Om Cast. No quote yet     [Enter quote] |
+-----------------------------------------+
```

### 4. Quote entry (full page)
- **Source:** `POST /rfq/:id/quotes` (new) · `PATCH /rfq/quotes/:quoteId` (draft, replaces all lines) · `GET /rfq/quotes/:quoteId` (load; returns computed `lineValuePaise`, `lineTaxPaise`, `landedRatePaise`) · submit `POST /rfq/quotes/:quoteId/submit` · cancel `POST /rfq/quotes/:quoteId/cancel`. Line body `{rfqItemId, isQuoted, ratePaise, gstPercent, leadDays, freightPaise}`; the screen computes the landed column for display only, server value wins on save. Errors `QUOTE_EXISTS`, `QUOTE_EMPTY`, `QUOTE_NOT_EDITABLE`, `QUOTE_AWARDED`.
- **Purpose:** type what a supplier quoted on the phone / paper.
- **Fields header:** Supplier (select of RFQ suppliers without a live quote, or fixed when arriving from a supplier row) · Quote ref (1–100) · Quote date (not future) · Valid till (required, ≥ quote date) · Payment terms days (0–365, default supplier's; BR-RFQ-14). Shown note "Late" if today > due (BR-RFQ-17), not a block.
- **Lines table** (one row per RFQ line): item, qty (read-only) · "Not quoted" checkbox · Rate (₹ per uom) · GST % (select, BR-SUP-13 list) · Lead days · Freight for whole line (₹). Computed read-only columns: Value, Tax, Landed rate per unit (BR-RFQ-16), updating as typed. Rate input right-aligned with unit suffix.
- **Actions** (bottom right, in order): "Cancel" · "Save draft" · "Submit quote" primary; all `rfq.manage`. Submit (confirm: "A submitted quote can't be edited. A change means cancel and enter a new one"; BR-RFQ-18; zero priced lines → inline `QUOTE_EMPTY`) · submitted view is read-only with "Cancel quote" in More (reason; hidden when a line is awarded, BR-RFQ-19) . "Cancel" returns to the RFQ.
- **Permissions / states:** open `rfq.view` (read-only view); edit controls `rfq.manage`. Loading skeleton form; error `ErrorState`; empty lines n/a.
- **Errors:** `QUOTE_EXISTS` on supplier select: "A quote from <supplier> is already live. Cancel it first." with link.
```
Quote · RFQ-2026-11-1
Supplier [Bharat Alloys v]  Ref [BA/Q/118]  Date [..]  Valid till [..]  Terms [30]
Item  Qty      Not quoted  Rate/kg   GST   Lead  Freight  | Landed/kg
ADC12 1,000 kg   [ ]      [245.00]  [18%]  [7]  [2,000.00]|  247.00
                              [ Cancel ] [ Save draft ] [ Submit quote ]
```

### 5. Comparison + award
- **Source:** `GET /rfq/:id/comparison` (`rows[].cells[]`: `state` priced / not_quoted / no_quote / expired / inactive, `isLowest`, `eligible`, `landedRatePaise`, `isLate`; `lastPoRatePaise`; `contract[]`). Award `POST /rfq/:id/award` `{lines:[{rfqItemId, quoteItemId, reason?}]}` → `pos[{poId, poNumber, supplierId, lineCount}]`, `awards[].source` contract / quote (drives "PO will use contract" note). Errors `QUOTE_EXPIRED`, `SUPPLIER_INACTIVE`, `AWARD_REASON_REQUIRED`, `RFQ_LINE_AWARDED`, `RFQ_LINE_NOT_PENDING`, `CONTRACT_QTY_EXCEEDED` (all shown in the banner naming the line). Cell `state` "inactive" shows greyed "Supplier inactive".
- **Purpose:** see every supplier's price per line, pick winners, make the POs.
- **Answer to D4 (tablet, 10 suppliers):** the grid is turned: **one block per RFQ line, one row per supplier**, sorted lowest landed first, so ten suppliers scroll down and never sideways at 1024 px. (BR-RFQ-20 words it "column per supplier"; all its fields are kept. Raised below.) Each block is one `DataTable` (density tokens, no custom row height). Row columns: pick radio · Supplier · Rate · GST % · Freight · **Landed per unit** (bold) · Lead days · Valid till · Terms · flags. Under the block title: last PO rate and active contract rate for the item (BR-RFQ-20); last PO rate and contract rate are hidden without `po.manage` / `contract.view`. First column and the block title stay sticky when a block is longer than the screen; row height 44 px, radio target 44 × 44 on tablet.
- **Flags:** lowest = "Lowest" success badge (BR-RFQ-21..23) · "Expired" greyed row, radio disabled with the reason in text (BR-RFQ-22, 26) · "Not quoted" greyed · "Late" · cancelled quotes are listed last, muted, with "Cancelled by <user>, <date>: <reason>" (draft quotes are not listed); suppliers without a submitted quote appear last as "No quote yet" (BR-RFQ-24). A row whose supplier has a contract for the item shows "PO will use contract ₹244.00" (BR-RFQ-29).
- **Pick and reason:** radio default is empty (the lowest is not preselected, so every award is a deliberate click). Picking a row that is not "Lowest" opens a required "Why not the lowest?" box (3–500) inside the block (BR-RFQ-27). Awarded blocks are read-only: "Awarded to S1 → PO-2026-11-7" link, reason shown if given.
- **Sticky footer row** inside the page card (existing `Button` + text, no new shared component): "2 of 3 lines picked · 2 draft POs: Bharat Alloys (2 lines), Sri Metals (1 line)" and "Award → PO" primary. Needs `rfq.award` **and** `po.manage`; with neither hidden, the bar shows only the summary. Click → confirm dialog listing the POs and any reasons (BR-RFQ-28, 32). Whole-save failure: error banner naming the line or supplier, nothing changes, picks kept (BR-RFQ-32; 409 `RFQ_LINE_AWARDED` reloads the grid with "Someone awarded this line").
- **After award:** go to `/rfq/[id]` with a toast and links to the new draft POs (BR-RFQ-31).
- **States:** loading skeleton blocks · empty (no submitted quotes): "No submitted quotes yet" + "Enter quote" (`rfq.manage`, hidden otherwise) · error `ErrorState` + retry. Memoised rows; virtualise above about 100 lines.
- **Permissions:** open `rfq.view`; award controls (radios, reason, bar button) hidden without `rfq.award` + `po.manage`; read-only on awarded, closed, cancelled RFQs.
```
ADC12 · 1,000 kg   Last PO ₹243.00 · Contract S1 ₹244.00
 ( ) Supplier        Rate    GST  Freight  LANDED  Lead  Valid till  Terms
 (o) Bharat [Lowest] 245.00  18%  2,000    247.00  7d    10-12       30d
 ( ) Sri Metals      243.00  18%  5,000    248.00  10d   15-12       45d
 ( ) Om Cast. [Late] 250.00  18%  –        250.00  5d    12-11 Expired
 Why not the lowest? [ required when row 1 is not picked ........ ]
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 1 of 1 lines picked · 1 draft PO: Bharat Alloys        [ Award → PO ]
```

### 6. RFQ print sheet (answer to D6)
- **Choice:** browser print of an A4 page, no PDF file. One sheet per supplier, page break between, "Print sheets" prints all, `?supplier=` prints one. Content: RFQ no., supplier name, due date, item, qty, uom, blank "Rate / GST / Lead / Valid till" lines for the supplier to fill. No notes. Never other suppliers' names or any rate or contract (BR-RFQ-08). A `print:` stylesheet with tokens, always light (like the SCO challan); screen chrome hidden. Allowed from `sent` onward, including awarded, closed and cancelled-after-sent RFQs (coordinator decision; `api.md` currently allows only sent / partially_awarded and must change). Source `GET /rfq/:id/print` (`sheets[]`, `company` letterhead, null = no letterhead), then `window.print()`. Needs `rfq.view`. States: loading, error (`ErrorState` + retry), no permission route guard; empty n/a (a sent RFQ always has suppliers).
```
<Company letterhead>            REQUEST FOR QUOTATION
RFQ-2026-11-1   Due 25-11-2026        To: Sri Metals, <address>
Item          | Qty      | Rate | GST | Lead | Valid till
ADC12 ingot   | 1,000 kg | ____ | ___ | ____ | ________
```

### 7. Rate contract list
- **Source:** `GET /rate-contract/getcontracts` (`status`, `supplierId`, `itemId`, `endsWithinDays=30`, `q`; `expired` is computed). Row fields `itemCount`, `orderedPercent` (null when all lines rate-only, shown "–"), shown as text.
- **Fields:** Contract no. · status · supplier · items (count) · valid from – to · ordered % (overall) · created by. Quick filters: All · Draft · Active · Ends within 30 days · Expired · Terminated (BR-RFQ-47, 49). Right: supplier select, item select.
- **Actions:** "New contract" primary `contract.manage`. Open `contract.view`; "New contract" hidden without `contract.manage`.
- **States:** loading 8 skeleton rows · empty "No rate contracts yet." (+ "New contract" with key) · error retry · no permission guard. `Pagination` below.
```
Rate contracts                                 [ + New contract ]
(All)(Draft)(Active)(Ends in 30 days)(Expired)(Terminated) [Supplier v]
RC no.        | Status | Supplier | Items | Valid          | Ordered
RC-2026-12-1  | Active | Bharat   | 1     | 01-11 – 31-12  | 60 %
```

### 8. Rate contract detail
- **Source:** `GET /rate-contract/getcontractdetails/:id` (`status` stored, `effectiveStatus` shows Expired; lines `agreedQty`, `orderedQty`, `receivedQty`, `percentOrdered`, `capQty`; POs). Actions `POST /rate-contract/:id/activate`, `/terminate` `{reason, terminatedOn?}` (default today, up to valid-to), `/cancel` `{reason}`; edit = `PATCH updatecontract` via screen 9. 409 `CONTRACT_OVERLAP` (clashing number in `details`), `CONTRACT_INVALID_STATUS`, `CONTRACT_NOT_EDITABLE`. Badge uses `effectiveStatus`.
- **Header:** contract no., status, supplier, valid from – to, allowance %, notes; flow not used. Right pane: Next step (draft → "Activate"), activated by / at, terminated by / at / reason.
- **Permissions / states:** open `contract.view`; Activate, Terminate, Cancel, Edit hidden without `contract.manage`. States per the global rules (skeleton, `ErrorState` + retry, route guard).
- **Lines table** (BR-RFQ-49): item · rate/uom · GST % · agreed qty · ordered · received · % ordered (text only, e.g. "60 %") · "Rate only" when no agreed qty. Row expands to the POs that drew from it (PO no. link, qty, date).
- **Actions:** "Activate" `contract.manage` (confirm; `CONTRACT_OVERLAP` shown with link to the clashing contract; valid-to in the past → inline error; BR-RFQ-45, 46) · More: "Edit" and "Cancel contract" (draft only, reason; BR-RFQ-44), "Terminate" (active only, termination date + reason 3–500, confirm names the contract; BR-RFQ-48). An active contract shows no edit anywhere.
```
RC-2026-12-1 [Active]  Bharat Alloys  01-11 to 31-12  Allowance 0%   [More v]
Item   Rate/kg  GST  Agreed   Ordered  Received  % ordered
ADC12  244.00   18%  5,000kg  3,000kg  2,500kg   60 %
```

### 9. New / edit rate contract (draft only)
- **Source:** `POST /rate-contract/createcontract` · `PATCH /rate-contract/updatecontract` (`{supplierId, validFrom, validTo, allowancePercent, notes, lines[{itemId, ratePaise, gstPercent, agreedQty|null}]}`); edit loads `getcontractdetails/:id`.
- **Fields:** Supplier (active only) · Valid from · Valid to (both required, to ≥ from) · Allowance % (0–20, default 0, helper "Extra quantity allowed over the agreed qty") · Notes · Lines card: Item (active, once each) · Rate (₹ per uom) · GST % · Agreed qty (blank = rate-only; ≤ 3 decimals; BR-RFQ-40, 41). Helper under dates: "Rate is fixed for the whole period. For a new price, make a new contract (BR-RFQ-42)."
- **Actions:** "Cancel" then "Save draft" (primary) `contract.manage`. Server errors under the field. Empty lines card: "Add at least one item."
- **States / permissions:** open and save `contract.manage` (else guard); loading skeleton form; load error `ErrorState`.
```
New rate contract
Supplier [v]  Valid from [..] Valid to [..]  Allowance % [0]  Notes [...]
Item [ADC12 v] | Rate/kg [244.00] | GST [18%] | Agreed qty [5,000] | x
[ + Add item ]
                                   [ Cancel ] [ Save draft ]
```

### 10. PO form: contract rate and override (change to PO create dialog and PO detail line table)
- **Source:** rate prefill `GET /asset/items/:itemId/last-rate?supplierId&onDate` (source `contract` wins; label "Contract") · save `POST /po/createpo`, `PATCH /po/updatepo` with `rateOverrideReason` · detail lines `contractNumber`, `contractRatePaise`, `quoteNumber`, `rateSource`, override fields. Errors: 403 `PERMISSION_DENIED` (key `contract.override_rate`), 400 `OVERRIDE_REASON_REQUIRED` shown as a field error under Reason, 409 `CONTRACT_QTY_EXCEEDED` (`details` agreed, ordered, cap), `CONTRACT_NOT_ACTIVE` on submit.
- **Expected date:** a PO made by award has no expected date; the PO form shows it empty with a required-before-send error "Set the expected date before sending" (coordinator decision).
- **Contract line:** rate source badge shows "Contract" with the contract no. as link; GST % comes from the contract; the line shows "Contract RC-2026-12-1 · 2,500 kg left (cap 5,500)" (BR-RFQ-50, 52). Rate input is read-only for users without `contract.override_rate`, helper "Fixed by contract RC-2026-12-1".
- **Override** (`contract.override_rate` only): link "Override rate" opens the rate field plus a required "Reason" (3–500). Saved line shows "Override · was ₹244.00 · <reason> · by <user>, <date>" (BR-RFQ-51, 71). Others see that note read-only.
- **Qty over cap:** inline error on the qty field "Over contract quantity: 2,500 kg left"; `CONTRACT_QTY_EXCEEDED` on submit and approve shown in the same place (BR-RFQ-52).
- **Contract ended:** a draft PO with a dead contract link shows a warning banner "Contract RC-… is no longer active. Change the rate on this line to continue"; Submit stays shown and the 409 `CONTRACT_NOT_ACTIVE` text points to the line; editing the rate drops the link (BR-RFQ-54).
- **From award:** draft PO shows "From RFQ-2026-11-1 · quote BA/Q/118" on each line and freight lines in notes (BR-RFQ-30, 31).
```
Line  ADC12  Qty [1,000] kg  Rate ₹ 244.00 (read-only)  GST 18%  [Contract RC-2026-12-1]
      2,500 kg left (cap 5,500)                          [Override rate]  (owner only)
      Reason [..........................]  (appears after "Override rate")
```

### 11. "Request quotes" entry (answer to D5)
- **Source:** `GET /rfq/pr-lines` (`onOpenRfq`, `openRfqId`, `openRfqNumber`).
- **Permissions / states:** button only with `rfq.manage`; states are the existing queue and modal states.
```
PR-2026-11-4  Approved  ADC12 1,000 kg   [ Create PO ] [ Request quotes ]
PR-2026-11-5  Approved  Zinc 500 kg      On RFQ-2026-11-2
```
- **Choice:** two entries, same target `/rfq/new?pr=<id>`, both only with `rfq.manage`: (a) a row action "Request quotes" next to "Create PO" in the approved-PR queue at `/purchase-orders`; (b) the same button in the footer of the PR detail modal. Shown when the PR is approved / partial_ordered and has pending lines (BR-RFQ-60).
- **Lines on an open RFQ:** in the queue and in the modal, that line shows "On RFQ-2026-11-1" (`openRfqNumber`; a link for `rfq.view` holders, plain text otherwise) in place of "Create PO" for that line; the modal's Create PO list skips it (BR-RFQ-02, `PR_LINE_ON_OPEN_RFQ`). After the RFQ ends the line is normal again.
- **After the RFQ:** PR modal shows "RFQ-… · Awarded → PO-…" under the line, using the DocumentFlow chips.

## Choices made
These rows are moved into `../assumptions.md` by spec-analyst; that file is the record.
Moved to `../assumptions.md` (A-08, A-15, A-19..A-21) by spec-analyst, 2026-11-20.
| Question | Choice | Source |
|---|---|---|

## Questions
1. BR-RFQ-20 says "column per supplier"; screen 5 uses a row per supplier. Recommend spec-analyst reword to "every supplier shown per line".
2. Contract seed: card C6 says only owner holds `contract.manage`; back office then sees contracts but cannot make one. Fine for screens (buttons hidden); no change asked.
