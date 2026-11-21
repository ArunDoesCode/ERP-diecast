# Stock transfer — edge cases

> Written by spec-analyst from `docs/research/stock-transfer.md` → "Edge cases seen in the products", the
> owner cards (owner delegated, option A taken) and the designers' files. Every row names a rule in
> `../spec.md`; the rule id is also the test id. The owner sees only the count.

Source: **benchmark** (what ERPNext / Odoo / SAP do) · **owner** (an answered card) ·
**invariant** (money in paise, stock only through the ledger, permission + audit on state changes).

| # | Case | What the system does | Source | Rule |
|---|---|---|---|---|
| E-01 | Same source and destination | 400 "Source and destination must differ" | benchmark (SAP B1 KBA 3672130) | BR-STR-01 |
| E-02 | Destination left empty | 400 validation, nothing saved | benchmark (SAP B1 KBA 3672130) | BR-STR-01 |
| E-03 | Source or destination inactive when saving | 400, nothing saved | benchmark (SAP B1) | BR-STR-02 |
| E-04 | Location id that does not exist | 404 | benchmark (SAP B1) | BR-STR-02 |
| E-05 | Qty above the source balance | 409 "Line n: insufficient stock at <location>", nothing posted | benchmark (stricter: refuse over negative) | BR-STR-13 |
| E-06 | Plant total enough but this location short | 409; the check is per location, not plant total | benchmark (SAP B1 per warehouse) | BR-STR-13 |
| E-07 | Qty 0 or negative | 400 | benchmark (research Q5) | BR-STR-04 |
| E-08 | 2.5 pcs on a pieces item; 200.1255 kg | 400 (whole pcs/set, max 3 decimals) | benchmark (research Q5) | BR-STR-05 |
| E-09 | Item whose average cost is 0 | 400 "Item has no cost — fix by stock-take first", on save and at post | benchmark (ERPNext zero-rate needs explicit allow; stricter) | BR-STR-16 |
| E-10 | What value moves | Both legs at the item's plant average cost; plant stock and value unchanged | benchmark (SAP B1, ERPNext) | BR-STR-14, 15 |
| E-11 | Change a posted transfer | 409; reverse it and make a new one | benchmark (ERPNext cancel-and-amend) | BR-STR-09, 24 |
| E-12 | Undo a posted transfer | Mirror rows at the same qty and cost, status `reversed`, reason saved | benchmark (ERPNext cancel, Odoo return) | BR-STR-19, 20 |
| E-13 | Undo after part of the stock was used at the destination | 409 "Line n: only x kg left at <location>", nothing reversed | benchmark (stricter: refuse over negative) | BR-STR-21 |
| E-14 | Short receipt / partial transfer | Not possible: one step, you post what moved; fix the qty on the draft before posting | benchmark (Odoo backorder; one-step chosen) | BR-STR-11 |
| E-15 | Two drafts list the same stock (no request / reservation step) | A draft reserves nothing; the first post wins, the second gets 409 if short | benchmark (SAP B1 request commits; ours has no request step) | BR-STR-08, 13 |
| E-16 | Batch-tracked item | Line holds item and qty only; batch is not carried | benchmark (Computec WMS forces batch; out of v1) | BR-STR-04 |
| E-17 | Location used by transfers is later retired | Never deleted, only deactivated; transfers keep their link | benchmark (ERPNext) | BR-STR-02 |
| E-18 | GST on a move between our own places | None; no tax, no price, no accounting entry | benchmark (ERPNext plain Material Transfer) | BR-STR-35 |
| E-19 | One line fails at post | Whole transfer refused, error names the line, draft stays draft | benchmark (all agree) | BR-STR-12 |
| E-20 | Rejected castings moved to the scrap yard | Item and value unchanged; not a write-off | benchmark (transfers never change value: SAP B1, ERPNext) | BR-STR-33 |
| E-21 | Stock needs hours or days to arrive | Not in v1; both legs post together | owner (Card 1) | BR-STR-11 |
| E-22 | Clerk wants to check lines before stock moves | Saved as a draft, posted separately; a draft has no stock effect | owner (Card 2) | BR-STR-08, 11 |
| E-23 | Need a Shop Floor / Quarantine / Re-melt bin place | New location type `store`, any number | owner (Card 3) | BR-STR-32 |
| E-24 | Floor supervisor creates or posts a transfer | 403, nothing changes | owner (Card 4) | BR-STR-34 |
| E-25 | Floor supervisor reverses; back office reverses | 403; back office with a reason → reversed | owner (Card 5) | BR-STR-19, 34 |
| E-26 | Move to or from a job worker's place | 400 "Use a job work challan" | owner (Card 6) | BR-STR-03 |
| E-27 | Location became a job worker place after the draft was saved | Refused at post | owner (Card 6) | BR-STR-03 |
| E-28 | Clerk enters a past date | Not possible; dated at posting, server time | owner (Card 7) | BR-STR-18 |
| E-29 | Client sends a cost or value | 400 (strict body) | invariant | BR-STR-07 |
| E-30 | Double click on post / two users post at once | One succeeds, the other 409; 2 ledger rows per line total | invariant | BR-STR-17 |
| E-31 | Two transfers sharing items post at once | Queued on the item lock; the second sees the new balance | invariant | BR-STR-13, 17 |
| E-32 | Location deactivated after the draft was saved | Post → 400, nothing posted | invariant | BR-STR-02 |
| E-33 | Item deactivated after the draft was saved | Post → 400, nothing posted | invariant | BR-STR-06 |
| E-34 | Item deactivated after posting, then reverse | Reversal allowed | invariant (undo stays possible) | BR-STR-22 |
| E-35 | Location deactivated after posting, then reverse | 400; reactivate first | invariant | BR-STR-22 |
| E-36 | Average cost moved since posting, then reverse | Rows at the posted cost; average unchanged | invariant | BR-STR-23 |
| E-37 | Reverse twice | Second → 409 | invariant | BR-STR-24 |
| E-38 | Reverse with no reason or 501 characters | 400 | invariant | BR-STR-19 |
| E-39 | Cancel a posted transfer; post a cancelled one | 409 both | invariant | BR-STR-10 |
| E-40 | Edit a draft while another user posts it | Header lock: one wins; an edit after post → 409 | invariant | BR-STR-09, 17 |
| E-41 | Manual movement screen with `stock_transfer` / `stock_transfer_reversal` | 400 "post from its source document" | invariant | BR-STR-26 |
| E-42 | Same item on two lines | 400 "Item already on this transfer" | invariant | BR-STR-04 |
| E-43 | 0 lines or 51 lines | 400 | invariant | BR-STR-04 |
| E-44 | Qty above 1,000,000,000 | 400 | invariant | BR-STR-05 |
| E-45 | Service item on a line | 400 | invariant | BR-STR-06 |
| E-46 | Reconciliation after posting | Movement list shows the rows named "Stock transfer ST-…"; reconciliation stays at zero rows | invariant | BR-STR-25 |
| E-47 | Key removed while the page is open | Action → 403, nothing changes | invariant | BR-STR-34 |
| E-48 | Draft qty above the "available" hint | Warning only, save allowed; posting decides | invariant | BR-STR-30, 13 |
| E-49 | Draft made 31 Dec, posted 1 Jan | Keeps its ST-2026 number; posted with the 1 Jan time | invariant | BR-STR-08, 18 |
| E-50 | "Move stock" on a zero balance or job worker row | Button not shown | invariant | BR-STR-29 |
| E-51 | List filter from-date after to-date | 400 | invariant | BR-STR-27 |
| E-52 | Second store named "shop floor" when "Shop Floor" exists | 409, name unique ignoring case | invariant | BR-STR-32 |
| E-53 | User without the key opens a draft or a posted transfer | Post / Reverse / Move stock not shown | invariant | BR-STR-28, 29 |
