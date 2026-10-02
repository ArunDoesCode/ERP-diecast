---
module: subcontracting
status: frozen           # draft | frozen | changed-after-freeze
version: 4
frozen_on: 2026-10-01
owner: Arun
depends_on: [auth-setup, approval, approval-policies, grn, grn-stock, suppliers, inventory]
---
# Subcontracting (job work to outside processors)

> Code, gaps, GST notes and the ERP benchmark: `docs/modules/subcontracting.md`.

## Summary

Back office raises a Subcontracting Order (SCO) to an outside processor (CNC, plating, heat treatment):
what we send (raw castings), the service and its price, and what comes back (the processed part).
After approval, stores send material out on a job-work challan (GST Sec 143, no tax charged), receive
processed goods back against it, QA accepts or rejects, and back office closes the SCO; only the owner
can write off a loss, with a reason.
Done on the floor = stock at each vendor always matches what is physically there, every challan is settled
within one year, and the processed part's cost = casting cost + job-work charge.

- Examples use: SCO-1 to vendor "Sai CNC", line L1: send 1000 pcs HSG-RC (raw casting, average 12,000
  paise), service "CNC machining" 2,500 paise/pc + 18% GST, get back 1000 pcs HSG-MC. Ratio 1:1.
- Reports: open challans with days left, stock at each vendor, SCO register, loss log.

## Who can do what

Keys and seed are in `auth-setup.md`; super-admin passes every check; other roles get keys in Setup.
Seed: ow owner, bo back_office.

| Action | Key | Seed roles |
|---|---|---|
| view SCOs, challans, receipts, vendor stock | `sco.view` | ow, bo, fs, qa |
| create / edit draft, submit, cancel | `sco.manage` | ow, bo |
| issue material (challan), enter receipt | `sco.issue_receive` | ow, bo, fs |
| QA accept / reject a receipt line | `sco.qa_decide` | ow, bo, qa |
| close SCO with nothing left at the vendor | `sco.close` | ow, bo |
| close SCO with any loss (write-off) | `sco.close` + `sco.loss_override` | ow |
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

Dates (v4): every "today", date, number period, financial year and days-left below is the plant's
calendar day in IST (Asia/Kolkata), the same on the server and in every date picker, whatever clock zone
the server or the browser runs in.

| ID | Rule | Example (given → then) |
|---|---|---|
| BR-SCO-01 | Back office creates the SCO directly (not from a PR); create saves header and lines in one go as `draft`, `createdBy` = me, number `SCO-<period>-<seq>`, never reused. Vendor must be an active supplier of type `service_provider` or `both`, with or without GSTIN; an inactive supplier can't get a new SCO (400, suppliers BR-SUP-07), but its open SCOs carry on. There must be at least one line. | vendor type raw_material → 400; inactive vendor → 400; no lines → 400 |
| BR-SCO-02 | Each line has a raw item and a finished item (both active, and different), a service from the vendor's active service list (price and GST % copied from it, editable in draft), send qty > 0 and return qty > 0; pieces are whole numbers. Ratio = send qty ÷ return qty. | HSG-RC → HSG-RC → 400; 10.5 pcs → 400; service not on Sai CNC's list → 400 |
| BR-SCO-03 | Expected return date is required, not before today and not more than 365 days away. 'Today' is the plant's calendar day in IST (Asia/Kolkata), the same on the server and in the date picker. | 400 days away → 400; at 02:00 IST on 1 Oct 2026: 1 Oct 2027 → ok, 30 Sep 2026 → 400 |
| BR-SCO-04 | SCO value = Σ service price × return qty, without GST; GST is shown per line. Approval is matched on value incl. GST, category `subcontracting`, same basis as a PO (approval-policies BR-APR-21, Q1=C). | L1 1000 × 2,500 → value ₹25,000, GST ₹4,500 shown; approval matched on ₹29,500 |
| BR-SCO-05 | Header and lines change only in `draft` (else 409); status changes only through actions, never through edit (400). | approved SCO, change price → 409 |
| BR-SCO-06 | Submit, approve, reject, send back and withdraw follow `approval.md`; only its creator submits. Rejected is final: raise a new SCO. | SCO sent back → draft, editable |
| BR-SCO-07 | An SCO may go out in several lots: a challan can be made on an `approved` or `material_issued` SCO, for qty > 0 per line and at most send qty − already issued. Main store must hold the qty (BR-GRN-33). | L1 issued 600, challan for 400 → ok; challan for 500 → 400; store has 300 → 409 |
| BR-SCO-08 | Each challan line posts two ledger rows (`sco_issue`): main store −qty and the vendor's location +qty, at the item's current average cost, heat number copied. Item total stock and average do not change. The vendor's location is created on first use. | 600 pcs out → store −600, "Sai CNC (job work)" +600, both @ 12,000; item stock unchanged |
| BR-SCO-09 | Challan number `JWC/<FY>/<seq>`: consecutive per financial year, max 16 characters, never reused. The printed challan carries the Rule 55 fields: date, number, our and vendor's name, address and GSTIN ("unregistered" if the vendor has none), item, HSN, qty, value at issue cost, "sent for job work u/s 143, no tax charged". Our name, address, GSTIN and state come from company settings (one row, owner edits it); HSN comes from the raw item's `hsn_code`. If either is missing the challan is refused (400) and nothing posts. Challan date can't be in the future (400); it defaults to today. 'Today' is the plant's calendar day in IST (Asia/Kolkata), the same on the server and in the date picker; the FY in the number comes from the challan date. | 1 Apr 2027 → JWC/27-28/1; vendor without GSTIN → prints "GSTIN: unregistered"; at 02:00 IST on 1 Oct: date 1 Oct → ok, 2 Oct → 400 |
| BR-SCO-10 | We always produce the e-way bill; its number must be entered before the challan is saved when the vendor is in another state (GSTIN state code differs from ours), the vendor has no GSTIN, or the challan value is ≥ ₹50,000. | inter-state, value ₹8,000, no EWB → 400; unregistered vendor, ₹5,000, no EWB → 400 |
| BR-SCO-11 | Each challan's return due date = challan date + 1 year. Open challans show days left = due date − today, in whole days, where 'today' is the plant's calendar day in IST (Asia/Kolkata), the same on the server and on screen; ≤ 60 days = warning, past due = "overdue: deemed supply, tell accounts". Nothing is blocked, new challans to that vendor included. | challan 1 Oct 2026, 02:00 IST on 15 Aug 2027 → 47 days left (not 48), warning; overdue challan, new challan to same vendor → ok |
| BR-SCO-12 | A receipt can be made only on a `material_issued` SCO and needs the vendor's challan/invoice number, unique per vendor (409 if repeated). Per line: processed qty and unprocessed qty; (processed × ratio) + unprocessed ≤ qty still at the vendor for that line. | 600 at vendor, return 700 processed → 400 |
| BR-SCO-13 | Every processed line needs one QA decision before it enters stock, whatever the service (plating and heat treatment too): accepted + rejected = processed. A second decision → 409; two at once post only once. | 500 back: 480 + 20 → ok; 480 + 10 → 400 |
| BR-SCO-14 | On QA decision, accepted qty posts (`sco_receipt`): raw item −(accepted × ratio) from the vendor location at the line's issue cost, and finished item +accepted into main store at cost = ratio × issue cost + service price (no GST). Finished item average moves per BR-GRN-38. | 480 accepted → HSG-RC −480 @ 12,000 at vendor; HSG-MC +480 @ 14,500 |
| BR-SCO-15 | Rejected qty moves the raw item from the vendor location to the scrap yard at issue cost (`sco_receipt`); no service charge is due for it. | 20 rejected → vendor −20, scrap yard +20 HSG-RC @ 12,000; charge due excludes the 20 |
| BR-SCO-16 | Unprocessed qty moves the raw item from the vendor location back to main store at issue cost when the receipt is saved (`sco_receipt`); no QA, no charge. | vendor returns 100 unmachined → store +100 HSG-RC |
| BR-SCO-17 | Every receipt settles the oldest open challan of that line first and records which challans and qty it settled. A challan is settled when all its qty is settled. | challans 600 (Oct) + 400 (Nov), 700 back → Oct settled, Nov 100 settled |
| BR-SCO-18 | The SCO becomes `material_received` when every line is fully issued and nothing is left at the vendor. | 1000 issued, 980 accepted + 20 rejected → material_received |
| BR-SCO-19 | Close needs `sco.close`. If anything is left at the vendor, close also needs `sco.loss_override` and a reason (3–500 chars); that qty is written off as process loss from the vendor location at issue cost (ledger reference `sco_loss`, BR-GRN-43). No loss is allowed without the owner. Un-issued qty is dropped. | 1000 issued, 1000 back, bo closes → closed; 990 back, bo closes → 403; ow closes, no reason → 400; ow, reason "chips lost in machining" → 10 written off, closed |
| BR-SCO-20 | Cancel only while nothing is issued, from draft, pending_approval or approved; reason always needed, 3–500 chars, draft included; an open approval request is cancelled too (BR-APR-48). After a challan → 409. | approved, no challan, reason "vendor down" → cancelled |
| BR-SCO-21 | SCOs, challans and receipts are never deleted; a mistake after posting is fixed by a receipt, a close or (later) a correction, never by edit. | delete a posted challan → 400 |
| BR-SCO-22 | The SCO shows job-work charge due = Σ accepted × service price, plus GST at the line %, for checking the vendor's bill. No bill is posted in v1. | 980 accepted → ₹24,500 + ₹4,410 GST |
| BR-SCO-23 | Every action needs its key from "Who can do what"; otherwise 403 and nothing changes. | fs closes SCO → 403; qa makes a challan → 403 |
| BR-SCO-24 | Challan, receipt, QA decision and close each save everything in one go (ledger rows, SCO lines, status, challan settlement) and lock the SCO first; the loser of a race gets 409, nothing half-written. | two challans for the last 400 at once → one 200, one 409 |
| BR-SCO-25 | Every posting stores who, when, reason (if any) and the heat number, so a finished part traces back to its challan and casting batch. | HSG-MC receipt row → challan JWC/26-27/4, heat H-231 |

### Acceptance — IST day (v4, BL-079)

- Given it is 02:00 IST on 1 Oct 2026, when a challan is saved with date 1 Oct 2026, then it is accepted (200).
- Given it is 02:00 IST on 1 Oct 2026, when a challan is saved with date 2 Oct 2026, then 400 `SCO_CHALLAN_DATE_FUTURE`, nothing posts.
- Given it is 02:00 IST on 1 Oct 2026, when the challan date is left empty, then it is 1 Oct 2026 and the number is JWC/26-27/…
- Given it is 00:30 IST on 1 Apr 2027, when a challan is saved with date 1 Apr 2027, then it is accepted and numbered JWC/27-28/….
- Given it is 02:00 IST on 1 Oct 2026, when an SCO is saved with expected return 30 Sep 2026, then 400; with 1 Oct 2027, then accepted.
- Given challan dated 1 Oct 2026 and it is 02:00 IST on 15 Aug 2027, when open challans are listed, then days left = 47, warning.
- Given it is 02:00 IST, when the challan or SCO date picker opens, then its max (challan) / min (expected return) is today's IST date, whatever the browser zone.

## Not now

- Creating SCOs from approved subcontracting PRs or from BOM explosion (M4); subcontracting PRs go to a PO.
- Sending dies, moulds or tools out (capital goods); vendor-to-vendor transfer (plating after CNC).
- Rework loop for rejected pieces; returning chips/swarf; scrap sold by the vendor.
- Vendor bill posting and 3-way match; debit notes for vendor-caused rejects.
- ITC-04 export (the challan and settlement data is kept for it); e-way bill generation (number only).
- Blocking new challans when a challan is overdue.
- QA bypass on receipts; correction of a posted challan or receipt; SCO amendment after approval.

## Questions for you

None open.

## Implementation status

| BR | Status | Test file | Enforced at |
|---|---|---|---|
| BR-SCO-01..06, 20, 21, 23 | done | sco.test.ts | scoService, approvalService |
| BR-SCO-07..11, 24, 25 | done | scoChallan.test.ts | scoChallanService |
| BR-SCO-12..18, 22 | done | scoReceipt.test.ts, scoReceiptCost.test.ts | scoReceiptService, sco-math |
| BR-SCO-19, 22–25 | done | scoClose.test.ts | scoService.close, scoReportService |
| BR-SCO-03, 09, 11 (v4 IST day) | done (IST day, 2026-10-01) | scoIstDay.test.ts, scoChallan.test.ts | scoService, scoChallanService, lib/ist-day.ts, SCO + challan date pickers, lib/ist-date.ts |

## Changelog

- 2026-09-29 v0 — draft from schema (no SCO code yet) + ERPNext/Odoo/SAP benchmark + CGST Sec 143, Rule 55.
- 2026-09-29 — consistency pass: `sco.*` keys live in auth-setup, seed none until M2 (who-table = M2 seed); `sco_loss` reference type (BR-SCO-19); BR-SCO-15, 16 name `sco_receipt`; BR-SCO-20 reason always (PO Q3=A).
- 2026-09-29 — final answers folded: Q1 direct SCO only (BR-SCO-01); Q2 rejects to scrap, no charge (BR-SCO-15); Q3 every loss needs owner + reason, no 2% tolerance (BR-SCO-19, who-table); Q4 many lots (BR-SCO-07); Q5 warn only (BR-SCO-11); Q6 QA on every line (BR-SCO-13); Q7 unregistered vendors allowed, EWB always by us (BR-SCO-01, 09, 10).
- 2026-09-29 — pre-freeze touch-up: BR-SCO-04 approval matched incl. GST (approval-policies Q1=C). BR-SCO-01 inactive supplier → 400 (BR-SUP-07). `sco.*` seeded now with the build: ow + bo, `sco.loss_override` ow only (who-table, auth-setup). No "(assumed)" left (BR-SCO-10 firm).
- 2026-09-29 — frozen v1 (all questions answered by Arun)
- 2026-09-29 — v2 clarified during build (Arun): plant details live in a new one-row `company_settings` table; `hsn_code` added to item master; missing plant details or HSN → challan 400 (BR-SCO-09). No other rule changed.
- 2026-09-29 — clarified during build (S2): challan date is optional (default today); per-line heat number optional (default = the SCO line heat/batch). No rule changed.
- 2026-09-29 — clarified during build (S2): BR-SCO-07 vs BR-SCO-24 — qty over what is left when the request arrives → 400; qty that was valid on arrival but lost a race (over after the SCO lock) → 409. Ledger `sco_issue` rows reference the challan (challan id), SCO id kept on the row context.
- 2026-09-29 — clarified during build (S3, Arun: "do what other ERPs do"): when send ÷ return is not whole, raw pieces used are proportional to the cumulative processed qty, rounded half up to whole pieces, minus what was already used (ERPNext/Odoo/SAP backflush style; no drift, fully returned = fully used). BR-SCO-12 and 14 use this for "processed × ratio".
- 2026-09-29 — clarified during build (S4): close while any receipt line is still pending QA → 409 "decide QA first"; nothing is written off until every processed line has a QA decision (BR-SCO-19).
- 2026-09-29 — clarified during build (S4, supersedes the S3 note): BR-SCO-18 — status becomes `material_received` once every line is fully issued and every issued piece is covered by a receipt (unprocessed or processed), even if QA on it is still pending; close still waits for QA (409, BR-SCO-19).
- 2026-09-29 — v3 (Arun, BL-072): challan date can't be in the future → 400 (BR-SCO-09); back-dating stays open. No other rule changed.
- 2026-10-01 — v4 change request (BL-079, #63): every SCO "today" / days-left = plant calendar day in IST (Asia/Kolkata), same on server and date picker (BR-SCO-03, 09, 11; dates note above Rules; FY and number period follow it). Fixes 00:00–05:30 IST mismatch. No other rule changed. Awaiting re-freeze.
- 2026-10-01 — v4 frozen (Arun): IST-day rules as above; no open questions.
