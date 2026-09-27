---
module: grn
status: draft            # draft | frozen | changed-after-freeze
version: 0
frozen_on:
owner: Arun
depends_on: [purchase-order, inventory, suppliers]
---

# GRN (Goods Received Note) — functional spec

> Written after the code (it describes existing behaviour). As-built map: `docs/modules/grn.md`, `docs/modules/inventory.md`.
> Settles BL-014, BL-015 and BL-016. A rule tagged **(pending Q-n)** assumes the recommended answer to open question n.
> Rules tagged **[gap]** describe behaviour the current code does **not** have yet.

## 1. Purpose
Record material arriving at the plant gate against a dispatched PO (aluminium ingots bought by kg, release
agent by litre, spares and consumables by piece). QA checks each line and either accepts it (stock goes up in
the main store at the PO rate) or rejects it. A fast-track bypass lets urgent material go straight to stock,
with a reason. If a count or posting mistake is found after posting, a correction reverses the wrong quantity.
Done on the floor means: store stock, item average cost and PO receipt status all match the physical
receipt, and every posting can be traced back to a GRN line, a person and a reason.

Benchmark (adapted, not copied):
- ERPNext Purchase Receipt: per line `received = accepted + rejected`, rejected qty goes to a "Rejected
  Warehouse". Over-delivery allowance % is set globally or per item. Quality Inspection can be made mandatory
  per item. Submitted receipts are never edited; mistakes are fixed with a reverse entry or a Purchase Return.
- ERPNext and SAP B1 update stock qty and valuation in the same DB transaction as the ledger row (ERPNext
  `Bin` + SLE). The default valuation is **moving average**. SAP B1 lets you keep valuation company-wide or per
  warehouse.
- Odoo: a partial receipt creates a backorder. Valuation is AVCO or FIFO per product category. A return is
  a reverse picking valued at the original move's cost.
- SAP B1: manual stock changes need their own documents (Goods Receipt / Goods Issue / Inventory Posting)
  with a reason. You cannot post a "GRPO" line by hand without the GRPO document.
- India: stock is valued **excluding recoverable GST** (ITC). The supplier challan/invoice number and the
  vehicle number (the e-way bill for consignments over ₹50k) are what the gate records and what the later
  3-way match uses. Sec 143 job work is not in scope here (M2 subcontracting).

## 2. Actors & permissions
| Role | View | Create / edit / delete draft | QA accept / reject | Bypass QA | Over-receipt override | Correction | Manual stock movement |
|---|---|---|---|---|---|---|---|
| super-admin | yes | yes | yes | yes (pending Q-5) | yes (pending Q-4) | yes | yes |
| owner | yes | yes | yes | yes | yes | yes | yes (pending Q-10) |
| back_office | yes | yes | yes | yes | yes | yes | yes |
| floor_supervisor | yes | yes | no | **no** (pending Q-5; code allows today) | no | no | no |
| qa_inspector | yes | no | yes | no | no | no | no |
| die_designer | yes | no | no | no | no | no | no |
| operator | no | no | no | no | no | no | no |

## 3. Documents & key fields
| Record | Field | Rule-driving meaning | Unit / precision |
|---|---|---|---|
| `grns` | `grnNumber` | `GRN-<periodKey>-<seq>`, unique | text |
| | `poId`, `supplierId` | supplier is copied from the PO, never typed in | FK |
| | `status` | `draft`, `pending_qa`, `accepted`, `rejected`, `partial_accepted` | enum |
| | `receivedDate` | server time at create | timestamp |
| | `challanNo`, `challanDate`, `vehicleNo`, `driverName`, `driverPhone`, `remarks` | gate data | text |
| `grn_items` | `poItemId` | PO line being received | FK |
| | `receivedQty` (API name `arrivedQty`) | qty physically counted or weighed at the gate | item `uom`, 3 dp (pending Q-11) |
| | `acceptedQty` | qty posted to stock | same |
| | `rejectedQty` | qty QA refused, never posted | same |
| | `qaStatus` | `pending`, `passed`, `failed`, `waived` | text today, should become an enum |
| | `isQaBypassed`, `qaBypassReason`, `qaBypassedBy` | bypass audit | |
| `qa_tests` | one row per QA decision | `status`, `testedBy`, `testedAt`, `notes`, `testReportUrl` | |
| `purchase_order_items` | `qty`, `receivedQty`, `unitPricePaise` | ordered qty, cumulative accepted qty, stock rate (excl. GST) | paise int |
| `inventory_ledger` | `quantityChange` (signed), `balanceAfter`, `unitCostPaise`, `totalValueChangePaise`, `referenceType`, `referenceId`, `batchNumber` | the only record of stock | paise int |
| `item_master` | `currentStock`, `averageCostPaise` | cache of the ledger (BR-GRN-37..40) | qty 3 dp / paise int |

Tolerance: `OVER_RECEIPT_TOLERANCE_PCT` = 5 (pending Q-4).

## 4. State machine
Header (`grns.status`). Line states (`qaStatus`) are `pending` → `passed` | `failed` | `waived`, and they never go back.

| From | Action | To | Who | Preconditions (BR) | Side effects |
|---|---|---|---|---|---|
| — | create | draft | create roles | 01, 02, 03, 05 | number allocated (04), lines `pending` |
| draft | edit header / arrivedQty | draft | create roles | 06 | — |
| draft | delete | (deleted) | create roles | 07 | lines deleted, no stock effect |
| draft / pending_qa | QA accept line | derived (25) | QA roles | 09–12, 14–17 | ledger IN, stock + avg cost, PO roll-up (21, 22, 27, 28, 37, 38) |
| draft / pending_qa | QA reject line | derived (25) | QA roles | 09, 10, 12 | no ledger posting (13) |
| draft / pending_qa | bypass line | derived (25) | bypass roles | 09, 11, 14–20 | ledger IN `grn_bypass`, PO roll-up |
| accepted / partial_accepted | correction on a posted line | unchanged | correction roles | 29–33 | negative ledger adjustment, stock + avg reversed, PO roll-back (34) |

Terminal states: `accepted`, `rejected`, `partial_accepted` (no more QA actions; corrections are still allowed).
A GRN is never cancelled after its first posting. Mistakes are reversed with a correction.

## 5. Business rules

### Create & draft
- **BR-GRN-01** — A GRN can be created only against a PO whose status is `dispatched` or `partial_received`. Otherwise the request fails with 400 `Purchase order must be dispatched or partial_received…`.
- **BR-GRN-02** — Every line's `poItemId` must belong to the GRN's PO. Otherwise 400 `Invalid poItemId entries…`. `supplierId` is always taken from the PO.
- **BR-GRN-03** — Every line has `arrivedQty > 0`, and a `poItemId` may appear at most once per GRN. Otherwise 400. **[gap: duplicate check missing]**
- **BR-GRN-04** — `grnNumber` is allocated in the same transaction as the header insert. A number is never reused, even after its draft is deleted (gaps in the sequence are allowed).
- **BR-GRN-05** — `challanNo` is mandatory at create. A second GRN with the same (`supplierId`, `challanNo`) is rejected with 409 unless the earlier GRN was deleted. (pending Q-6) **[gap]**
- **BR-GRN-06** — Header fields and line `arrivedQty` can be edited only while the header is `draft`. Otherwise 400 `use the correction endpoint`.
- **BR-GRN-07** — Only a `draft` GRN can be deleted. Deleting it removes its lines and posts nothing to the ledger.
- **BR-GRN-08** — `receivedDate` is set to server time at create and cannot be edited or backdated through the API.

### QA decision
- **BR-GRN-09** — A line takes exactly one disposition (accept, reject or bypass). A second attempt returns 409 `already been finalized`. The check runs under a row lock on the `grn_items` row inside the posting transaction, so two concurrent requests post at most once. **[gap: the check runs outside the tx with no lock]**
- **BR-GRN-10** — One QA decision records both `acceptedQty` and `rejectedQty`, and `acceptedQty + rejectedQty = arrivedQty`. The line becomes `passed` if `acceptedQty > 0` and `failed` if `acceptedQty = 0`. (pending Q-2) **[gap: today accept and reject are mutually exclusive and the sum is not checked]**
- **BR-GRN-11** — `acceptedQty ≤ arrivedQty` on both accept and bypass. Otherwise 400. **[gap]**
- **BR-GRN-12** — Every QA accept or reject inserts exactly one `qa_tests` row with `status`, `testedBy` = actor, `testedAt` = now, `notes` = remarks and `testReportUrl` = certificate URL.
- **BR-GRN-13** — Rejected qty is never posted to `inventory_ledger`. It stays visible on the GRN line until a purchase return (later module) handles it. (pending Q-3)
- **BR-GRN-14** — Accept or bypass is refused with 409 if the PO is no longer `dispatched` or `partial_received` (for example cancelled or closed after the GRN was created). Nothing is posted. **[gap: today the ledger row is written first and the PO transition then throws]**

### Over-receipt
- **BR-GRN-15** — If `poItem.receivedQty + acceptedQty > poItem.qty × (1 + 5/100)`, the accept or bypass is refused with 400 unless the actor is owner, back_office or super-admin. (pending Q-4; super-admin is missing from the override list today)
- **BR-GRN-16** — An over-receipt override requires a non-empty `overrideReason`. The reason, the actor and the excess qty are stored on the line's `qa_tests.notes` (for bypass, on `qaBypassReason`). (pending Q-4) **[gap]**
- **BR-GRN-17** — The tolerance check reads `poItem.receivedQty` under a row lock in the posting transaction, so two GRNs on the same PO line cannot both pass the check on a stale value. **[gap]**

### Bypass
- **BR-GRN-18** — Bypass requires a non-empty `bypassReason`. It sets `qaStatus = waived`, `isQaBypassed = true` and `qaBypassedBy` = actor, and posts with `referenceType = grn_bypass`.
- **BR-GRN-19** — Only owner, back_office and super-admin can bypass. Anyone else gets 403. (pending Q-5; today floor_supervisor can and qa_inspector cannot)
- **BR-GRN-20** — Bypass `acceptedQty` defaults to `arrivedQty`. If a smaller qty is given, the remainder is recorded as `rejectedQty` (visible damage at the gate). (pending Q-2) **[gap: remainder is not recorded]**

### Posting (settles BL-016)
- **BR-GRN-21** — Each accept or bypass with `acceptedQty > 0` posts exactly one ledger row: `transactionType = in`, `quantityChange = +acceptedQty`, `unitCostPaise = poItem.unitPricePaise` (excl. GST), location = the default `main_store`, `referenceType = grn | grn_bypass`, `referenceId = grnId`, and the GRN line id recorded on the row (new column `referenceLineId`). **[gap: line id only in `notes` today]**
- **BR-GRN-22** — One database transaction does all of these: ledger insert, `item_master` stock/avg update (37, 38), `grn_items` update, `qa_tests` insert, `purchase_order_items.receivedQty`, PO status and GRN header status. If any step fails, none of them persist. **[gap: BL-016, the ledger is posted in its own tx]**
- **BR-GRN-23** — If no `main_store` location exists, accept, bypass and correction fail with 404 `No main_store location configured` and nothing is posted.
- **BR-GRN-24** — `totalValueChangePaise = sign(q) × round_half_up(|q| × unitCostPaise)` (rounding half away from zero). A full reversal at the same rate then nets to exactly 0 paise. **[gap: `Math.round` is asymmetric for negatives]**

### Header status
- **BR-GRN-25** — After every line action the header is recomputed. It is `accepted` if every line is passed or waived, `rejected` if every line is failed, `partial_accepted` if every line is decided with a mix, and otherwise `pending_qa` (at least one line still pending).
- **BR-GRN-26** — The header never returns to `draft` once any line has been decided.

### PO roll-up
- **BR-GRN-27** — Accept and bypass increase `poItem.receivedQty` by `acceptedQty`. Reject leaves it unchanged.
- **BR-GRN-28** — After roll-up the PO becomes `fully_received` if every PO line has `receivedQty ≥ qty`, otherwise `partial_received` if any line has `receivedQty > 0`. The move uses the PO module's transition table.

### Correction (post-posting reversal)
- **BR-GRN-29** — A correction is allowed only on a line that `passed` or was `waived`. Otherwise 400 `nothing to correct`.
- **BR-GRN-30** — The sum of all corrections on a line must be ≤ that line's `acceptedQty`. Otherwise 400. **[gap: today each correction is checked alone, so repeated corrections can exceed the accepted qty]**
- **BR-GRN-31** — A correction needs `qty > 0` and a non-empty `reason`. Roles: owner, back_office, super-admin.
- **BR-GRN-32** — A correction posts one ledger row: `transactionType = adjustment`, `quantityChange = −qty`, `unitCostPaise` = the original line's posted unit cost, `referenceType = grn_correction`, `referenceId = grnId`, `referenceLineId` = line id. (pending Q-7) **[gap: posts `stock_adjustment` today]**
- **BR-GRN-33** — A correction that would make the item's `balanceAfter` at that location negative is refused with 409 `Insufficient stock to reverse` (the material has already been issued). **[gap]**
- **BR-GRN-34** — A correction reduces `poItem.receivedQty` by `qty` and recomputes PO status. The PO may move `fully_received → partial_received` but not out of `invoiced` or `closed` (those give 409). (pending Q-8) **[gap]**
- **BR-GRN-35** — A correction never overwrites `grn_items.acceptedQty`. The line shows `netAcceptedQty = acceptedQty − Σ corrections` (from `correctedQty` on the line or from summing the ledger).
- **BR-GRN-36** — A correction is atomic in the same way as BR-GRN-22 (ledger, item cache and PO roll-back in one tx).

### Stock quantity & average cost (settles BL-014)
- **BR-GRN-37** — `inventory_ledger` is the source of truth. `item_master.currentStock` is a cache equal to `Σ quantityChange` over all locations for that item. It is updated in the **same transaction** as every ledger insert, from every posting path. (pending Q-1)
- **BR-GRN-38** — Moving weighted average (company-wide, not per location). On a posting with `quantityChange > 0`: `newAvg = round_half_up((Q × A + q × c) / (Q + q))`, where Q = currentStock before, A = averageCostPaise before, q = qty in and c = unitCostPaise. If `Q ≤ 0`, `newAvg = c`. (pending Q-1)
- **BR-GRN-39** — A GRN correction (a reversal of a receipt) removes value at the original cost: `newAvg = round_half_up((Q × A − q × c) / (Q − q))`. If `Q − q = 0` the average is unchanged. If the formula would give a negative number, `newAvg = A`. Any other outward or negative movement leaves `averageCostPaise` unchanged. (pending Q-1)
- **BR-GRN-40** — `currentStock` and `averageCostPaise` cannot be written through `POST/PATCH /asset/items`. Opening stock goes in through a manual adjustment posting (BR-GRN-43). (pending Q-9) **[gap: both are accepted in the item schemas today]**
- **BR-GRN-41** — Invariant: for every item, `currentStock = Σ ledger.quantityChange`, and for every (item, location) the latest `balanceAfter` = `Σ quantityChange` of that pair. A reconciliation query must return zero rows after any sequence of postings.
- **BR-GRN-42** — Every posting takes a `SELECT … FOR UPDATE` lock on the `item_master` row before it reads the balance or the average. This serialises concurrent postings for the same item, including the very first posting for a new item+location pair. **[gap: today only the last ledger row is locked, so the first posting for a pair is not protected]**

### Manual movements endpoint (settles BL-015)
- **BR-GRN-43** — `POST /asset/inventory/movements` accepts only `referenceType = stock_adjustment` (and `opening_stock` if Q-9 adds it) with `transactionType = adjustment` and non-empty `notes` (the reason). Any document-bound type (`grn`, `grn_bypass`, `grn_correction`, `pro`, `sco_issue`, `sco_receipt`, `job_order_issue`, `scrap_dispatch`) is refused with 400 `Post this movement from its source document`. (pending Q-10) **[gap]**
- **BR-GRN-44** — Manual adjustments follow BR-GRN-37..42: atomic cache update, no negative balance (409), and item lock. Positive adjustments need `unitCostPaise > 0`. Negative ones are valued at the current `averageCostPaise`, whatever the client sends. **[gap]**
- **BR-GRN-45** — Manual adjustment roles: owner, back_office, super-admin. Anyone else gets 403. (pending Q-10; owner is missing today)

### Permissions & audit
- **BR-GRN-46** — Every endpoint enforces the §2 role matrix through `requireRole`. A disallowed role gets 403 and nothing changes.
- **BR-GRN-47** — Every state change records who and when: `grns.createdBy`, `qa_tests.testedBy/testedAt`, `qaBypassedBy`, and `inventory_ledger.createdBy/createdAt` for postings and corrections (with the reason in `notes`).

## 6. Cross-module effects
| Effect | Module | Rule |
|---|---|---|
| Ledger IN row per accepted/bypassed line; negative adjustment per correction | inventory | 21, 32 |
| `item_master.currentStock` / `averageCostPaise` maintained in the same tx | inventory | 37–42 |
| PR cost estimates (`prRepository`, `estRatePaise`) and `getLastRate` fallback read `averageCostPaise`, and become correct once 38 ships | purchase-requisition, inventory | 38 |
| `purchase_order_items.receivedQty` up on accept/bypass, down on correction | purchase-order | 27, 34 |
| PO status `dispatched → partial_received → fully_received`, plus a new backward edge `fully_received → partial_received` | purchase-order | 28, 34 |
| PO short-close of a line that is short-supplied (for example 2 kg short on 1,000 kg) is **not** a GRN rule; the PO spec must decide it (today `partial_received → closed` is illegal) | purchase-order | — |
| Document numbering via `allocateDocumentSequence("grn")` | numbering | 04 |
| Rejected qty feeds the future Purchase Return (`pro`) and debit note | purchase-return (later) | 13 |
| Accepted qty + PO rate feed the future 3-way match (`supplier_invoices`) | invoice (later) | 21 |
| Schema changes implied: `inventory_ledger.referenceLineId`, enum value `grn_correction` (Q-7), optional `opening_stock` (Q-9), `grn_items.qaStatus` as a pg enum, optional `grn_items.correctedQty` | schema | 21, 32, 35 |

## 7. Acceptance criteria
Fixture: PO-1 `dispatched`, line L1 = item ALU-ADC12, qty 1000 kg @ 21,000 paise/kg. The item has
currentStock 0 and avg 0. One `main_store` exists.

- **AC-01** (BR-GRN-01) — Given PO-1 is `approved` (not dispatched), when back_office creates a GRN, then 400 and no GRN row exists.
- **AC-02** (BR-GRN-02) — Given a poItemId from PO-2, when a GRN for PO-1 includes it, then 400 listing that id. Given a valid request, then `supplierId` = PO-1's supplier.
- **AC-03** (BR-GRN-03) — Given two lines with the same poItemId, when create is called, then 400. Given `arrivedQty = 0`, then 400.
- **AC-04** (BR-GRN-04) — Given draft GRN-…-7 is deleted, when the next GRN is created, then it gets seq 8, not 7.
- **AC-05** (BR-GRN-05) — Given GRN A for supplier S with challan "CH-11", when GRN B is created for S with "CH-11", then 409. With no challanNo, then 400.
- **AC-06** (BR-GRN-06) — Given a GRN in `pending_qa`, when PATCH changes arrivedQty, then 400 and the qty is unchanged.
- **AC-07** (BR-GRN-07) — Given a draft GRN, when it is deleted, then the header and lines are gone and the ledger row count is unchanged. Given a `partial_accepted` GRN, then 400.
- **AC-08** (BR-GRN-08) — Given a create body containing `receivedDate` 2026-01-01, then the stored `receivedDate` is the server time.
- **AC-09** (BR-GRN-09, BR-GRN-22) — Given line L1 pending, when two accept requests run concurrently, then exactly one returns 200, the other 409, and exactly one ledger row exists for the line.
- **AC-10** (BR-GRN-10) — Given arrivedQty 1000, when QA submits accepted 980 + rejected 20, then the line is `passed` with 980/20. When it submits 980 + 10, then 400. When it submits 0 + 1000, then the line is `failed` and no ledger row is written.
- **AC-11** (BR-GRN-11) — Given arrivedQty 1000, when accept or bypass has acceptedQty 1001, then 400.
- **AC-12** (BR-GRN-12) — Given an accept with remarks "spectro OK" and a cert URL, then exactly one `qa_tests` row has status `passed`, testedBy = actor, and notes/testReportUrl set.
- **AC-13** (BR-GRN-13) — Given accepted 980 / rejected 20, then the ledger `quantityChange` sum for the item = 980.
- **AC-14** (BR-GRN-14, BR-GRN-22) — Given PO-1 is cancelled after the GRN was created, when QA accepts, then 409, no ledger row, and the line stays `pending`.
- **AC-15** (BR-GRN-15) — Given PO line received 1000, when a floor or QA user accepts 60 more (1060 > 1050), then 400. When back_office does it with a reason, then 200. When super-admin does it, then 200.
- **AC-16** (BR-GRN-16) — Given an over-tolerance accept by owner without `overrideReason`, then 400. With a reason, then `qa_tests.notes` contains the reason and the excess qty 10.
- **AC-17** (BR-GRN-17) — Given two GRNs each accepting 600 on L1 concurrently (by a non-override role), then one succeeds, the other gets 400, and `poItem.receivedQty` = 600.
- **AC-18** (BR-GRN-18) — Given a bypass with an empty reason, then 400. With the reason "furnace waiting", then the line is `waived`, `isQaBypassed` is true, `qaBypassedBy` = actor, and the ledger `referenceType` = `grn_bypass`.
- **AC-19** (BR-GRN-19, BR-GRN-46) — Given a floor_supervisor or qa_inspector, when they call bypass, then 403 and nothing changes.
- **AC-20** (BR-GRN-20) — Given arrivedQty 1000, when bypass sends acceptedQty 990, then acceptedQty 990, rejectedQty 10, and the ledger shows +990.
- **AC-21** (BR-GRN-21) — Given accept 980, then one ledger row: `in`, +980, unitCost 21000, `grn`, referenceId = grnId, referenceLineId = L1's GRN line id, location = main_store.
- **AC-22** (BR-GRN-22) — Given the PO roll-up step is forced to fail, when QA accepts, then there is no ledger row, `currentStock` is unchanged, the line is `pending` and `poItem.receivedQty` is unchanged.
- **AC-23** (BR-GRN-23) — Given no `main_store` location, when QA accepts, then 404 and nothing is persisted.
- **AC-24** (BR-GRN-24) — Given 2.5 kg posted at 1 paise, then value = +3. The correction of 2.5 kg then gives value −3, and the net is 0.
- **AC-25** (BR-GRN-25) — Given a 2-line GRN, when line 1 is accepted, then the header is `pending_qa`. When line 2 is rejected, then `partial_accepted`. When all lines are accepted, then `accepted`. When all are rejected, then `rejected`.
- **AC-26** (BR-GRN-26) — Given a `pending_qa` GRN, no action returns it to `draft`.
- **AC-27** (BR-GRN-27) — Given accept 980 then a reject on another GRN for L1, then `poItem.receivedQty` = 980.
- **AC-28** (BR-GRN-28) — Given 980 of 1000 received, then the PO is `partial_received`. After another 20, then `fully_received` (also directly from `dispatched` in a single GRN).
- **AC-29** (BR-GRN-29) — Given a `failed` or `pending` line, when a correction is posted, then 400.
- **AC-30** (BR-GRN-30) — Given accepted 980, when corrections of 500 then 500 are posted, then the second one gets 400 and the net accepted is 480.
- **AC-31** (BR-GRN-31, BR-GRN-46) — Given a qa_inspector, when they post a correction, then 403. Given an empty reason, then 400.
- **AC-32** (BR-GRN-32) — Given L1 posted at 21000 and the avg has since moved to 20500, when correcting 30, then the ledger row is `adjustment`, −30, unitCost 21000, `grn_correction`, and referenceLineId is set.
- **AC-33** (BR-GRN-33) — Given 980 received and 900 already issued out (balance 80), when correcting 100, then 409 and nothing is posted.
- **AC-34** (BR-GRN-34) — Given the PO is `fully_received` with 1000/1000, when correcting 30, then `poItem.receivedQty` = 970 and the PO is `partial_received`. Given the PO is `closed`, then 409.
- **AC-35** (BR-GRN-35) — Given accepted 980 and a correction of 30, then GRN details show acceptedQty 980 and netAcceptedQty 950.
- **AC-36** (BR-GRN-36) — Given the PO roll-back is forced to fail during a correction, then there is no ledger row and `currentStock` is unchanged.
- **AC-37** (BR-GRN-37) — Given accept 980, then `item.currentStock` = 980 in the same response cycle. After a correction of 30, it is 950.
- **AC-38** (BR-GRN-38) — Given stock 0, when 1000 @ 21000 is accepted, then avg = 21000. When 500 @ 22000 is then accepted, then avg = round((21,000,000 + 11,000,000)/1500) = 21333. Given stock −5 (legacy), when 10 @ 100 is received, then avg = 100.
- **AC-39** (BR-GRN-39) — Given stock 1500 at avg 21333, when 500 received @ 22000 is corrected, then avg = round((1500 × 21333 − 500 × 22000)/1000) = 21000. Given stock 500 and a correction of 500, then avg is unchanged.
- **AC-40** (BR-GRN-40) — Given an item, when PATCH /asset/items sends `currentStock: 50`, then 400 (or the field is ignored) and the stock is unchanged.
- **AC-41** (BR-GRN-41) — Given any sequence of accepts, bypasses, corrections and manual adjustments, then the reconciliation query returns 0 rows.
- **AC-42** (BR-GRN-42) — Given a brand-new item and location, when two +10 postings run concurrently, then the balances are 10 and 20 (never 10 and 10) and `currentStock` = 20.
- **AC-43** (BR-GRN-43) — Given back_office, when POST /asset/inventory/movements has `referenceType: grn`, then 400 and no row. With `stock_adjustment` and no notes, then 400.
- **AC-44** (BR-GRN-44) — Given balance 5, when a manual −10 adjustment is posted, then 409. When a manual −2 is posted with client unitCost 1, then the row's unitCost = the current avg.
- **AC-45** (BR-GRN-45) — Given floor_supervisor, when they post a manual movement, then 403. Given owner, then 200.
- **AC-46** (BR-GRN-46) — Given die_designer, when they call create, QA, bypass or correction, then 403 for each and the GET endpoints return 200.
- **AC-47** (BR-GRN-47) — After an accept, a bypass and a correction, then each resulting row carries the actor id and a timestamp, and the correction's `notes` contains the reason.

## 8. Screens (frontend)
- **GRN list** (`/grn`): number, PO, supplier, challan, received date, status badge, and a line-level QA filter. The "New GRN" button is shown to create roles.
- **Create/Edit modal**: pick a PO (only `dispatched`/`partial_received`), header gate fields (challan mandatory, pending Q-6), and lines with ordered, previously received and arrived qty. It warns (does not block) when arrived exceeds the remaining qty plus tolerance. Edit and delete are visible only in `draft`.
- **GRN detail**: lines with arrived, accepted, rejected, net accepted and QA status. Row actions by status and role:
  `pending` → QA decision (accepted + rejected qty, remarks, cert URL, override reason if over tolerance) for QA roles, and Bypass for bypass roles.
  `passed`/`waived` → Correction (qty ≤ remaining, reason) for correction roles. `failed` → no action.
- Stock screens and PR estimates read `item_master` only because BR-GRN-37 keeps it in sync.

## 9. Reports / queries needed
- Pending-QA queue: lines with `qaStatus = pending`, age since `receivedDate`.
- GRN register by date/supplier/item: arrived, accepted, rejected, value (paise), bypassed flag.
- Bypass and over-receipt override log (who, why, qty).
- Correction log per GRN line (qty, reason, actor, value).
- Stock reconciliation (BR-GRN-41): items where `currentStock ≠ Σ ledger`, and pairs where the latest `balanceAfter ≠ Σ`.
- PO receipt status: ordered vs received vs pending per PO line.

## 10. Out of scope / later
- Purchase Return / debit note for rejected qty (`purchase_returns`, `pro` postings).
- Supplier invoice 3-way match, supplier payments.
- Multi-location receiving (a `locationId` on the GRN), rejected-goods location (unless Q-3 picks it).
- Landed cost (freight, loading) in the stock rate. Stock is valued at the PO rate only.
- Per-item QA-required flag and external lab tests (`qa_tests.type = external`).
- Challan photo upload (`challanPhotoUrl`).
- Subcontracting GRN (M2) and backdated receipts.
- A dedicated stock-adjustment document with approval (for now a manual adjustment is one ledger row with a reason).

## 11. Open questions (answer inline)
Phrased so a stores or purchase clerk can answer in one line. The recommended option is listed first.

**Q-1 — How should "current stock" and "average cost" on the item be kept correct? (BL-014)**
- a) **Recommended.** The ledger is the truth. Update `currentStock` and `averageCostPaise` on the item in the same transaction as every posting, using a moving weighted average, company-wide. This is how ERPNext (Bin + moving average) and SAP B1 (moving average, company-wide option) work. Reads are fast and one reconciliation query proves it correct.
- b) Don't store them. Compute them from the ledger on every read (a SQL view). It can never drift, but every stock list and PR estimate sums the whole ledger, and the average cost needs the full history replayed.
- c) FIFO layers (Odoo FIFO). More accurate for volatile aluminium prices, but needs a cost-layer table and a consumption order. Too heavy for M1.
- Sub-question: one average per item for the whole plant (recommended, since there is one store today), or one per location?
- Answer:

**Q-2 — When one delivery line is partly good and partly bad (e.g. 980 kg OK, 20 kg rejected), how is it recorded?**
- a) **Recommended.** QA enters the accepted and rejected qty on the same line, and they must add up to the arrived qty (ERPNext model).
- b) Keep today's behaviour: the whole line is either accepted (any qty) or rejected. A split needs two GRN lines. Simpler, but the rejected qty is lost when you accept a reduced qty.
- c) Allow accepted + rejected < arrived and treat the difference as "short / missing". This is more flexible but adds a third bucket.
- Answer:

**Q-3 — Where does rejected material sit until it goes back to the supplier?**
- a) **Recommended for M1.** It is not in stock at all. It shows only on the GRN line, and the purchase return (later) handles it.
- b) It posts into a "Rejected" location, which is not usable stock (like ERPNext's Rejected Warehouse). This tracks it physically but needs a location type and a reversal on return.
- c) It posts to `scrap_yard` if the supplier won't take it back. This mixes up supplier rejects and plant scrap.
- Answer:

**Q-4 — How much extra over the PO qty may stores accept, and who may go beyond it?**
- a) **Recommended.** One plant-wide 5%. Beyond that, only owner, back_office or super-admin can accept, and they must give a reason.
- b) A % per item (e.g. ingots 5% for weighbridge variance, spares 0%). More accurate, but it is a new item-master field (ERPNext supports both).
- c) 0%: never accept more than ordered. The extra goes back or needs a PO amendment.
- Answer:

**Q-5 — Who may skip QA ("bypass") and send material straight to stock?**
- a) **Recommended.** Only owner, back_office or super-admin, with a reason.
- b) Keep today's rule: the floor supervisor can also bypass. This is faster at the gate, but the person receiving can skip the check on their own receipt.
- c) Only for items marked "no QA needed" in the item master (ERPNext "inspection required" flag). This needs a new field. Later.
- Answer:

**Q-6 — Is the supplier's challan / invoice number mandatory at the gate, and can the same number repeat?**
- a) **Recommended.** It is mandatory, and the same number from the same supplier is blocked. This catches double entry of one truck.
- b) Mandatory, but a repeat only gives a warning (for suppliers who reuse challan numbers across years).
- c) Optional (today). Nothing links the GRN to the supplier's paper for the later invoice match.
- Answer:

**Q-7 — How should a GRN correction appear in the stock ledger?**
- a) **Recommended.** A new reference type `grn_correction` with the GRN line id. It is clearly separate from physical-count adjustments.
- b) Keep `stock_adjustment` (today). GRN corrections and stock-take adjustments then can't be told apart in reports.
- c) Post it as a negative `grn` row. Simple, but it breaks the "IN" meaning of the `grn` type.
- Answer:

**Q-8 — When a received qty is corrected down, should the PO show that qty as "still to come"?**
- a) **Recommended.** Yes. PO received qty goes down, and a fully received PO goes back to partially received (ERPNext and SAP B1 do this on a return against the receipt). It is blocked once the PO is invoiced or closed.
- b) No. The PO stays as it is and the correction only touches stock. PO receipt figures then overstate what really arrived.
- c) Ask each time with a flag "supplier will resend". More flexible, but it adds a decision for the clerk.
- Answer:

**Q-9 — How does opening stock (go-live day) and its cost get in?**
- a) **Recommended.** Through a manual adjustment posting with qty and rate, under a new reference type `opening_stock`. The stock and cost fields on the item become read-only.
- b) Type it into the item master fields (today). Fast, but the ledger then doesn't match the item and reconciliation fails from day one.
- c) A one-time import script that writes ledger rows. Clean, but it is a dev task and can't be repeated by stores.
- Answer:

**Q-10 — What may the manual stock-movement screen post? (BL-015)**
- a) **Recommended.** Only stock-take adjustments (plus opening stock), with a mandatory reason, by owner, back_office or super-admin. Receipts, issues and returns must come from their documents (SAP B1 model).
- b) Keep all reference types, but check that the referenced GRN/SCO actually exists. This still lets someone bypass QA and the over-receipt rules.
- c) Remove the endpoint entirely until a stock-adjustment document exists. Safest, but go-live stock-take fixes then need a developer.
- Answer:

**Q-11 — How many decimals are needed for received qty?**
- a) **Recommended.** 3 decimals (kg to the gram, litre to the ml). Pieces are whole numbers, enforced by the item's `uom`.
- b) 2 decimals everywhere.
- c) Whole numbers only. This does not work for ingots weighed on a weighbridge.
- Answer:

**Q-12 — Should stores record the supplier's heat / melt / batch number for ingots at receipt?**
- a) **Recommended.** Yes, as an optional field per GRN line, saved on the ledger `batchNumber`. It is needed later to trace a casting defect back to the ingot lot.
- b) Yes, and mandatory for raw-material items. This needs an item-category rule.
- c) Not now.
- Answer:

**Q-13 — If a supplier ships a little less than ordered and won't send the rest, how is the PO line closed?** (Belongs to the PO spec; recorded here so it isn't lost.)
- a) **Recommended.** A "short-close" action on the PO line, with a reason, by back_office. The PO can then become fully received or closed.
- b) Treat anything within X% under the order as fully received.
- c) The PO stays partially received forever (today).
- Answer:

## 12. Implementation status
| BR | Status | Test |
|---|---|---|
| 01, 02, 04, 06, 07, 08, 12, 18, 23, 25, 26, 27, 28, 29, 31, 46 | done (as-built, untested) | — |
| 15 | partial (super-admin missing from the override roles) | — |
| 35 | partial (acceptedQty kept; no net qty exposed) | — |
| 19, 45 | partial (role lists differ from §2) | — |
| 03, 05, 09, 10, 11, 13 (enforced implicitly), 14, 16, 17, 20, 21, 22, 24, 30, 32, 33, 34, 36, 37, 38, 39, 40, 41, 42, 43, 44, 47 (correction reason in notes: done) | todo | — |

## Changelog
- 2026-09-27 v0 — draft created retroactively from code at 0a406f4. Settles BL-014 (BR 37–42), BL-015 (BR 43–45) and BL-016 (BR 22, 36).
