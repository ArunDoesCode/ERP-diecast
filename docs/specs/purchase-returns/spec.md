---
module: purchase-returns
status: frozen            # draft | frozen (set only by /freeze; change requests keep it frozen)
version: 1
frozen_on: 2026-11-20
owner: Arun
depends_on: [grn, grn-stock, inventory, purchase-order, suppliers]
brief: docs/briefs/purchase-returns.md
research: docs/research/purchase-returns.md
---

# Purchase returns

> Agent layer. The owner reads `OWNER.md`, not this file. ≤ 400 lines (above that: split by sub-module).
> Plain words, one sentence per rule. Tables and columns: `design/data.md`. Endpoints: `design/api.md`.
> Screens: `design/screens.md`. Code locations and history: `docs/modules/grn.md` (purchase return tables
> are schema-only today).
> Owner was away and delegated every decision (brief, D-028). Owner-type points are cards 1–6 in `OWNER.md`,
> option A pre-approved and applied in the rules below.

## Summary
A purchase return sends QA-rejected or accepted (incl. over-receipt excess) GRN quantity back to the
supplier. Stores prepare it from a posted GRN; on post, accepted stock leaves through `inventory_ledger`
at the GRN rate and a debit note is made in the same save. Done = the GRN line shows what went back, the
PO line shows returned qty, the item stock and average are right, and accounts can print the debit note.
Example data used below: PO-1 for ADC12 ingot (kg), 1000 kg @ 21,000 paise/kg (₹210), GST 18%;
supplier Hindalco (GSTIN state 27), plant state 27. GRN-1 line L1: arrived 1000, accepted 980,
rejected 20, heat no. H-881, posted to the main store at 21,000.

## Who can do what
New permission keys (catalog in `backend/src/lib/permissions.ts`). Super-admin passes every key.
| Action | Key | Seed roles |
|---|---|---|
| list, view, print | `purchase_return.view` | ow, bo, fs, qa |
| create, edit draft, cancel draft | `purchase_return.edit_draft` | ow, bo, fs |
| post (goods leave, debit note made) | `purchase_return.post` | ow, bo |
| cancel a posted return | `purchase_return.cancel_posted` | ow, bo |

Card 5 (A, pre-approved) decides who posts.

## Flow
| From | Action | To | Rule |
|---|---|---|---|
| — | create from one posted GRN | draft | BR-PRT-01, 02, 03 |
| draft | edit lines / header | draft | BR-PRT-10, 46 |
| draft | cancel | cancelled (final) | BR-PRT-11, 46 |
| draft | post | posted | BR-PRT-12..24 |
| posted | cancel with reason | cancelled (final) | BR-PRT-25..28 |

A posted return is never edited. `cancelled` is final. No other states.

## Rules
IDs are permanent (strike out, never renumber). Tests are named by rule id.

### Create and lines
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-PRT-01 | A return is created from exactly one GRN that has a PO, and its supplier and PO are copied from that GRN; lines from another GRN, or a GRN without a PO (subcontract receipt) → 400 `PRT_GRN_MISMATCH`, also at prefill. | Return on GRN-1 with a line of GRN-2 → 400; prefill on a PO-less GRN → 400 `PRT_GRN_MISMATCH` |
| BR-PRT-02 | Only a GRN line whose QA is decided (`passed`, `failed` or `waived`) can be returned; a `pending` line → 400. | L1 pending QA, return 5 → 400 |
| BR-PRT-03 | Each return line names its GRN line, a source (`rejected` or `accepted`) and a qty > 0; the same GRN line + source twice on one return → 400. | L1 rejected 20 and L1 accepted 30 on one return → ok; L1 rejected twice → 400 |
| BR-PRT-04 | Qty has at most 3 decimals and ≤ 1,000,000,000; whole numbers only for whole-number units (same list as the GRN). | 2.5 pcs plunger tips → 400; 12.345 kg → ok |
| BR-PRT-05 | Rejected cap: the sum of `rejected` qty on all non-cancelled returns of a GRN line can't exceed that line's rejected qty. | Rejected 20; draft A 15 exists; new draft B 10 → 400 (15 + 10 > 20) |
| BR-PRT-06 | Accepted cap: the sum of `accepted` qty on all non-cancelled returns of a GRN line can't exceed accepted − corrections on that line. | Accepted 980, corrected 30; returns of 950 so far; return 1 more → 400 |
| BR-PRT-07 | The caps are checked on create, on every draft edit, and again under lock on post; the post check is the judge. | Two creates of 15 each at the same moment on rejected 20 → GRN line lock: one 201, one 400; a draft whose line sum is over the cap when posted (whatever the cause) → 409 `PRT_CAP_EXCEEDED`, nothing posted |
| BR-PRT-08 | Every return has a reason (3–500 chars); the vendor return / RMA ref, transporter, vehicle no. and remarks are optional text. | Reason "porosity in heat H-881" → saved; empty reason → 400 |
| BR-PRT-09 | Each line carries, read-only from the GRN line: item, unit, heat/batch no., rate = PO line rate (paise, without GST) and GST % = PO line GST %. A request that sends any of these → 400 (strict body), nothing saved. | Client sends rate 1 → 400; without it → line rate 21,000 |
| BR-PRT-10 | Only a `draft` can be edited (lines, qty, reason, optional texts); any other status → 409 `PRT_NOT_EDITABLE`. A draft must keep at least one line. | Posted return, change qty → 409; remove the only line → 400 |
| BR-PRT-11 | Cancelling a draft needs no reason, moves nothing and keeps the return number. | Draft PRT-2026-11-0001 cancelled → still listed, status cancelled |
| BR-PRT-46 | Draft edit and draft cancel take the GRN header lock first (BR-PRT-13 order) and re-check `draft` under it; a return posted or cancelled meanwhile → 409 `PRT_NOT_EDITABLE`, nothing changes. | Edit and post at the same moment → post 200, edit 409 |
| BR-PRT-47 | The user who posts may be the user who created the draft; the audit keeps both names (BR-PRT-41). | Back office creates and posts PRT-…-0002 → allowed; created by and posted by both shown |

### Post: stock, PO, GRN
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-PRT-12 | Post needs `purchase_return.post` (without it → 403, nothing changes) and saves everything in one go: ledger rows, item stock and average, return status, debit note, GRN line and PO line returned qty, PO receipt status, and the PO `invoiced` test re-run (BR-SINV-29) for every posted return, credit only or replacement; if any step fails nothing is saved. | Debit note numbering forced to fail → no ledger row, return still draft; floor supervisor posts → 403 |
| BR-PRT-13 | Post takes locks in the GRN order: GRN header → PO → GRN lines + PO lines → item; a second post of the same return or a race on the same cap → one wins, the other 409. | Two posts at once → one 200, one 409, one set of ledger rows |
| BR-PRT-14 | An `accepted` line posts one ledger row: type `out`, −qty, location = the location of the GRN line's original posting (main store), cost = that posting's cost, reference `pro` with the return id and return line id, heat/batch no. copied. | Return 30 kg accepted from L1 → one row −30 @ 21,000, ref `pro` |
| BR-PRT-15 | A `rejected` line posts no ledger row, because rejected qty never entered stock (BR-GRN-13). (Card 1 A.) | Return 20 kg rejected → no ledger row, stock unchanged |
| BR-PRT-16 | An accepted return may not take the item's balance at that location below zero; otherwise 409 "Insufficient stock" and nothing is posted (BR-GRN-33). | L1 accepted 980, 960 already issued (balance 20), return 30 → 409 |
| BR-PRT-17 | An accepted return takes value out at the posted cost exactly like a GRN correction: new average = (stock × average − qty × cost) ÷ (stock − qty), rounded half up; if stock − qty = 0 or the result is negative, the average stays (BR-GRN-39). | Stock 1500 @ 21,333, return 500 posted @ 22,000 → average 21,000 |
| BR-PRT-18 | Row value = qty × cost, rounded half away from zero, same sign as qty; values above the money limit → 400 `AMOUNT_TOO_LARGE`, nothing posted. | −30 × 21,000 → −630,000 |
| BR-PRT-19 | Post adds each line's qty to the GRN line's returned qty for its source (rejected returned, accepted returned); GRN QA results, accepted qty and header status do not change. | Return 20 rejected → L1 rejected returned 20, L1 still `passed` |
| BR-PRT-20 | Post adds each line's qty to the PO line's returned qty; a `rejected` line never changes PO received qty or PO status (rejected was never counted as received). | Rejected 20 returned → PO line received 980, returned 20, PO still `partial_received` |
| BR-PRT-21 | An `accepted` return is "credit only" by default: PO received qty and receipt status stay as they are; only the `invoiced` test is re-run (BR-PRT-12). (Card 3 A.) | Return 30 accepted, credit only → PO line received 980, returned 30. PO 1000/1000 received, bills approved for 980, return 20 accepted credit only → PO `invoiced` |
| BR-PRT-22 | If the user ticks "replacement expected", accepted lines also lower the PO line received qty and the PO receipt status is recomputed (BR-PO-10), so the supplier can send the replacement on a new GRN; ticking it on a PO that is `invoiced` or `closed` → 409, nothing posted. | PO 1000/1000 fully received, return 30 with replacement → received 970, `partial_received`; PO closed → 409 |
| BR-PRT-23 | The return number `PRT-<YYYY-MM>-<seq>` is allocated at create (period = plant IST day) and never reused; post stamps posted by and posted at (server time, client value ignored). | Created 2026-11-30 23:50 IST → PRT-2026-11-…; posted next day → posted at 2026-12-01 |
| BR-PRT-24 | A return can be posted whatever the PO status (incl. `invoiced`, `closed`), because goods may go back after the supplier's bill is recorded; only "replacement expected" needs an open PO (BR-PRT-22); the `invoiced` test is re-run after it (BR-PRT-12). (Card 4 A.) | PO invoiced, return 20 rejected credit only → 200, debit note made, PO stays `invoiced` |

### Cancel a posted return
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-PRT-25 | A posted return can be cancelled only with a reason (3–500 chars) and the `purchase_return.cancel_posted` key (without it → 403, nothing changes); it is never edited or deleted. | Cancel without reason → 400; stores user cancels → 403; with "truck turned back at gate" → cancelled |
| BR-PRT-26 | Cancelling posts, for each accepted line, one counter row: type `in`, +qty, same location and cost as the return row, reference `pro_cancel`; the average is recomputed as a stock-in (BR-GRN-38). | Return −30 @ 21,000 cancelled → +30 @ 21,000; ledger net 0 paise |
| BR-PRT-27 | Cancelling takes the qty back off the GRN line and PO line returned qty, and if replacement was expected adds it back to PO received qty and recomputes PO status; then the `invoiced` test is re-run (BR-SINV-29) for every cancelled return. If replacement was expected and the PO is now `invoiced` or `closed`, or received would go above ordered × 1.05 (BR-GRN-15 tolerance, no override) → 409, nothing changes. | Replacement return of 30 cancelled, PO partial → received 1000, `fully_received`. Ordered 1000, return 30 with replacement, replacement GRN of 60 (received 1030) → cancel would make 1060 > 1050 → 409 `PRT_OVER_RECEIPT`. Credit-only return cancelled on an `invoiced` PO whose bills now fall short → `fully_received` |
| BR-PRT-28 | Cancelling marks the debit note cancelled (number kept, print shows "CANCELLED"); a cancelled return frees its qty under the caps (BR-PRT-05, 06). | Cancel PRT-…-0001 → DN shows CANCELLED; 20 rejected returnable again |

### Debit note
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-PRT-29 | Every post creates exactly one debit note for the whole return; the debit note never moves stock. | Post return with 2 lines → 1 debit note, ledger rows only from the return |
| BR-PRT-30 | The debit note number comes from its own series per Indian financial year (April–March, plant IST day), allocated in the same save, never reused. | Posted 2027-03-31 → FY 2026-27 series; 2027-04-01 → FY 2027-28 starts at 1 |
| BR-PRT-31 | Line taxable value = round(qty × rate) and line GST = round(taxable value × GST % / 100), half away from zero, in paise; debit note taxable, GST and total are the sums. | 20 kg × 21,000 → 420,000; GST 18% → 75,600; total 495,600 |
| BR-PRT-32 | If the supplier GSTIN state (first two digits) equals the plant state, each line's GST splits into CGST = round(GST / 2) and SGST = GST − CGST; otherwise all of it is IGST; the split is per line and the debit note CGST, SGST, IGST are the sums of the lines; a supplier without GSTIN is treated as same-state. | State 27 vs 27, line GST 75,601 → CGST 37,801 + SGST 37,800; supplier state 29 → IGST 75,601 |
| BR-PRT-33 | The debit note shows: plant name, address, GSTIN; supplier name, address, GSTIN; debit note no. and date; return no.; GRN no. and supplier challan no.; PO no.; the linked supplier bill no. and date (BR-PRT-44), or none; per line item, HSN, heat no., qty, unit, rate, taxable value, GST %, CGST/SGST or IGST; totals; reason. | Debit note for PRT-…-0001 lists GRN-1, challan "CH-77", bill "B-9 · 12 Nov", HSN 7601 |
| BR-PRT-34 | Post is refused with 400 if plant GSTIN/state is missing or any line's item has no HSN code (D-017), so no incomplete debit note is ever made. | Item without HSN → 400 `PRT_HSN_MISSING`, nothing posted |
| BR-PRT-35 | A posted return prints a return challan for the truck: plant, supplier, challan no., return no., date, vehicle, per line item, HSN, heat no., qty, unit and value (taxable + GST); the challan no. `PRC/<yy>-<yy+1>/<seq>` comes from its own consecutive series per Indian financial year (GST Rule 55), allocated in the post save, never reused, kept on cancel. (Card 6 A.) | Posted 2027-03-31 → PRC/26-27/…; 2027-04-01 → PRC/27-28/0001; challan shows 20 kg ADC12, H-881, ₹4,956 |

### Screens: next step and visibility
Screens follow design-system v2 (`frontend/.claude/skills/design-system/SKILL.md`).
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-PRT-36 | For a user with `purchase_return.edit_draft`, GRN details show "Return to supplier" as the main next step when any line has rejected qty not yet on a non-cancelled return, prefilling a new draft with that qty per line; when only accepted qty is returnable it is a secondary action that opens an empty draft. | L1 rejected 20, nothing returned → main button, draft prefilled 20 rejected; all 20 on returns → secondary action only |
| BR-PRT-37 | A draft return offers "Post" (with `purchase_return.post`) and "Cancel"; a posted return offers "Print debit note", "Print return challan" and, with `purchase_return.cancel_posted`, "Cancel return". Buttons the user lacks the key for are hidden. | Floor supervisor on a draft → no Post button |
| BR-PRT-38 | GRN details show per line rejected returned and accepted returned qty, and the GRN's returns (number, status) in its document flow; PO details show returned qty per line and the PO's returns. | GRN-1 L1 → "Rejected 20 · returned 20"; PO-1 flow lists PRT-…-0001 |
| BR-PRT-39 | The returns list filters by status, supplier and date and has an "Awaiting return" view: GRN lines with rejected qty not yet on a non-cancelled return. | L1 rejected 20, draft of 15 → awaiting 5; after post of 15 → still awaiting 5 |
| BR-PRT-40 | Before posting, the screen shows what will happen: stock out per accepted line, debit note total, and PO effect (credit only or replacement); the server stays the judge. | Return 30 accepted → "Stock −30 kg ADC12; debit note ₹7,434; PO unchanged" |
| BR-PRT-41 | Every create, edit, post and cancel stores who and when; post and cancel also store the before → after status, and cancel stores its reason; all are readable on the return details. | After cancel → cancelled by, at, reason visible |

### Effects on other modules (rules to add there)
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-PRT-42 | A GRN correction on a line can't take accepted − corrections below that line's accepted returned qty (non-cancelled returns); otherwise 400. Change to the GRN correction rules. | Accepted 980, returned 950, correct 40 → 400 |
| BR-PRT-43 | For the supplier bill match, the billable qty of a GRN line is accepted − corrections − accepted returned on posted returns, credit only or replacement alike (a replacement is billed on its own new GRN); rejected returns don't change it. Goes to the supplier-invoice spec (BR-SINV-02, 31). | Accepted 980, 30 returned → bill may match 950; replacement GRN-7 of 30 → billable 30 there |
| BR-PRT-44 | A debit note lowers a payable only through its one link `supplier_invoice_id`: at post it links the oldest `approved` bill whose line covers a returned GRN line; with none, it stays empty and the supplier-invoice side links it when a covering bill is approved whose billed qty includes the returned qty (BR-SINV-31); a bill already net of the return is never linked. One note → one bill; the print shows only the linked bill. | GRN-1 L1 on approved B-7 and B-9 → DN linked to B-7, prints "B-7"; return 30 before any bill: B-9 for 980 approved → linked; B-9 for 950 → not linked |
| BR-PRT-45 | `bill_offset_paise` is that bill's reduction = the value (taxable + GST) of the note's `accepted` lines, whether linked at post or later (rejected qty is never on an approved bill, BR-SINV-02); an unlinked note takes off nothing; a cancelled note takes off nothing. | B-9 for 980 kg; return 30 accepted → payable −₹7,434, at post or when B-9 is approved later; 20 rejected → DN ₹4,956, payable −₹0; B-9 for 950 → no link, no offset |

## Security
| Data | Who may see it | Who may change it |
|---|---|---|
| Return, debit note values, rates | `purchase_return.view` | nobody after post; draft by `purchase_return.edit_draft` |
| Ledger rows from returns | `inventory.view` | only post / cancel (BR-PRT-14, 26) |

Abuse cases — each one ends in a rule above:
| Who | Tries to | Stopped by |
|---|---|---|
| stores | return more than was rejected, in two drafts | BR-PRT-05, 07 |
| stores | send good stock back and post it alone | BR-PRT-37 + `purchase_return.post` key |
| anyone | lower the debit note rate by sending a rate | BR-PRT-09 |
| anyone | return stock already consumed | BR-PRT-16 |
| anyone | post the same return twice in parallel | BR-PRT-13 |
| anyone | edit a posted return or delete a debit note | BR-PRT-10, 25, 28 |
| back office | correct a GRN line after its stock went back | BR-PRT-42 |
| stores | edit a draft while it is being posted | BR-PRT-46 |
| anyone | cancel a replacement return to push the PO past the over-receipt limit | BR-PRT-27 |

Audit: create, edit, post, cancel (BR-PRT-41); ledger rows carry return id and line id (BR-PRT-14, 26).

## Edge cases
Full list: `design/edge-cases.md`. Every row there names a rule in this file.
| Source | Count |
|---|---|
| benchmark | 18 |
| owner | 2 (cards 1, 3; delegated, A pre-approved) |
| invariant | 11 |
| designer | 15 |

## Owner cards and confirm lines
Cards 1–6 and the "Decided for you" lines live in `OWNER.md`; every `confirm` row is in `assumptions.md`
(A-01..A-12, A-41, A-43, A-48, A-49). Card → rules: 1 → BR-PRT-15 · 2 → BR-PRT-03, 06, 14 · 3 → BR-PRT-21, 22 · 4 → BR-PRT-24, 33 ·
5 → Who can do what · 6 → BR-PRT-35.

## Changes to other modules
Not edited here; the coordinator carries each one to its owner spec before freeze.
| Module (spec) | Change | Rule |
|---|---|---|
| grn | Correction floor: a correction can't take accepted − corrections below the line's accepted qty on non-cancelled returns → 400 `GRN_CORRECTION_BELOW_RETURNED`. | BR-PRT-42 |
| grn | `grn_items.rejected_returned_qty`, `accepted_returned_qty` (posted returns); GRN details show them and the GRN's returns in the document flow. | BR-PRT-19, 38 |
| purchase-order | `purchase_order_items.returned_qty`; replacement return lowers received qty and recomputes status (BR-PO-10); PO details show returned qty and returns. | BR-PRT-20, 22, 27, 38 |
| inventory | New ledger reference type `pro_cancel` (counter row of a cancelled return). | BR-PRT-26 |
| supplier-invoice | Billable qty = net accepted − accepted returned on posted returns (credit only and replacement alike). Matches BR-SINV-02/31. | BR-PRT-43 |
| supplier-invoice | On bill approval, link each unlinked posted debit note whose returned GRN line the bill covers only if its billed qty includes the returned qty, with `bill_offset_paise` = accepted-lines value (a bill net of the return is never linked); net payable = total − sum of `bill_offset_paise` of its issued (not cancelled) debit notes. | BR-PRT-44, 45 |
| supplier-invoice | The PO `invoiced` test (BR-SINV-29) is re-run on post and on cancel of every posted return, credit only or replacement. | BR-PRT-12, 21, 24, 27 |
| grn | Cancel of a replacement return re-uses the over-receipt limit ordered × 1.05 (BR-GRN-15), without override. | BR-PRT-27 |
| supplier-invoice (provided) | Repository function `returnedQtyByGrnItem(grnItemIds, tx)` → per GRN item `{ acceptedReturned, rejectedReturned }` from posted, non-cancelled returns; runs inside the caller's transaction so the bill match reads it under the GRN line lock. | BR-PRT-43 |

Designer follow-ups (data.md / api.md, through the coordinator):
- api.md: 409 `PRT_OVER_RECEIPT` on `POST /:id/cancel` (BR-PRT-27); 400 `PRT_GRN_MISMATCH` on prefill (BR-PRT-01);
  409 `PRT_NOT_EDITABLE` on update / cancel-draft under the header lock (BR-PRT-46); extra key → 400 (BR-PRT-09).

## Not now
- Debit note without sending goods back (small or melted lots kept/scrapped and supplier debited) — SME Q1.
- A "Rejected" stock location and moving rejected qty into stock (unless card C1 → B).
- Returns of subcontract (job work) GRN rejects — the job-work challan governs.
- One return across several GRNs; return of a return.
- E-way bill, GST credit-note matching, ITC reversal, accounting ledger, supplier payments / set-off.
- Approval workflow on returns; mandatory RMA number; e-mail of the debit note.
- Replacement as a special document (it is a normal new GRN on the reopened PO).
- Supplier rating effects of returns (supplier-rating spec may read posted returns).

## Open questions
Must be empty at freeze. Each one ends as an owner card in `OWNER.md` or a row in `assumptions.md`.
| # | Question | Goes to |
|---|---|---|
| — | none: pass-1 questions 1–4 answered in `design/`, 5 in "Changes to other modules", 6 in `assumptions.md` (A-09, A-41) | — |

## Changelog
- 2026-11-20 v0 — draft (pass 1; owner delegated, pending cards C1–C6 with recommended options applied)
- 2026-11-20 v0 — pass 2: GST split per line (BR-PRT-32); return challan own FY series (BR-PRT-35); debit
  note linked to the covering approved bill (BR-PRT-33, 44, 45); billable qty excludes all accepted returns
  (BR-PRT-43); GRN without PO → 400 (BR-PRT-01); "Changes to other modules"; edge cases, assumptions, OWNER.md.
- 2026-11-20 v0 — pre-freeze fixes: one bill link per note, late link only for a bill that includes the returned qty, same offset (BR-PRT-44, 45); `invoiced`
  test re-run on post/cancel (BR-PRT-12, 21, 24, 27); over-receipt 409 on replacement cancel (BR-PRT-27);
  header lock on edit/cancel-draft (BR-PRT-46); poster may be creator (BR-PRT-47); strict body (BR-PRT-09).
- 2026-11-20 v1 — frozen; OWNER.md approved on the owner's delegation (D-028): owner pre-approved recommended options in chat, 2026-11-20: "take ur own decision and record them and run whatever parallel subagents u want to complete a complete scm module according to my plan, ill do a complete merge in moring once completed"
