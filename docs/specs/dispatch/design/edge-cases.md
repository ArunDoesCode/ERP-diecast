# Dispatch — edge cases

> Written by spec-analyst from `docs/research/dispatch.md` → "Edge cases seen in the products", the
> owner's delegation (chat 2026-11-20, no interview) and the designers' files. Checked by spec-reviewer:
> every row names a rule. Tests are named by rule id, so the rule id is also the test id. The owner sees
> only the count.

Source: **benchmark** (what ERPNext / Odoo / SAP do) · **owner** (an answered card; here: recommended
option, pre-approved 2026-11-20) · **invariant** (money in paise, stock only through the ledger,
permission + audit on state changes).

| # | Case | What the system does | Source | Rule |
|---|---|---|---|---|
| E-01 | Dispatch from an SO that is draft, on hold, closed or cancelled | Refused 409, no note made | benchmark (ERPNext, SAP: only open orders are drawn) | BR-DSP-01 |
| E-02 | Customer deactivated while its SO is confirmed | Note can still be made and posted | benchmark (ERPNext open orders carry on) | BR-DSP-01 |
| E-03 | User tries to change customer, address or price on the note | Refused 400 (fields not accepted) | invariant | BR-DSP-02, 19 |
| E-04 | Customer address changed between draft and posting | Posted note carries the address at posting | benchmark (ERPNext copies on submit) | BR-DSP-02 |
| E-05 | All lines left at qty 0 | Refused 400 | invariant | BR-DSP-03 |
| E-06 | Same item on two SO lines with different delivery dates | Two note lines, each against its own SO line | benchmark (ERPNext schedule lines) | BR-DSP-03 |
| E-07 | Qty above the SO line's open qty | Refused 400 "only N open" | owner (card 1) | BR-DSP-04 |
| E-08 | 600.5 pcs typed | Refused 400 | invariant | BR-DSP-05 |
| E-09 | Two drafts each ask for the full open qty | Both save; the second to post is refused | benchmark (ERPNext, Odoo drafts do not reserve) | BR-DSP-06, 10 |
| E-10 | Two notes for the same open qty posted at the same second | One posts, the other 409, nothing half-saved | invariant | BR-DSP-10, 16 |
| E-11 | Note dated in the future, or before the SO date | Refused 400 | benchmark (ERPNext posting date rules) | BR-DSP-07 |
| E-12 | Back-dated note (truck left yesterday) | Allowed back to the SO date | research edge "Backdated delivery" (Odoo allows; stricter floor = SO date) | BR-DSP-07 |
| E-13 | Note dated 31 Mar, posted on 2 Apr | Number from the note date's financial year | invariant (GST consecutive series) | BR-DSP-17 |
| E-14 | Ship from a job worker's location or an inactive store | Refused 400, also at posting | invariant | BR-DSP-08 |
| E-15 | Two Finished Goods stores exist | Default is the lowest id; user may pick another | benchmark (all three pick a warehouse per delivery) | BR-DSP-08 |
| E-16 | Stock enough in another store but not in the source store | Post refused 409 "Insufficient stock"; user changes the source | invariant | BR-DSP-13 |
| E-17 | Stock short on line 2 of 2 | Nothing posts, note stays draft | invariant | BR-DSP-13, 16 |
| E-18 | Double click on "Post" | One posts, the other 409 | invariant | BR-DSP-16 |
| E-19 | SO put on hold after the draft was made | Draft can still be saved; post 409 until resumed | benchmark (ERPNext "On Hold" blocks deliveries) | BR-DSP-11 |
| E-20 | SO closed or cancelled with a draft note on it | Draft can only be cancelled | benchmark (ERPNext closed SO blocks new deliveries) | BR-DSP-11 |
| E-21 | SO price changed after the draft | Note uses the price at posting, then frozen | benchmark (ERPNext rate fetched until submit) | BR-DSP-19 |
| E-22 | Paise rounding on qty × price × GST | Half up per line, integer paise, no float | invariant | BR-DSP-19 |
| E-23 | Price-0 sample line | Value 0, e-way optional, posts normally | benchmark (Rule 138 value-based) | BR-DSP-19, 23 |
| E-24 | Item has no HSN, or company GSTIN missing | Post refused 400 naming what to fill | invariant (GST document fields) | BR-DSP-18 |
| E-25 | Item deactivated after the draft | Post refused 400 naming the item | benchmark (ERPNext, SAP B1 block disabled items) | BR-DSP-44 |
| E-26 | Partial delivery | SO stays confirmed, rest stays open | research edge "Partial draw closes the base order" (SAP pain avoided) | BR-DSP-14, 15 |
| E-27 | Last open piece shipped | SO closes itself "fully delivered", reservations released | owner (card 3) | BR-DSP-15 |
| E-28 | Customer won't take the rest of an order | Office closes the SO with a reason; dispatch does nothing | owner (card 3) | BR-DSP-15 |
| E-29 | Posting after an explosion snapshot exists | Snapshot marked out of date | invariant (reservations vs stock that left) | BR-DSP-14 |
| E-30 | Box added after posting | Refused 409 | research edge "Packing slip after posting" (ERPNext) | BR-DSP-22 |
| E-31 | Boxes add up to less than the line qty | Post refused 400 | owner (card 5) | BR-DSP-21 |
| E-32 | Gross kg below net kg, same box number twice, box for a removed line | Refused 400 | benchmark (ERPNext packing slip checks) | BR-DSP-20 |
| E-33 | Some lines packed, others not | Allowed; only packed lines must add up | owner (card 5) | BR-DSP-21 |
| E-34 | Value exactly at the e-way limit | E-way needed (at or above) | benchmark (Rule 138 "exceeding" read strictly) | BR-DSP-23 |
| E-35 | Other-state customer below ₹50,000 | E-way optional | benchmark (Zoho FAQ) | BR-DSP-23 |
| E-36 | Limit setting changed after a draft was saved | Post uses the limit in force at posting; posted notes keep their answer | invariant | BR-DSP-23 |
| E-37 | Big load posted without e-way no | Refused 400 | research "Copy these" 7 | BR-DSP-24 |
| E-38 | Distance 0 km (portal auto-fill) | Refused 400; user types the km | research edge "Zero distance entered" (we store only, no portal) | BR-DSP-24 |
| E-39 | Road with transporter ID but no vehicle | Allowed | benchmark (Tally, India Compliance) | BR-DSP-24 |
| E-40 | Rail / air / ship without transport doc | Refused 400 when e-way needed | benchmark (Zoho Part B fields) | BR-DSP-24 |
| E-41 | Vehicle typed "mh 12 ab-1234", BH series, or "MH12" | Saved MH12AB1234; BH accepted; "MH12" 400 | benchmark (portal vehicle format) | BR-DSP-25 |
| E-42 | E-way no with spaces, 11 digits, or dated before the note | Spaces removed; 11 digits 400; early date 400 | benchmark (portal 12-digit no) | BR-DSP-25 |
| E-43 | Same e-way no on two live notes | Second 409; a cancelled note frees it | research edge "Multi-vehicle load" | BR-DSP-26 |
| E-44 | Load split over two trucks | Two notes, one vehicle and one e-way no each | research edge "Multi-vehicle load" | BR-DSP-26 |
| E-45 | Vehicle breaks down, goods moved to another truck | Vehicle changed on the posted note, history kept | research edge "Vehicle changed in transit" | BR-DSP-27 |
| E-46 | Small load posted, e-way bill made later | E-way no, date and distance added once after posting | benchmark (India Compliance updates after submit) | BR-DSP-27 |
| E-47 | Change qty, an existing e-way no or distance after posting | Refused 409 | research edge "Wrong e-way data after 24 h" | BR-DSP-27, 34 |
| E-48 | E-way bill validity runs out before arrival | Shown "E-way expired"; never blocks | research edge "E-way bill expired" | BR-DSP-28 |
| E-49 | Draft cancelled | Nothing posts, no number used | benchmark (ERPNext draft cancel) | BR-DSP-29 |
| E-50 | Back office tries to cancel a posted note | 403 | owner (card 6) | BR-DSP-30, 35 |
| E-51 | Posted note cancelled | Stock back at the cost it left, SO open qty back | owner (card 4) | BR-DSP-31 |
| E-52 | Cancel while the SO is on hold | Allowed; SO stays on hold | benchmark (ERPNext cancels against held orders) | BR-DSP-32 |
| E-53 | Cancel after the SO closed "fully delivered" | SO back to confirmed, snapshot out of date | owner (card 4) | BR-DSP-32 |
| E-54 | Cancel after the SO was closed by hand | Refused 409 | invariant (hand close is final) | BR-DSP-32 |
| E-55 | Two cancels of one note at once | One 200, one 409 | invariant | BR-DSP-33 |
| E-56 | Delete a note | No such route (404); cancel and remake | benchmark (ERPNext, SAP never delete submitted) | BR-DSP-34 |
| E-57 | User without a dispatch key opens notes | 403 | invariant | BR-DSP-35 |
| E-58 | Floor supervisor (no price right) opens or prints a note | Qty only, e-way hint still shown, no ₹ anywhere | invariant (price right) | BR-DSP-43 |
| E-59 | Floor supervisor can't open the sale order | Starts the note from the pending-dispatch row | invariant | BR-DSP-37, 39 |
| E-60 | Stock lower than open qty on the pending list | "Short stock" tag, information only | benchmark (ERPNext pending-to-deliver report) | BR-DSP-39 |
| E-61 | Print a draft or a cancelled note | DRAFT / CANCELLED watermark, no number on draft | invariant | BR-DSP-41 |
| E-62 | Floor supervisor tries to lower the e-way limit | 403; owner changes it, history row | invariant | BR-DSP-35, 42 |
| E-63 | Every create, edit, post, transport change, cancel | Audit row with who, when, before → after | invariant | BR-DSP-36 |
| E-64 | A note names a line of another sale order | Refused 400, message does not reveal the other order | invariant | BR-DSP-03 |
| E-65 | The same SO line twice on one note | Refused 400 | invariant | BR-DSP-03 |
| E-66 | SO line removed by the office after the draft was made | Post refused 400; user edits the draft | invariant | BR-DSP-03 |
| E-67 | SO line removed from a confirmed order | Not on the pending list, can't be picked | invariant | BR-DSP-39 |
| E-76 | Last open piece of L1 shipped; L2 was soft-removed by the office | Removed line ignored: SO closes itself "fully delivered" | invariant | BR-DSP-15 |
| E-68 | Office cuts every line down to what was delivered | SO stays confirmed (no posting happened); office closes it by hand | benchmark (ERPNext manual "Closed") | BR-DSP-15 |
| E-69 | Customer in Maharashtra, ship-to in Tamil Nadu | Ship-to state decides same / other state for the e-way check | benchmark (Rule 138 place of delivery; Zoho Part A "place of delivery") | BR-DSP-23 |
| E-70 | Pending list asked for stock at a job worker's location | Refused 400 | invariant | BR-DSP-39 |
| E-71 | Posted note switched from road to rail | Refused 409; cancel and remake | benchmark (Zoho: only Part B vehicle updated) | BR-DSP-27 |
| E-72 | SO price raised after a draft was saved | Register and detail show the flag from the last save; posting recomputes | invariant | BR-DSP-40, 23 |
| E-73 | Company address changed after a note was posted | Print keeps the address copied at posting | invariant (posted documents don't change) | BR-DSP-41 |
| E-74 | Floor supervisor makes and posts a note himself | Allowed; only cancelling a posted note is owner-only | benchmark (ERPNext Stock User submits delivery notes) | BR-DSP-35 |
| E-77 | Vehicle no. cleared on a posted road note that needs an e-way bill, no transporter ID | Refused 400 | invariant | BR-DSP-27 |
| E-78 | Confirmed SO whose only open line was soft-removed | No "Dispatch" button, nothing on the pending list | invariant | BR-DSP-37, 39 |
| E-79 | SO screen with a soft-removed line | Removed line not shown in ordered / delivered / open | invariant | BR-DSP-38 |
| E-75 | Posted note cancelled after an explosion claimed stock | Stock comes back, the order's earlier claims do not; a re-run claims again | benchmark (ERPNext cancel does not re-reserve) | BR-DSP-31 |
