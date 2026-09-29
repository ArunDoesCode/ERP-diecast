# Subcontracting — manual UI test checklist

Spec: `docs/specs/subcontracting.md` v2. Roles (seed): ow = owner, bo = back office, fs = floor/stores, qa = QA.
Setup once: vendor "Sai CNC" (active, type service_provider or both, one active service "CNC machining" 2,500 paise/pc, 18% GST); raw item HSG-RC with HSN code and 1000+ pcs in main store; finished item HSG-MC; company details filled in.

## A. Create and edit SCO (BR-SCO-01..05)
Login bo. URL `/subcontracting/new`.
- [ ] Golden: pick Sai CNC, return date +30 days, one line (HSG-RC to HSG-MC, service CNC machining, send 1000, return 1000). Live totals: value 25,000, GST 4,500. Save. SCO opens as draft, number `SCO-<period>-<seq>`.
- [ ] Vendor list shows only active service_provider/both suppliers (raw_material or inactive vendor not selectable).
- [ ] Negative: same item as raw and finished, save is refused.
- [ ] Negative: 10.5 pcs is refused (whole pieces only).
- [ ] Negative: service not on the vendor's list is not selectable / refused.
- [ ] Negative: return date yesterday, and date 400 days away, both refused. Empty date refused.
- [ ] Negative: no lines refused.
- [ ] Draft: Edit at `/subcontracting/[scoId]/edit`; vendor is read-only; change price and save, works.
- [ ] Negative: after submit/approval, Edit is not offered; direct URL of edit or change attempt is refused (409).
- [ ] Wrong role: login fs, `/subcontracting/new` and "New SCO" button not available.

## B. Submit, approval, cancel (BR-SCO-04, 06, 20)
- [ ] bo (creator) sees Submit on draft; submit moves to pending_approval (or approved if no policy needs approval). Approval level and history show.
- [ ] Approval value matches value incl. GST (29,500 for the example) in the approval request.
- [ ] Wrong user: a different user (not creator) does not see Submit.
- [ ] Approver sends back: SCO returns to draft and is editable. Approver rejects: SCO rejected, final, no actions offered.
- [ ] Cancel from draft with reason "vendor down": cancelled. Reason required even for draft; 2-char and 501-char reasons refused.
- [ ] Cancel from pending_approval: open approval request is also cancelled.
- [ ] Cancel from approved (nothing issued): cancelled.
- [ ] Negative: after a challan exists, Cancel is refused (409).
- [ ] Wrong role: fs/qa do not see Cancel.

## C. Company settings and HSN (BR-SCO-09)
- [ ] ow: `/subcontracting/settings`, fill name, address, GSTIN, state code, save; values persist after reload.
- [ ] bo/fs: Company details link not shown; direct URL refused.
- [ ] `/inventory` item edit dialog (asset.manage): HSN code field present in edit mode only; save HSN on HSG-RC.

## D. Issue material / challan (BR-SCO-07..11, 23, 24)
Login fs (or bo), approved SCO, `/subcontracting/[scoId]`.
- [ ] Golden: "Issue material" shows only on approved/material_issued. Issue 600, heat number prefilled from line batch. Challan saved as `JWC/<FY>/<seq>`; SCO becomes material_issued; Issued column 600; Challans card lists it with return due = date + 1 year.
- [ ] Inventory: main store HSG-RC -600, "Sai CNC (job work)" +600; item total stock unchanged.
- [ ] Second lot of 400 works. Then Issue material offers nothing more (all issued).
- [ ] Negative: try 500 when only 400 left: refused with message (400).
- [ ] Negative: qty larger than main store holds: refused (409).
- [ ] Negative: qty 0 or 10.5 refused.
- [ ] Negative: inter-state vendor (GSTIN state differs), value under 50,000, no e-way bill number: refused. Same for a vendor with no GSTIN. Same for challan value 50,000 or more with vendor in same state.
- [ ] With e-way bill number entered the above are accepted.
- [ ] Negative: clear company details (or item HSN) then issue: refused (400), no stock moved.
- [ ] Challan number: first challan after 1 April starts a new FY sequence (check from data if possible); no number is repeated.
- [ ] Wrong role: qa has no "Issue material" button.
- [ ] Two browsers issue the last 400 at the same time: one succeeds, other gets error; stock moved once.

## E. Challan print and open challans (BR-SCO-09, 11)
- [ ] `/subcontracting/challans/[challanId]`: shows date, number, our name/address/GSTIN, vendor name/address/GSTIN, item, HSN, qty, value at issue cost, text "sent for job work u/s 143, no tax charged". Print button opens print view.
- [ ] Vendor without GSTIN prints "GSTIN: unregistered".
- [ ] `/subcontracting/challans`: sorted by due date; filters all / due within 60 days / overdue / on track; days-left badge. 60 days or fewer = warning; overdue shows "deemed supply, tell accounts".
- [ ] Overdue challan does not block a new challan to the same vendor.
- [ ] Wrong role: user without `sco.view` cannot open the pages.

## F. Receipt (BR-SCO-12, 16, 17, 23)
Login fs/bo, SCO in material_issued, 600 at vendor.
- [ ] Golden: "Enter receipt", vendor challan/invoice no. "SAI-101", processed 500, unprocessed 100. Saved. Receipt card lists it; "Challans settled" shows oldest challan first.
- [ ] Inventory: unprocessed 100 back in main store HSG-RC at issue cost. No QA needed for those.
- [ ] Negative: same vendor invoice number again on this vendor: refused (409).
- [ ] Negative: processed 700 when 600 at vendor: refused (400).
- [ ] Negative: missing vendor invoice number refused.
- [ ] With two challans (600 Oct, 400 Nov) and 700 back: first challan settled, second shows 100 settled.
- [ ] "Enter receipt" not shown on approved (nothing issued), closed, or cancelled SCO.
- [ ] Wrong role: qa does not see "Enter receipt".

## G. QA decision (BR-SCO-13..15, 22, 23)
Login qa (or bo), receipt line pending QA.
- [ ] Golden: 500 processed, accepted 480 + rejected 20. Line marked decided.
- [ ] Inventory: HSG-RC -480 at vendor; HSG-MC +480 in main store at 14,500 each (12,000 + 2,500); HSG-RC +20 in scrap yard at 12,000; vendor -20.
- [ ] Charge due card: 480 accepted x 2,500 = 12,00,000 paise (Rs 12,000), GST 18% added; rejected 20 excluded.
- [ ] Negative: accepted 480 + rejected 10 (not equal to 500): refused, also blocked in dialog.
- [ ] Negative: second decision on the same line: refused (409); button gone.
- [ ] Two users decide the same line at once: stock posts once.
- [ ] Wrong role: fs does not see "QA decision".
- [ ] Every processed line needs QA (also a plating / heat-treatment service).

## H. material_received and Close (BR-SCO-18, 19, 20, 24)
- [ ] 1000 issued, 980 accepted + 20 rejected: status becomes material_received.
- [ ] Status becomes material_received once all pieces are covered by a receipt even if QA still pending; Close then refused with "decide QA first" (409), nothing written off.
- [ ] Golden (nothing left at vendor): bo closes from Close order dialog, no reason needed, SCO closed, closed date shown.
- [ ] Loss: 990 back, 10 left at vendor. bo: dialog shows note that owner must close, confirm disabled (direct call gives 403).
- [ ] ow: reason required; empty or 2 chars refused; "chips lost in machining" accepted. 10 written off from vendor location at issue cost; status closed; reason shown in summary; appears in Loss log.
- [ ] Un-issued qty is dropped on close.
- [ ] Closed SCO: no Issue, Receipt, Cancel or Close actions.
- [ ] Wrong role: fs/qa do not see Close.

## I. Reports (BR-SCO-11, 19, 22)
`/subcontracting/reports`, login any `sco.view` role.
- [ ] Stock at vendors: shows Sai CNC HSG-RC qty matching physical after steps D to H; vendor filter, sort, pagination work.
- [ ] SCO register: status, vendor, created from/to filters, sort, pagination; row links to SCO.
- [ ] Loss log: shows the written-off 10 with reason, vendor, date; links to SCO; filters work.
- [ ] Link to Open challans works. `/subcontracting` shows Open challans and Reports buttons.
- [ ] User without `sco.view`: page and sidebar entry not available.

## J. Nothing is deleted, traceability (BR-SCO-21, 25)
- [ ] No delete option for SCO, challan or receipt anywhere in the UI.
- [ ] Inventory ledger for HSG-MC receipt row shows challan number and heat number of the source casting; each posting shows who and when.
- [ ] Stock ledger for reject/loss rows show the reason where given.
