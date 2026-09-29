---
module: grn
status: frozen           # draft | frozen | changed-after-freeze
version: 1
frozen_on: 2026-09-29
owner: Arun
depends_on: [purchase-order, inventory, suppliers, grn-stock, auth-setup]
---
# GRN (Goods Received Note)

> Receipt, QA, bypass, over-receipt, PO roll-up and correction. Stock posting and average cost: `grn-stock.md`.
> Code, gaps and history: `docs/modules/grn.md`. Settles BL-014, BL-015, BL-016 (with `grn-stock.md`).

## Summary

Stores record material arriving at the gate against a dispatched PO (ingots by kg, release agent by litre,
spares by piece). QA accepts or rejects each line; accepted qty goes into the main store at the PO rate.
Owner or back office can bypass QA for urgent material, with a reason. Mistakes found after posting are
fixed with a correction, never by editing. Done = store stock, average cost and PO receipt status match
the physical receipt, and every posting traces to a GRN line, a person and a reason.

- Affects: stock ledger and item cache (`grn-stock.md`), PO received qty and status, numbering (`grn`).
- Reports: pending-QA queue (with age), GRN register, bypass/override log, correction log, PO received vs ordered.
- Examples use: PO-1 `dispatched`, line L1 = ALU-ADC12, 1000 kg @ 21,000 paise/kg, stock 0, one `main_store`.

## Who can do what

Permission keys from `auth-setup.md`; super-admin passes every check. Seed: ow = owner, bo = back_office, fs = floor_supervisor, qa = qa_inspector, dd = die_designer.

| Action | Key | Seed roles |
|---|---|---|
| view | `grn.view` | ow, bo, fs, qa, dd |
| create / edit / delete draft | `grn.edit_draft` | ow, bo, fs |
| QA accept / reject | `grn.qa_decide` | ow, bo, qa |
| bypass QA | `grn.qa_bypass` | ow, bo |
| accept over tolerance | `grn.over_receipt_override` | ow, bo |
| correction | `grn.correct` | ow, bo |

## Flow

Header status. Line status goes `pending` → `passed` / `failed` / `waived` and never goes back.

| From | Action | To | Rule |
|---|---|---|---|
| — | create | draft | BR-GRN-01, 02, 04, 05, 08 |
| draft | edit / delete | draft / gone | BR-GRN-06 |
| draft / pending_qa | QA decision on a line | recomputed | BR-GRN-09, 10, 12, 13, 15, 25, 27 |
| draft / pending_qa | bypass a line | recomputed | BR-GRN-09, 10, 15, 18, 25, 27 |
| accepted / partial_accepted | correction on a posted line | unchanged | BR-GRN-29, 34, 35 |

`accepted`, `rejected`, `partial_accepted` are final for QA. A GRN is never cancelled after its first posting.

## Rules

| ID | Rule | Example (given → then) |
|---|---|---|
| BR-GRN-01 | A GRN can be created, and a line accepted or bypassed, only while its PO is `dispatched` or `partial_received`. Otherwise create gets 400, accept/bypass get 409, and nothing is posted. | PO-1 cancelled after the GRN was made, QA accepts → 409, no ledger row, line stays `pending` |
| BR-GRN-02 | Every line must be a line of the GRN's PO, have arrived qty > 0, and appear once per GRN. Supplier is copied from the PO. Qty has up to 3 decimals; whole numbers for items in pieces. | Two lines for L1 → 400; a line from PO-2 → 400 |
| BR-GRN-04 | The GRN number `GRN-<period>-<seq>` is given at create and never reused, even if the draft is deleted. | Draft seq 7 deleted → next GRN gets seq 8 |
| BR-GRN-05 | Supplier challan number is mandatory. The same challan number from the same supplier is blocked with 409, unless the earlier GRN was deleted. | GRN A for S has "CH-11", GRN B for S with "CH-11" → 409; no challan → 400 |
| BR-GRN-06 | Only a `draft` GRN can be edited (header, arrived qty) or deleted. Deleting removes its lines and posts nothing. Otherwise 400 "use the correction". | GRN in `pending_qa`, change arrived qty → 400, qty unchanged |
| BR-GRN-08 | Received date is set to server time at create and cannot be sent, edited or backdated. | Body has receivedDate 2026-01-01 → stored date = server time |
| BR-GRN-09 | Each line gets exactly one decision (accept, reject or bypass). A second one gets 409. Two requests at the same time post at most once. | Two accepts on L1 at once → one 200, one 409, one ledger row |
| BR-GRN-10 | A decision records accepted and rejected qty on the same line, and accepted + rejected = arrived. The line is `passed` if accepted > 0, else `failed`. Bypass defaults accepted = arrived; a smaller accepted qty records the rest as rejected. | Arrived 1000: 980+20 → `passed`; 980+10 → 400; 0+1000 → `failed`, no ledger row; bypass 990 → rejected 10 |
| BR-GRN-12 | Every decision is traceable: QA accept/reject writes one QA test row (result, tester, time, remarks, certificate URL); bypass stores who and why; every posting and correction stores who, when and the reason. | Accept with remarks "spectro OK" → one QA row `passed`, tester = actor |
| BR-GRN-13 | Rejected qty never goes into stock. It stays on the GRN line until a purchase return (later) handles it. | Accepted 980, rejected 20 → stock moves by +980 only |
| BR-GRN-15 | If PO line received qty + accepted qty > ordered × 1.05 (one plant-wide 5%), accept/bypass is refused with 400, unless the actor holds `grn.over_receipt_override` and gives a reason. The reason, actor and excess qty are stored. The check uses the latest received qty, so two GRNs cannot both slip through. | L1 received 1000, QA accepts 60 → 400; back_office with reason → 200, excess 10 stored; two GRNs of 600 at once → one 400 |
| BR-GRN-18 | Bypass needs `grn.qa_bypass` and a reason. The line becomes `waived`, marked bypassed with who did it, and is posted as `grn_bypass`. | Empty reason → 400; "furnace waiting" → `waived`, ledger type `grn_bypass` |
| BR-GRN-19 | Every action needs the key in "Who can do what". Without it the caller gets 403 and nothing changes. | fs (no `grn.qa_bypass`) bypasses → 403; dd creates → 403, can view |
| BR-GRN-25 | After each line action the header is recomputed: all passed/waived → `accepted`; all failed → `rejected`; all decided and mixed → `partial_accepted`; any pending → `pending_qa`. It never goes back to `draft`. | 2 lines: line 1 accepted → `pending_qa`; line 2 rejected → `partial_accepted` |
| BR-GRN-27 | Accept and bypass add accepted qty to the PO line's received qty; reject does not. The PO becomes `fully_received` when every line has received ≥ ordered, otherwise `partial_received`. | 980 of 1000 → `partial_received`; 20 more → `fully_received` |
| BR-GRN-29 | A correction needs `grn.correct`, is allowed only on a `passed` or `waived` line, needs qty > 0 and a reason, and all corrections on a line together may not exceed its accepted qty. Otherwise 400. | Accepted 980, corrections 500 then 500 → second gets 400, net 480; `failed` line → 400 |
| BR-GRN-34 | A correction lowers the PO line's received qty and recomputes PO status, so `fully_received` can go back to `partial_received`. Blocked with 409 if the PO is invoiced or closed. | PO 1000/1000, correct 30 → 970, `partial_received`; PO `closed` → 409 |
| BR-GRN-35 | A correction never changes the line's accepted qty. The line shows net accepted = accepted − all corrections. | Accepted 980, correction 30 → shows 980 and net 950 |

## Not now

- Purchase return / debit note for rejected qty; supplier invoice 3-way match; supplier payments.
- Receiving into a location other than `main_store`; a "rejected goods" location.
- Landed cost (freight, loading) in the stock rate — stock is valued at the PO rate only.
- Per-item "QA required" flag; per-item over-receipt tolerance; external lab tests; challan photo upload.
- Subcontracting GRN (M2); backdated receipts.
- Short-closing a short-supplied PO — owned by the PO spec: whole-PO short-close, purchase-order BR-PO-13.

## Questions for you

None open.

## Changelog

- 2026-09-27 v0 — draft created from code at 0a406f4.
- 2026-09-28 — rewritten in slim format; stock/cost rules moved to `grn-stock.md`. Merged: BR-GRN-01 (was 01, 14), 02 (was 02, 03), 06 (was 06, 07), 10 (was 10, 11, 20), 12 (was 12, 47), 15 (was 15, 16, 17), 19 (was 19, 46), 25 (was 25, 26), 27 (was 27, 28), 29 (was 29, 30, 31).
- 2026-09-29 — answers folded in: Q1=A (BR-GRN-10), Q2=A (BR-GRN-15), Q3=A (BR-GRN-18, fs loses `grn.qa_bypass`), Q4=A (BR-GRN-05), Q5=A (BR-GRN-34). Access now uses permission keys from `auth-setup.md`.
- 2026-09-29 — pre-freeze touch-up: short-close "Not now" line points to purchase-order BR-PO-13.
- 2026-09-29 — accepted defaults at freeze (were "assumed"): BR-GRN-02, BR-GRN-13
- 2026-09-29 — frozen v1 (all questions answered by Arun)
