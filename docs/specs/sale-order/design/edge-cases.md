# Sale order — edge cases

> Written by spec-analyst from `docs/research/sale-order.md` → "Edge cases seen in the products", the
> owner cards (pre-approved A, chat 2026-11-20), the coordinator's answers to the designers and the
> designers' files. Every row names a rule. Tests are named by rule id. The owner sees only the count.

Source: **benchmark** (what ERPNext / Odoo / SAP do) · **owner** (an answered card) ·
**invariant** (money in paise, stock only through the ledger, permission + audit on state changes).

| # | Case | What the system does | Source | Rule |
|---|---|---|---|---|
| E-01 | SO line item (top level) has no active BOM | Row flagged "No active BOM — fix BOM and re-run", not treated as bought, no draft; rest of the SO explodes | benchmark (ERPNext skips quietly, SAP lists planned only; showing it is stricter) | BR-SO-26 |
| E-02 | Component below the top level has no BOM | Treated as bought, tagged "no BOM" (only below the top level) | benchmark (ERPNext, SAP) | BR-SO-22, 26 |
| E-03 | Parent BOM's component line marked "buy as is" for an item that has a BOM | Not walked; bought (the flag comes only from the BOM component line; SO lines have none) | benchmark (ERPNext, Odoo buy route) | BR-SO-22 |
| E-04 | BOM loop or > 10 levels met during the walk | That line stops, "BOM loop", no rows below | benchmark | BR-SO-28 |
| E-05 | Component item inactive | Row flagged, not raisable | benchmark | BR-SO-27 |
| E-06 | Same item needed by two lines or two levels | One row at the deepest level, gross summed, netted once, sources kept | benchmark (ERPNext consolidate, SAP low-level code) | BR-SO-25 |
| E-07 | Supply due after the delivery date | Not counted; shown as late supply | owner (card 3) | BR-SO-32 |
| E-08 | Supply with no due date | Counted | benchmark (SAP sources) | BR-SO-32 |
| E-09 | Delivery date already passed when drafts are made | PR required-by left empty, row "Past due"; SCO return date must be typed | benchmark (SAP "Past Due") | BR-SO-41, 43 |
| E-10 | Open PR counted as supply | Yes, draft PRs included | benchmark (SAP purchase requests, ERPNext requested qty) | BR-SO-31 |
| E-11 | PR line partly put on a PO | Open PR = requested − issued; the PO part shows under open PO | benchmark (ERPNext MR "Partially Ordered") | BR-SO-31 |
| E-12 | Draft PO exists for the item | Counts as open PO supply | benchmark (SAP, ERPNext ordered qty) | BR-SO-31 |
| E-13 | Stock in scrap yard, virtual or vendor-premises location | Not free stock | invariant (stock read from ledger balances) | BR-SO-30 |
| E-14 | Castings already on the shelf | Netted before alloy is worked out | owner (card 2) | BR-SO-29 |
| E-15 | Two orders need the same short stock | Order exploded first keeps it; later one sees the gap | owner (card 4) | BR-SO-34 |
| E-16 | Supply already claimed by another order | Not counted for this order | benchmark (MRPeasy booking) | BR-SO-33 |
| E-17 | Re-run after drafts were raised | Own drafts count as supply → net 0 | benchmark (SAP re-run) | BR-SO-33, 53 |
| E-18 | Re-run | Old snapshot superseded, its claims released, raised drafts stay | benchmark (SAP scenario re-run) | BR-SO-35, 36 |
| E-19 | Two runs of the same SO at once | Second → 409; runs serialised across SOs | invariant | BR-SO-37 |
| E-20 | Line qty or date changed after the run | Snapshot out of date; drafts refused "re-run first" | benchmark (SAP, ERPNext recompute from qty and date) | BR-SO-38 |
| E-21 | Only notes, price, GST % or ship-to changed after the run | Snapshot stays current | benchmark (need depends on qty, item, date only) | BR-SO-38 |
| E-22 | BOM revision released or retired after the run | Snapshot out of date | benchmark | BR-SO-38 |
| E-23 | Create drafts from a superseded snapshot | 409 | benchmark (SAP) | BR-SO-36 |
| E-24 | Pick less than net | Allowed, "still short by N" | benchmark (SAP edits recommendations) | BR-SO-39 |
| E-25 | Row with net 0 or cast / assemble row | Not selectable; cast shows "cast 821, pour 865" | benchmark (SAP make vs buy) | BR-SO-39, 44 |
| E-26 | Several bought rows picked | One draft PR per create click | owner (card 6) | BR-SO-40 |
| E-27 | Job-work rows for two job workers | One draft SCO per job worker | benchmark (SAP groups by vendor) | BR-SO-42 |
| E-28 | Job worker changed to one without the service | 400 for that row, nothing made | benchmark (Odoo subcontract BOM vendor) | BR-SO-43 |
| E-29 | User lacks `sco.manage` but picks a job-work row | 403, nothing created | invariant | BR-SO-45 |
| E-30 | Double click "Create drafts" | Second call 409, one PR only | invariant | BR-SO-46 |
| E-31 | Auto-made PR | Draft, never submitted, note "review before buying" | benchmark (ERPNext reorder MR) | BR-SO-40, 47 |
| E-32 | Draft PR cancelled later | SO untouched; re-run shows the shortage again | benchmark (ERPNext) | BR-SO-47 |
| E-33 | PR created by hand with a made-up or cancelled SO id | 400 | invariant | BR-SO-48 |
| E-34 | Old PR rows with an unknown SO id | Migration clears the id, keeps "(old SO ref N)" in notes | benchmark (ERPNext links only to real documents) | BR-SO-48 |
| E-35 | PR typed by hand naming this SO | Information only: locks nothing, counted as ordinary open supply; only explosion-linked lines count as raised from the SO | benchmark (ERPNext MR keeps SO link; lock only by document link) | BR-SO-53 |
| E-36 | SCO made from a snapshot that is now superseded | Still counts as raised from the SO | benchmark | BR-SO-53 |
| E-37 | Edit after confirm | Qty up, price, GST, date, notes, ship-to, new lines; customer and item locked | owner (card 1) | BR-SO-13 |
| E-38 | Qty cut (any line, SO-wide) while live drafts exist | 409 naming them | owner (card 1) | BR-SO-14 |
| E-39 | Qty cut below delivered | 409 | benchmark (ERPNext blocks below delivered) | BR-SO-14 |
| E-40 | Same part, several delivery dates | Several lines, one date each; same date twice → 400 | owner (card 5) | BR-SO-08 |
| E-41 | Same customer PO number twice | 409 naming the other SO (cancelled excluded) | benchmark (ERPNext default) | BR-SO-06 |
| E-42 | Order date in the future / delivery date in the past | 400 | benchmark | BR-SO-06, 07 |
| E-43 | 10.5 pcs or 185.5 paise | 400 | invariant | BR-SO-07 |
| E-44 | Price 0 (sample) | Allowed | benchmark (ERPNext, Odoo allow 0 rate) | BR-SO-07 |
| E-45 | Customer GSTIN state code ≠ state | 400 | invariant (GST format) | BR-SO-01 |
| E-46 | Inactive customer with open SOs | New SO refused; open ones carry on | benchmark (ERPNext disabled customer) | BR-SO-02 |
| E-47 | Item deactivated between save and confirm | Confirm 400 naming it | benchmark | BR-SO-12 |
| E-48 | SO on hold | No edit, explode, drafts or dispatch; claims kept | benchmark (ERPNext On Hold) | BR-SO-16 |
| E-49 | Cancel with live drafts | 409 listing them; nothing auto-cancelled | benchmark (ERPNext linked docs) | BR-SO-19 |
| E-50 | Cancel after a delivery | 409 "close instead" | benchmark (SAP B1: close, not cancel, once copied) | BR-SO-18 |
| E-51 | Close by hand with approved PRs | SO closed and final; PRs untouched | benchmark (ERPNext Closed) | BR-SO-17 |
| E-52 | Last delivery note posted | SO closed "fully delivered", claims released; partial delivery stays confirmed | benchmark (ERPNext Completed, SAP closes copied order) | BR-SO-54 |
| E-53 | Delivery note cancelled on a fully delivered SO | Back to confirmed, snapshot out of date | benchmark (ERPNext, SAP cancellation reopens base) | BR-SO-55, 38 |
| E-54 | Delivery note cancel on an SO closed by hand | Refused; hand close is final | benchmark (SAP B1 closed is final; ERPNext allows re-open — stricter wins, A-09) | BR-SO-55 |
| E-55 | Delivery posted while a snapshot claims that stock | Claim lowered by the shipped qty; snapshot out of date | benchmark (ERPNext reservation consumed on delivery) | BR-SO-58, 38 |
| E-56 | Ship-to address without a state / GST % 17 | 400 | invariant (GST) | BR-SO-56, 57 |
| E-57 | Floor supervisor opens an SO or the explosion | 403 (no prices on the floor) | invariant (permission) | BR-SO-04 |
| E-58 | Explosion response | No price fields | invariant (security) | BR-SO-51 |
| E-59 | Edit and confirm race | One 409, nothing half-saved | invariant | BR-SO-52 |
| E-60 | Reservation | Soft claim row, never a ledger posting | invariant | BR-SO-35 |
| E-61 | SO edit sends a line id (or removeLineId) of another SO | 404, nothing saved | invariant | BR-SO-59 |
| E-62 | Create drafts with a snapshot or rowId of another SO / snapshot | 404, nothing created | invariant | BR-SO-62 |
| E-63 | Hand-typed PR saleOrderId, then the SO qty is cut | Cut allowed; the PR is not "raised from" the SO | benchmark (ERPNext locks by document link only) | BR-SO-53, 14 |
| E-64 | PR saleOrderId set to a draft or cancelled SO | 400 | benchmark (ERPNext links only to submitted SO) | BR-SO-48 |
| E-65 | Picked qty more than the row's net | 400 (capped at net) | benchmark (stricter than SAP's editable recommendation) | BR-SO-39 |
| E-66 | Dispatch posts, closes or reopens the SO | Audit row in the same transaction with posting user and note id | invariant | BR-SO-52 |
| E-67 | Reason of spaces only, or "  ab " | Trimmed, then 400 under 3 chars | invariant | BR-SO-61 |
| E-68 | Date in 1999 or more than 5 years ahead | 400 | invariant | BR-SO-61 |
| E-69 | Delete a confirmed line with delivered qty > 0 | 409 `SO_LINE_DELIVERED` | benchmark (ERPNext blocks removing a delivered item) | BR-SO-14, 60 |
| E-70 | Line deleted, then a new line added | Old line kept as removed; its number is not reused | invariant | BR-SO-60 |
| E-71 | Line already overdue, user edits only its price | Allowed; date check runs only when the date changes | benchmark (ERPNext validates changed fields on Update Items) | BR-SO-07 |
| E-72 | Edit an on-hold, closed or cancelled SO | 409 | benchmark (ERPNext On Hold / Closed block edits) | BR-SO-16, 20 |
| E-73 | Last note ships L1 in full while L2 was removed earlier | SO closes "fully delivered" (removed lines ignored) | benchmark (ERPNext Completed ignores closed rows; SAP closed rows) | BR-SO-54 |
