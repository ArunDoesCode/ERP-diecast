# Subcontracting — manual UI test checklist

Spec: `docs/specs/subcontracting.md` v3.

## Setup once
In `backend/`: `bun run db:reset`, then `bun run seed` (seed refuses to run twice; reset again to start over).
Logins: `<role>@diecast.local`, password = `SEED_USER_PASSWORD`. Short names used below:
ow = owner, bo = back_office, fs = floor_supervisor, qa = qa_inspector, admin = admin.

Seed data (all via the real services):
- Vendor **Precision Machining Works** (service_provider, GSTIN state 27). Service **CNC Machining (job work)**, 5,000 paise (Rs 50)/pc, GST 18%.
- Raw item **RC-HOUSING** "Pump Housing Raw Casting", finished item **FG-HOUSING** "Pump Housing Machined", both HSN 7616.
- Company details filled ("DiecastOS Demo Plant", GSTIN state 27). Other supplier "Sharma Die Castings" is raw_material only.
- Stock: 500 RC-HOUSING received, about 250 left in main store after the seeded SCOs. Cost Rs 250/pc.

### What the seed already covers (no need to create these)
| Seeded SCO | Use it for |
|---|---|
| 1 draft, 50 pcs | A edit draft; B cancel from draft |
| 2 pending approval, 60 pcs | B approval history, cancel from pending (request cancelled too) |
| 3 approved, 80 pcs, nothing issued | D issue in two lots; F settling two challans; H loss close |
| 4 material issued (200 sent 150), receipt PMW-1001 of 50 waiting for QA | B cancel refused after challan; E print + open challans; F receipt; G QA decision |
| 5 closed (100 sent, 95 accepted, 5 rejected) | G charge due card; H closed = no actions; I reports; J traceability |

Anything below that says "new" needs you to create it. All seeded SCOs are under Rs 20,000, so only fs approves them.

## A. Create and edit SCO (BR-SCO-01..05)
Login bo. URL `/subcontracting/new`.
- [ ] Golden: pick Precision Machining Works, return date +30 days, one line (RC-HOUSING to FG-HOUSING, service CNC Machining, send 100, return 100). Live totals: value 5,000, GST 900. Save. Opens as draft, number `SCO-<period>-<seq>`. Call this SCO "new1".
- [ ] Vendor list shows only active service_provider/both suppliers: Sharma Die Castings is not selectable.
- [ ] Negative: RC-HOUSING as both raw and finished, save refused.
- [ ] Negative: 10.5 pcs refused (whole pieces only).
- [ ] Negative: a service not on the vendor's list is not selectable / refused.
- [ ] Negative: return date yesterday, date 400 days away, empty date: all refused.
- [ ] Negative: no lines refused.
- [ ] Draft: open seeded SCO 1 (50 pcs), Edit at `/subcontracting/[scoId]/edit`. Vendor is read-only; change price and save, works.
- [ ] Negative: on a submitted/approved SCO (seeded 2, 3) Edit is not offered; direct edit URL or change attempt is refused (409).
- [ ] Wrong role: login fs, `/subcontracting/new` and "New SCO" button not available.

## B. Submit, approval, cancel (BR-SCO-04, 06, 20)
- [ ] bo (creator) sees Submit on new1; submit moves to pending_approval. Approval request value includes GST: 5,900 (100 x Rs 50 + GST).
- [ ] Wrong user: ow (not creator) does not see Submit on a draft made by bo.
- [ ] Seeded SCO 2: approval level and history show (waiting for fs). Login fs, find it in Approvals.
- [ ] fs sends new1 back: SCO returns to draft and is editable. bo submits again, fs rejects: SCO rejected, final, no actions offered.
- [ ] Two-level chain: login ow, create "big" SCO, 500 pcs, same vendor/items (value 25,000, GST 4,500, approval value 29,500). ow submits. Level 1 = fs approves, level 2 = bo approves. SCO becomes approved. Keep it for D.
- [ ] Cancel seeded SCO 1 (draft) with reason "vendor down": cancelled. Reason required even for draft; 2-char and 501-char reasons refused.
- [ ] Cancel seeded SCO 2 (pending_approval): cancelled, its open approval request is cancelled too.
- [ ] Cancel from approved: create new 10-pc SCO, submit, fs approves, cancel with reason. Cancelled.
- [ ] Negative: seeded SCO 4 (challan exists): Cancel refused (409) or not offered.
- [ ] Wrong role: fs/qa do not see Cancel.

## C. Company settings and HSN (BR-SCO-09)
- [ ] ow: `/subcontracting/settings` shows the seeded details. Change address, save; value persists after reload. Put it back.
- [ ] bo/fs: Company details link not shown; direct URL refused.
- [ ] `/inventory` item edit dialog (asset.manage, login admin): HSN field present in edit mode only; RC-HOUSING shows 7616.

## D. Issue material / challan (BR-SCO-07..11, 23, 24)
Login fs (or bo), seeded SCO 3 (approved, 80 pcs), `/subcontracting/[scoId]`.
- [ ] "Issue material" shows only on approved/material_issued SCOs (not on draft, closed).
- [ ] Golden: issue 50, heat number prefilled HEAT-2401 from the line. Challan saved as `JWC/<FY>/<seq>`; SCO becomes material_issued; Issued column 50; Challans card lists it with return due = date + 1 year.
- [ ] Inventory: main store RC-HOUSING -50, "Precision Machining Works (job work)" +50; item total stock unchanged.
- [ ] Negative: try 40 when only 30 left: refused with message (400).
- [ ] Second lot of 30 works. Then Issue material offers nothing more (all issued).
- [ ] Negative: on the "big" SCO (500 pcs) issue 300 when store holds about 170: refused (409). No stock moved.
- [ ] Negative: qty 0 or 10.5 refused.
- [ ] E-way bill, inter-state: edit vendor GSTIN in Suppliers to start with 29, issue a small lot on seeded SCO 4 (50 left): refused without e-way bill number, accepted with one. Put GSTIN back after.
- [ ] Same for a vendor with no GSTIN (clear it, issue, then restore).
- [ ] Value 50,000 or more, same-state vendor: 200 pcs x Rs 250 = Rs 50,000 needs e-way bill. Store will not hold 200 by now, so top up RC-HOUSING by a GRN first (new), or skip and rely on the automated test.
- [ ] Negative: ow clears company details (or admin clears RC-HOUSING HSN), then issue: refused (400), no stock moved. Restore afterwards (HSN 7616).
- [ ] Challan number: no number is repeated; first challan after 1 April starts a new FY sequence (check from data if possible).
- [ ] Wrong role: qa has no "Issue material" button.
- [ ] Two browsers issue the last lot at the same time (new SCO, small qty): one succeeds, other gets error; stock moved once.

## E. Challan print and open challans (BR-SCO-09, 11)
- [ ] Seeded SCO 4's challan (150): `/subcontracting/challans/[challanId]` shows date, number, our name/address/GSTIN, vendor name/address/GSTIN, RC-HOUSING, HSN 7616, qty 150, value at issue cost (Rs 37,500), text "sent for job work u/s 143, no tax charged". Print button opens print view.
- [ ] Vendor without GSTIN prints "GSTIN: unregistered" (clear GSTIN temporarily, reload, restore).
- [ ] `/subcontracting/challans`: seeded SCO 4 challan listed, about 365 days left, on track. Seeded SCO 5's challan (fully settled) is not listed. Sorted by due date; filters all / due within 60 days / overdue / on track work.
- [ ] Warning and overdue states: if the form lets you back-date a challan (new), a challan with 60 days or fewer left shows warning; past due shows "deemed supply, tell accounts". Otherwise check from data.
- [ ] Overdue challan does not block a new challan to the same vendor.
- [ ] Wrong role: user without `sco.view` cannot open the pages.

## F. Receipt (BR-SCO-12, 16, 17, 23)
Login fs/bo.
- [ ] Golden (seeded SCO 4, material_issued): "Enter receipt", vendor no. "PMW-1003", processed 40, unprocessed 10. Saved. Receipt card lists it next to seeded PMW-1001.
- [ ] Inventory: unprocessed 10 back in main store RC-HOUSING at Rs 250. No QA needed for those.
- [ ] Negative: vendor no. PMW-1001 again on this vendor: refused (409).
- [ ] Negative: processed 500 when far less is at the vendor: refused (400).
- [ ] Negative: missing vendor invoice number refused.
- [ ] Two-challan settle (seeded SCO 3, lots 50 and 30 from D): receipt "PMW-2001", processed 70, unprocessed 0. "Challans settled" shows oldest challan (50) settled first, second shows 20 settled.
- [ ] "Enter receipt" not shown on approved (the big SCO), closed (seeded 5), or cancelled SCO.
- [ ] Wrong role: qa does not see "Enter receipt".

## G. QA decision (BR-SCO-13..15, 22, 23)
Login qa (or bo).
- [ ] Golden: seeded SCO 4, receipt PMW-1001 (50 processed): accepted 48 + rejected 2. Line marked decided.
- [ ] Inventory: RC-HOUSING -48 at vendor; FG-HOUSING +48 in main store at Rs 300 each (250 + 50); RC-HOUSING +2 in scrap yard at Rs 250; vendor -2.
- [ ] Charge due card on SCO 4: 48 x Rs 50 = Rs 2,400, GST 18% added (Rs 432); the 2 rejected excluded.
- [ ] Seeded SCO 5 charge due: 95 x Rs 50 = Rs 4,750, GST Rs 855; 5 rejected excluded. Its line shows decided, note "5 pcs porous after machining".
- [ ] Negative: accepted 47 + rejected 2 (not equal to 50): refused, also blocked in dialog.
- [ ] Negative: second decision on the same line (PMW-1001 now, or seeded SCO 5): refused (409); button gone.
- [ ] Decide the PMW-2001 line (SCO 3): accepted 70, rejected 0. Needed for H.
- [ ] Decide PMW-1003 (SCO 4): every processed line needs QA. Accept 40.
- [ ] Two users decide the same line at once: stock posts once.
- [ ] Wrong role: fs does not see "QA decision".

## H. material_received and Close (BR-SCO-18, 19, 20, 24)
- [ ] Full cycle, new 10-pc SCO (bo creates, submit, fs approves): issue 10, receipt processed 10. Status becomes material_received even though QA is pending.
- [ ] Close on it now: refused with "decide QA first" (409), nothing written off.
- [ ] QA: accepted 9 + rejected 1. Status stays material_received.
- [ ] Golden (nothing left at vendor): bo closes from Close order dialog, no reason needed, SCO closed, closed date shown.
- [ ] Loss: seeded SCO 3 now has 80 issued, 70 back, 10 left at vendor. bo: dialog shows note that owner must close, confirm disabled (direct call gives 403).
- [ ] ow: reason required; empty or 2 chars refused; "chips lost in machining" accepted. 10 RC-HOUSING written off from vendor location at Rs 250; status closed; reason shown in summary.
- [ ] Un-issued qty is dropped on close (seeded SCO 4 still has 50 to issue: close it as ow, reason needed, 100 left at vendor written off if any).
- [ ] Seeded SCO 5 (closed): no Issue, Receipt, Cancel or Close actions; closed date shown.
- [ ] Wrong role: fs/qa do not see Close.

## I. Reports (BR-SCO-11, 19, 22)
`/subcontracting/reports`, login any `sco.view` role.
- [ ] Stock at vendors: Precision Machining Works RC-HOUSING matches physical after steps D to H; vendor filter, sort, pagination work.
- [ ] SCO register: lists the five seeded SCOs plus your new ones; status, vendor, created from/to filters, sort, pagination; row links to SCO.
- [ ] Loss log: shows the written-off 10 from SCO 3 with reason, vendor, date; links to SCO; filters work.
- [ ] Link to Open challans works. `/subcontracting` shows Open challans and Reports buttons.
- [ ] User without `sco.view`: page and sidebar entry not available.

## J. Nothing is deleted, traceability (BR-SCO-21, 25)
- [ ] No delete option for SCO, challan or receipt anywhere in the UI.
- [ ] Inventory ledger for seeded SCO 5's FG-HOUSING receipt row (95) shows the challan number and heat number HEAT-2401; each posting shows who and when.
- [ ] Ledger rows for the 5 rejected (SCO 5) and the written-off 10 (SCO 3) show the reason where given.
