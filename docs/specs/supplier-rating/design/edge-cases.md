# Supplier rating — edge cases

> Written by spec-analyst from `docs/research/supplier-rating.md` → "Edge cases seen in the products", the
> owner cards (pre-approved, 2026-11-20), the coordinator's answers to the designers and the designers' files.
> Every row names a rule; tests are named by rule id. The owner sees only the count.

Source: **benchmark** (what ERPNext / Odoo / SAP / Infor do) · **owner** (a card, pre-approved option A) ·
**invariant** (money in paise, IST day, permission on every read).

| # | Case | What the system does | Source | Rule |
|---|---|---|---|---|
| E-01 | 1,200 kg arrive on time against a 1,000 kg line | Counts as one on-time line; on-time % never goes above 100 % | benchmark (Odoo 200 % bug; Infor counts lines) | BR-SRT-03 |
| E-02 | Line delivered in two GRNs (600 kg on 5 Nov, 400 kg on 12 Nov), due 10 Nov | Complete on 12 Nov → late by 2 days | benchmark (Infor IFS: latest receipt decides) | BR-SRT-07 |
| E-03 | Rejected qty on a line | Still counts toward "complete" for on-time; the reject is counted once, in rejection % | benchmark (ERPNext, SAP judge receipt date) | BR-SRT-07 |
| E-04 | Supplier with POs but no GRN in the window | Rejection shows "No data", never 0 % or 100 % | benchmark (ERPNext: empty period must be chosen) | BR-SRT-23 |
| E-05 | Supplier with only 3 judged lines | "Not enough data (3 of 5 lines)"; the three measures still show | owner (card 6) | BR-SRT-22 |
| E-06 | Supplier with exactly 5 judged and 5 decided lines | Score and label shown | owner (card 6) | BR-SRT-22 |
| E-07 | Trend month with only 2 lines | Month shows its score with "(2 lines)"; the 5-line minimum is for the headline only | benchmark (ERPNext shows every period) | BR-SRT-28 |
| E-08 | GRN corrected or reversed after posting | Next read recomputes from live data; nothing stored to undo | benchmark (SAP undoes, ERPNext/Infor recompute) | BR-SRT-01 |
| E-09 | Fixed values (weights, grace, bands) change in a later version | Whole 12 months recomputed with the new values | benchmark (Infor CSI uses today's values) | BR-SRT-01 |
| E-10 | PO re-dated from 10 Nov to 20 Nov, arrives 15 Nov | Late by 5 days; revised date shown beside, not used | owner (card 1; SAP statistics date) | BR-SRT-05 |
| E-11 | Line complete on 11 Nov, due 10 Nov | Late by 1 day (no grace) | owner (card 2) | BR-SRT-06 |
| E-12 | Line complete on 1 Nov, due 10 Nov | On time; early delivery is not penalised | benchmark (ERPNext, SAP scorecards) | BR-SRT-06 |
| E-13 | Line due 10 Nov, nothing arrived, today 20 Nov | Late line now, "Open, late — 10 days" | owner (card 3) | BR-SRT-08 |
| E-14 | Line due today, nothing arrived yet | Not judged yet | benchmark (SAP judges after due date) | BR-SRT-08, BR-SRT-10 |
| E-15 | Short-closed line: 700 of 1,000 kg on 8 Nov, due 10 Nov, short-closed 15 Nov | Late by 5 days (judged by short-close date); counted in "short-closed after due date"; closed 9 Nov instead → on time | benchmark (SAP service level judges the close date; stricter) | BR-SRT-09 |
| E-16 | Buyer short-closes a late line with nothing delivered, after the due date | Late | benchmark (SAP) | BR-SRT-09 |
| E-17 | PO with no expected delivery date (legacy data only: new POs need one) | Left out of on-time; drill-down lists it as "no due date" with a count | benchmark (ERPNext/SAP need a schedule date to judge) | BR-SRT-32 |
| E-18 | PO raised 14 months ago, completed inside the window | In the window by its completion date | benchmark (Infor IFS rolling 12 months on receipts) | BR-SRT-10 |
| E-19 | Cancelled or draft PO with a past due date | Not counted anywhere | benchmark (ERPNext reads submitted documents only) | BR-SRT-04, BR-SRT-16 |
| E-20 | GRN line with QA still pending | Left out of rejection until decided | benchmark (ERPNext: quality from inspected receipts) | BR-SRT-12 |
| E-21 | GRN line with QA waived, 5 kg rejected | Treated like a bypass: not decided, out of rejection % and the 5-line minimum; shown in "not inspected" with its 5 kg | benchmark (ERPNext/SAP: quality only from an actual inspection result) | BR-SRT-13 |
| E-22 | GRN line where QA was bypassed | Left out of rejection %, shown as "3 not inspected" | benchmark (ERPNext: no inspection, no quality data) | BR-SRT-13 |
| E-23 | 20 kg ingot rejected on one line, 5 pcs castings on another | Rejection % by value (qty × PO rate); kg and pieces never added | invariant (money in paise; die-casting mixed UOM) | BR-SRT-11 |
| E-24 | PO line at rate ₹0 (free sample) with rejects (legacy data only: new PO lines need a rate > 0) | Adds 0 to both sides of rejection %; still counted in "lines with rejects" | invariant (value basis) | BR-SRT-11, BR-SRT-15 |
| E-25 | 980 accepted, later corrected −10 | Rejection % unchanged | benchmark (SAP: later movements are not a QA result) | BR-SRT-14 |
| E-26 | Draft GRN, or GRN not linked to a PO | Not part of any measure | benchmark (ERPNext reads submitted receipts against a PO) | BR-SRT-33 |
| E-27 | Item has no standard rate | Compared with this supplier's previous sent PO rate; none → "not compared, no reference" | benchmark (SAP: last price / info record) | BR-SRT-17 |
| E-28 | Standard rate per kg, PO line in nos | "Not compared, UOM differs" | benchmark (SAP compares per order unit) | BR-SRT-18 |
| E-29 | Paid ₹195 against ₹200 reference | Variance −2.5 %, plain text, no colour | benchmark (SAP price level both ways) | BR-SRT-19 |
| E-30 | Paid +5 % above standard | Score unchanged; variance shown beside it | owner (card 4) | BR-SRT-20 |
| E-31 | On-time 79.0 %, rejection 0.0 % → 89.5 | Rounded half up from the shown 1-decimal values → 90 | invariant (one rounding rule, reproducible from the screen) | BR-SRT-21 |
| E-32 | Score 80 / 79 / 60 / 59 | Good / Watch / Watch / Poor | owner (card 7) | BR-SRT-24 |
| E-33 | Poor supplier on a new PR, PO or GRN | Nothing blocks or warns | benchmark (SAP and Infor: report only) | BR-SRT-25 |
| E-34 | Inactive supplier with history | Hidden by default, shown under "All" | benchmark (ERPNext lists disabled suppliers on filter) | BR-SRT-26 |
| E-35 | Job-work vendor with subcontracting orders only | All measures "No data" | benchmark (die-casting: SCO is a separate flow) | BR-SRT-30 |
| E-36 | Floor supervisor (has supplier view only) opens supplier page or calls the API | Page opens without the rating card; API 403 naming `supplier.rating.view` | invariant (permission on every read) | BR-SRT-29 |
| E-37 | Rating asked for supplier id 999 that does not exist | 404; an inactive supplier is still found | invariant | BR-SRT-34 |
| E-38 | Back office without GRN view opens the rejection drill-down | GRN number shown as plain text, not a link | invariant (permission on every read) | BR-SRT-35 |
| E-39 | GRN posted 21 Nov 00:30 IST (20 Nov UTC) | Arrival day is 21 Nov | invariant (IST day, D-022) | BR-SRT-02 |
| E-40 | Someone tries to type or edit a score | No write path exists | invariant | BR-SRT-01 |
| E-41 | GRN received 9 Nov (full qty), QA decided 12 Nov, due 10 Nov | On time: completion uses the GRN received date whatever the QA state; rejection % counts the line only from 12 Nov | benchmark (ERPNext, SAP: receipt date decides delivery) | BR-SRT-07, BR-SRT-12 |
| E-42 | 5 judged on-time lines but only 3 QA-decided GRN lines | No score, "Not enough data (3 of 5 lines)"; measures still show | owner (card 6) | BR-SRT-22 |
| E-43 | Window or month with on-time lines but no decided GRN line | On-time shown; score and label "No data" | invariant (no score from one measure) | BR-SRT-36 |
| E-44 | Line due 28 Oct, complete 3 Nov; GRN 31 Oct decided 2 Nov; PO created 30 Sep | On-time in Nov, rejection in Oct, price in Sep | benchmark (ERPNext period by document date) | BR-SRT-37, BR-SRT-38, BR-SRT-39 |
| E-45 | Purchase clicks on-time 80 % | Drill-down lists the 10 judged lines, 2 marked late with days late, revised date beside the due date | benchmark (SAP drills from criterion to documents) | BR-SRT-27 |
| E-46 | Role with the rating key but without supplier view | Sees supplier names in the rating list; supplier page itself refused | invariant (permission per key) | BR-SRT-40 |
| E-47 | pageSize 500, supplier id 3,000,000,000, search "50%" | 400, 400, and "50%" matched literally | invariant (input bounds) | BR-SRT-41 |
| E-48 | Owner removes the rating key from back office, server restarts | Grant comes back (seed re-inserts, same as every seeded key); accepted for v1 | invariant (current seed behaviour) | BR-SRT-29 |
