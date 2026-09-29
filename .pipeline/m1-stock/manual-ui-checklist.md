# Manual UI checklist — GRN + GRN stock (specs grn.md v1, grn-stock.md v1)

Setup: PO-1 `dispatched`, line L1 = ALU-ADC12 1000 kg @ 21,000 paise/kg (Rs 210.00), item stock 0, one `main_store`.
A second PO-2 with any line. Users: ow = owner, bo = back_office, fs = floor_supervisor, qa = qa_inspector, dd = die_designer.
Stock check = `/inventory/items` (stock, average cost) and `/inventory/movements` (ledger rows).

## 1. Create GRN (BR-GRN-01, 02, 04, 05, 08, 19)
- [ ] fs/bo, `/grn`, PO-1 > Receive goods: fill challan "CH-11", L1 arrived 1000. Create button disabled until challan filled. Expect GRN `GRN-<period>-<seq>`, status draft, supplier = PO supplier.
- [ ] No received-date field on the form. Stored date = today.
- [ ] Decimal qty 2.5 kg accepted. For a pcs item, 2.5 is refused (toast 400).
- [ ] Arrived qty 0 or negative: refused.
- [ ] Same line twice in one GRN: refused. Line of PO-2 on a PO-1 GRN: refused.
- [ ] Same supplier, challan "CH-11" again: 409 toast. Delete first GRN, then "CH-11" works.
- [ ] Delete a draft (seq 7), create another: it gets seq 8, not 7.
- [ ] PO not dispatched/partial_received (cancelled, draft): cannot create (400).
- [ ] dd: sees GRN list/detail, no create button / create gives 403.

## 2. Edit / delete draft (BR-GRN-06, 05)
- [ ] `/grn/[id]` Edit (draft): change arrived qty, batch/heat no. Saved.
- [ ] Blank the challan: refused.
- [ ] After a first line decision (status pending_qa or later): Edit and Delete unavailable or 400 "use the correction"; qty unchanged.
- [ ] Delete draft: GRN gone, no ledger rows.

## 3. QA decision (BR-GRN-09, 10, 12, 13, 21, 25, 27, 37, 38)
- [ ] qa, decide L1 arrived 1000: accepted 980 + rejected 20, batch "H-77", remarks "spectro OK", certificate URL. Line `passed`. Ledger: one `in` row +980, cost 21000, ref `grn`, location main_store, heat H-77. Item stock 980, average 21000. PO-1 `partial_received`, received 980.
- [ ] Rejected 20 not in stock. Line still shows rejected 20.
- [ ] QA test row exists (result passed, tester = qa, time, remarks).
- [ ] Accepted 980 + rejected 10 (not sum of arrived): inline error, cannot submit.
- [ ] Accepted 0 + rejected 1000: line `failed`, no ledger row, stock unchanged.
- [ ] Decide the same line again (second tab, both open before): one 200, one 409, one ledger row only.
- [ ] Two-line GRN: accept line 1 -> header pending_qa. Reject line 2 -> partial_accepted. All passed -> accepted. All failed -> rejected.
- [ ] Second GRN of 20 accepted -> PO-1 `fully_received`.
- [ ] Second receipt at 22,000 for 500 (stock 1000 @ 21000 -> average 21333 after accept; adjust numbers to your data): average matches (old stock x avg + qty x cost) / new stock, rounded.
- [ ] fs: Decide button not available / 403.
- [ ] PO cancelled after GRN made, qa accepts: 409, no ledger row, line stays pending.

## 4. Over-receipt (BR-GRN-15)
- [ ] L1 received 1000. qa accepts 60 more (over 1050): 400 toast. Modal shows "cannot override" note, no reason box.
- [ ] bo/ow: reason box appears past 105%. Empty reason -> refused. With reason "supplier weighbridge" -> 200; line shows excess 10 and reason under item.
- [ ] Exactly 50 more (1050): passes without override.
- [ ] Two GRNs of 600 against fresh 1000 line, accept both at once: only one succeeds, other 400.

## 5. Bypass (BR-GRN-18, 10, 19, 21)
- [ ] bo/ow, Bypass on a pending line, reason "furnace waiting": line `waived`, marked bypassed with who/why. Ledger ref `grn_bypass`, +arrived qty, cost = PO rate.
- [ ] Empty reason: refused.
- [ ] Bypass accepted 990 of 1000: 10 shown "recorded as rejected"; stock +990.
- [ ] fs: Bypass button hidden; API attempt gives 403. qa also cannot bypass.
- [ ] Bypass past 105% needs override reason (bo/ow only).
- [ ] Second decision on a bypassed line: 409.

## 6. Correction (BR-GRN-29, 32, 33, 34, 35, 39, 24)
- [ ] bo/ow, Correct on `passed` line accepted 980: dialog shows max correctable 980. Correct 30, reason "short weight": ledger row `adjustment` -30, cost = posted cost, ref `grn_correction`. Item stock -30. Line shows accepted 980, net accepted 950 ("1 corrected").
- [ ] PO-1 received drops by 30; if it was `fully_received` it becomes `partial_received`.
- [ ] Average after correction = (stock x avg - qty x cost) / (stock - qty); check with a mixed-rate case (1500 @ 21333, correct 500 received @ 22000 -> 21000).
- [ ] Correct whole remaining stock (stock -> 0): average unchanged.
- [ ] Corrections 500 then 500 on accepted 980: second refused (400), net 480.
- [ ] Qty 0, or empty reason: refused.
- [ ] `failed` line: no Correct option / 400.
- [ ] Waived (bypass) line: correction allowed.
- [ ] Issue stock so balance is 80 (manual out 900), correct 100: 409 "Insufficient stock", nothing posted.
- [ ] PO `closed` or invoiced: correction 409.
- [ ] qa/fs: no Correct button / 403.
- [ ] 2.5 kg @ 1 paise item: accept -> row value +3; correct 2.5 -> -3; net 0.

## 7. Manual stock movements (BR-GRN-40, 43, 44, 37, 41)
- [ ] bo/ow/super-admin, `/inventory/movements` > Create: only "Stock-take" (default) and "Opening stock"; no transaction type or reference id field; Reason required.
- [ ] Opening stock +50 @ Rs 100 for new item: stock 50, average 100. Cost missing or 0 on stock-in: refused.
- [ ] Stock-out -2: cost field not sent; ledger row cost = current average.
- [ ] Stock-out beyond balance: 409 Insufficient stock.
- [ ] Posting type `grn` (via API or dev tools): 400 "post from its source document". Same for `grn_bypass`, `grn_correction`, `pro`, `sco_issue`, `sco_receipt`, `sco_loss`, `job_order_issue`, `scrap_dispatch`.
- [ ] fs: Create movement not available / 403.
- [ ] List and detail show readable labels for grn, grn_bypass, grn_correction refs.
- [ ] After a mix of accepts, bypass, corrections, adjustments: item stock equals sum of its ledger rows (compare `/inventory/items` with movements list); reconciliation returns zero rows if a screen/endpoint exists.

## 8. Item edit blocks stock (BR-GRN-40)
- [ ] bo, `/inventory/items` create: no current stock / average cost inputs.
- [ ] Edit item: both shown read-only; API PUT with currentStock 50 -> 400, stock unchanged.

## 9. Concurrency and atomicity (BR-GRN-09, 22, 42)
- [ ] New item (no ledger rows), two opening-stock +10 posted at once: balances 10 and 20, stock 20.
- [ ] (Needs dev help) force PO update to fail on accept: no ledger row, stock unchanged, line still pending.

## 10. Access sweep (BR-GRN-19)
| Role | View | Create/edit draft | QA decide | Bypass | Over-receipt override | Correct | Manual adjust |
|---|---|---|---|---|---|---|---|
| ow | yes | yes | yes | yes | yes | yes | yes |
| bo | yes | yes | yes | yes | yes | yes | yes |
| fs | yes | yes | no (403) | no (403) | no | no | no (403) |
| qa | yes | no | yes | no | no | no | no |
| dd | yes | no (403) | no | no | no | no | no |
- [ ] Each "no" cell: button hidden or action gives 403, and nothing changes.
