---
module: subcontracting
status: draft            # draft | frozen | changed-after-freeze
version: 0
frozen_on:
owner: Arun
depends_on: [auth-setup, approval, approval-policies, grn, grn-stock, suppliers, inventory]
---
# Subcontracting (job work to outside processors)

> Code, gaps, GST notes and the ERP benchmark: `docs/modules/subcontracting.md`.

## Summary

Back office raises a Subcontracting Order (SCO) to an outside processor (CNC, plating, heat treatment):
what we send (raw castings), the service and its price, and what comes back (the processed part).
After approval, stores send material out on a job-work challan (GST Sec 143, no tax charged), receive
processed goods back against it, QA accepts or rejects, and back office closes the SCO, writing off any loss.
Done on the floor = stock at each vendor always matches what is physically there, every challan is settled
within one year, and the processed part's cost = casting cost + job-work charge.

- Examples use: SCO-1 to vendor "Sai CNC", line L1: send 1000 pcs HSG-RC (raw casting, average 12,000
  paise), service "CNC machining" 2,500 paise/pc + 18% GST, get back 1000 pcs HSG-MC. Ratio 1:1.
- Reports: open challans with days left, stock at each vendor, SCO register, loss log.

## Who can do what

Keys are in `auth-setup.md`, held by no role until the M2 release seeds them as below; super-admin passes
every check. Seed: ow owner, bo back_office, fs floor_supervisor, qa qa_inspector.

| Action | Key | M2 seed roles |
|---|---|---|
| view SCOs, challans, receipts, vendor stock | `sco.view` | ow, bo, fs, qa |
| create / edit draft, submit, cancel | `sco.manage` | ow, bo |
| issue material (challan), enter receipt | `sco.issue_receive` | ow, bo, fs |
| QA accept / reject a receipt line | `sco.qa_decide` | ow, bo, qa |
| close SCO, loss within tolerance | `sco.close` | ow, bo |
| close with loss above tolerance | `sco.loss_override` | ow |
| approve | the approval chain (`approval.md`) | |

## Flow

| From | Action | To | Rule |
|---|---|---|---|
| — | create | draft | BR-SCO-01, 02, 03 |
| draft | submit | pending_approval / approved | BR-SCO-06 |
| pending_approval | approve / reject / send back | approved / rejected / draft | BR-SCO-06 |
| approved | first challan | material_issued | BR-SCO-07, 08 |
| material_issued | more challans, receipts | material_issued | BR-SCO-07, 12–17 |
| material_issued | all issued, nothing left at vendor | material_received | BR-SCO-18 |
| material_issued / material_received | close | closed | BR-SCO-19 |
| draft / pending_approval / approved (nothing issued) | cancel | cancelled | BR-SCO-20 |

`rejected`, `closed`, `cancelled` are final. `require_more_info` is never left on an SCO (BR-APR-42).

## Rules

| ID | Rule | Example (given → then) |
|---|---|---|
| BR-SCO-01 | Create saves header and lines in one go as `draft`, `createdBy` = me, number `SCO-<period>-<seq>`, never reused. Vendor must be an active supplier of type `service_provider` or `both`, with at least one line. | vendor type raw_material → 400; no lines → 400 |
| BR-SCO-02 | Each line has a raw item and a finished item (both active, and different), a service from the vendor's active service list (price and GST % copied from it, editable in draft), send qty > 0 and return qty > 0; pieces are whole numbers. Ratio = send qty ÷ return qty. | HSG-RC → HSG-RC → 400; 10.5 pcs → 400; service not on Sai CNC's list → 400 |
| BR-SCO-03 | Expected return date is required, not before today and not more than 365 days away. | 400 days away → 400 |
| BR-SCO-04 | SCO value = Σ service price × return qty, without GST; GST is shown per line. Approval is matched on this value, category `subcontracting` (approval-policies BR-APR-21). | L1 1000 × 2,500 → value ₹25,000, GST ₹4,500 shown |
| BR-SCO-05 | Header and lines change only in `draft` (else 409); status changes only through actions, never through edit (400). | approved SCO, change price → 409 |
| BR-SCO-06 | Submit, approve, reject, send back and withdraw follow `approval.md`; only its creator submits. Rejected is final: raise a new SCO. | SCO sent back → draft, editable |
| BR-SCO-07 | A challan can be made only on an `approved` or `material_issued` SCO, for qty > 0 per line and at most send qty − already issued. Main store must hold the qty (BR-GRN-33). | L1 issued 600, challan for 500 → 400; store has 300 → 409 |
| BR-SCO-08 | Each challan line posts two ledger rows (`sco_issue`): main store −qty and the vendor's location +qty, at the item's current average cost, heat number copied. Item total stock and average do not change. The vendor's location is created on first use. | 600 pcs out → store −600, "Sai CNC (job work)" +600, both @ 12,000; item stock unchanged |
| BR-SCO-09 | Challan number `JWC/<FY>/<seq>`: consecutive per financial year, max 16 characters, never reused. The printed challan carries the Rule 55 fields: date, number, our and vendor's name, address and GSTIN, item, HSN, qty, value at issue cost, "sent for job work u/s 143, no tax charged". | 1 Apr 2027 → JWC/27-28/1 |
| BR-SCO-10 | An e-way bill number must be entered before the challan is saved when the vendor is in another state (GSTIN state code differs from ours) or the challan value is ≥ ₹50,000. | inter-state, value ₹8,000, no EWB → 400 |
| BR-SCO-11 | Each challan's return due date = challan date + 1 year. Open challans show days left; ≤ 60 days = warning, past due = "overdue: deemed supply, tell accounts". Nothing is blocked (Q5). | challan 1 Oct 2026, today 15 Aug 2027 → 47 days left, warning |
| BR-SCO-12 | A receipt can be made only on a `material_issued` SCO and needs the vendor's challan/invoice number, unique per vendor (409 if repeated). Per line: processed qty and unprocessed qty; (processed × ratio) + unprocessed ≤ qty still at the vendor for that line. | 600 at vendor, return 700 processed → 400 |
| BR-SCO-13 | Each processed line gets one QA decision: accepted + rejected = processed. A second decision → 409; two at once post only once. | 500 back: 480 + 20 → ok; 480 + 10 → 400 |
| BR-SCO-14 | On QA decision, accepted qty posts (`sco_receipt`): raw item −(accepted × ratio) from the vendor location at the line's issue cost, and finished item +accepted into main store at cost = ratio × issue cost + service price (no GST). Finished item average moves per BR-GRN-38. | 480 accepted → HSG-RC −480 @ 12,000 at vendor; HSG-MC +480 @ 14,500 |
| BR-SCO-15 | Rejected qty moves the raw item from the vendor location to the scrap yard at issue cost (`sco_receipt`); no service charge is due for it (Q2). | 20 rejected → vendor −20, scrap yard +20 HSG-RC @ 12,000 |
| BR-SCO-16 | Unprocessed qty moves the raw item from the vendor location back to main store at issue cost when the receipt is saved (`sco_receipt`); no QA, no charge. | vendor returns 100 unmachined → store +100 HSG-RC |
| BR-SCO-17 | Every receipt settles the oldest open challan of that line first and records which challans and qty it settled. A challan is settled when all its qty is settled. | challans 600 (Oct) + 400 (Nov), 700 back → Oct settled, Nov 100 settled |
| BR-SCO-18 | The SCO becomes `material_received` when every line is fully issued and nothing is left at the vendor. | 1000 issued, 980 accepted + 20 rejected → material_received |
| BR-SCO-19 | Close needs `sco.close` and a reason if anything is left at the vendor; that qty is written off as process loss from the vendor location at issue cost (ledger reference `sco_loss`, BR-GRN-43). Loss above 2% of a line's issued qty needs `sco.loss_override` (Q3). Un-issued qty is dropped. | 1000 issued, 990 back, close → loss 10 (1%), ok for bo; loss 50 (5%) by bo → 403 |
| BR-SCO-20 | Cancel only while nothing is issued, from draft, pending_approval or approved; reason always needed, 3–500 chars, draft included (PO Q3=A); an open approval request is cancelled too (BR-APR-48). After a challan → 409. | approved, no challan, reason "vendor down" → cancelled |
| BR-SCO-21 | SCOs, challans and receipts are never deleted; a mistake after posting is fixed by a receipt, a close or (later) a correction, never by edit. | delete a posted challan → 400 |
| BR-SCO-22 | The SCO shows job-work charge due = Σ accepted × service price, plus GST at the line %, for checking the vendor's bill. No bill is posted in v1. | 980 accepted → ₹24,500 + ₹4,410 GST |
| BR-SCO-23 | Every action needs its key from "Who can do what"; otherwise 403 and nothing changes. | fs closes SCO → 403; qa makes a challan → 403 |
| BR-SCO-24 | Challan, receipt, QA decision and close each save everything in one go (ledger rows, SCO lines, status, challan settlement) and lock the SCO first; the loser of a race gets 409, nothing half-written. | two challans for the last 400 at once → one 200, one 409 |
| BR-SCO-25 | Every posting stores who, when, reason (if any) and the heat number, so a finished part traces back to its challan and casting batch. | HSG-MC receipt row → challan JWC/26-27/4, heat H-231 |

## Not now

- Creating SCOs from approved subcontracting PRs or from BOM explosion (M4) (Q1).
- Sending dies, moulds or tools out (capital goods); vendor-to-vendor transfer (plating after CNC).
- Rework loop for rejected pieces; returning chips/swarf; scrap sold by the vendor.
- Vendor bill posting and 3-way match; debit notes for vendor-caused rejects.
- ITC-04 export (the challan and settlement data is kept for it); e-way bill generation (number only).
- QA bypass on receipts; correction of a posted challan or receipt; SCO amendment after approval.

## Questions for you

| # | Question | Options | Answer |
|---|---|---|---|
| Q1 | Where does an SCO start in v1? | **A** Back office creates it directly; subcontracting PRs keep going to a PO (recommended) / B Only from an approved subcontracting PR | |
| Q2 | Processed pieces that fail our QA? (BR-SCO-15) | **A** Scrap yard, no charge to pay (recommended) / B Scrap yard, charge still paid / C Back to vendor for free rework | |
| Q3 | Loss allowed at close without owner? (BR-SCO-19) | **A** 2% (recommended) / B 0%, every loss needs owner / C 5% | |
| Q4 | Can one SCO go out in several lots? (BR-SCO-07, 17) | **A** Yes, many challans and receipts (recommended) / B One challan per SCO | |
| Q5 | Challan past its 1-year due date? (BR-SCO-11) | **A** Warn and list for accounts only (recommended) / B Also block new challans to that vendor | |
| Q6 | QA on returned goods? (BR-SCO-13) | **A** Every processed line needs a QA decision (recommended) / B Stores may accept plating/heat treatment directly | |
| Q7 | Vendors without GSTIN (unregistered job workers)? | **A** Allowed, e-way bill always by us (recommended) / B GST-registered vendors only | |

## Changelog

- 2026-09-29 v0 — draft from schema (no SCO code yet) + ERPNext/Odoo/SAP benchmark + CGST Sec 143, Rule 55.
- 2026-09-29 — consistency pass: `sco.*` keys live in auth-setup, seed none until M2 (who-table = M2 seed); `sco_loss` reference type (BR-SCO-19); BR-SCO-15, 16 name `sco_receipt`; BR-SCO-20 reason always (PO Q3=A).
