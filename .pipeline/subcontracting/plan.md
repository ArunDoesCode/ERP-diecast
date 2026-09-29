# Plan — subcontracting (spec v2, frozen)

Baseline: green (1155 backend tests). Env/run notes: `ENV.md`. Explorer: `reports/02-explorer.md`.
Decisions taken: plant details → new `company_settings` table; `hsn_code` on item; missing either → challan 400.

## Reuse
- Stock: `stockPostingRepository.postStock()` (`blockNegative`, `averageEffect` in/out_at_cost/none). Transfers = two rows, `averageEffect: "none"`. Main store via `grnRepository.findDefaultReceivingLocationId`. `sco_issue`/`sco_receipt`/`sco_loss` already in the enum.
- Numbering: `allocateDocumentSequence` for `SCO-<period>-<seq>`; **new** FY sequence for `JWC/<FY>/<seq>` (Apr–Mar, ≤16 chars).
- Approval: `approvalService.submitApprovalRequest` / `actOnApprovalRequest`; fix SCO branch (amount incl. GST, category `subcontracting`, `require_more_info` → `draft`, row lock on submit = BL-065).
- Pattern: copy PO stack (descriptor in `end-points.ts` → routes → controller → service → repository → `types/*.types.ts`), frontend page → view → pages-component.

## Slices (each: contract → tests red → backend ‖ frontend → commit)

| # | Slice | BRs | Backend | Frontend |
|---|---|---|---|---|
| S1 | Order + approval | 01–06, 20, 21, 23 | schema (SCO header/line columns, `serviceId`, approval level fields, `company_settings`, `item_master.hsn_code`, cancel/close fields); create/edit/get/list/submit/cancel; approval SCO fixes; company settings + item HSN endpoints | SCO list + create/edit + detail (status, approval, cancel); nav screen; company settings form (owner); HSN field on item form |
| S2 | Challan (issue) | 07–11, 24, 25 | `sco_challans` + lines; `JWC` FY numbering; EWB rules; two-row ledger posting; vendor location on first use; due date + days-left; print data | challan form, list per SCO, printable challan, days-left badges |
| S3 | Receipt + QA | 12–18, 22, 24 | `subcontracting_grns`/items extended (vendor challan no. unique per vendor, processed/unprocessed, QA actor/time); receipt + unprocessed return; QA decision posting (accepted/rejected); FIFO challan settlement table; `material_received`; charge due | receipt form, QA decision dialog, settlement view, charge due panel |
| S4 | Close + loss + reports | 19, 22 (full) + reports | close with/without loss (`sco.loss_override`, reason, `sco_loss` posting); reports: open challans, stock at vendor, SCO register, loss log | close dialog, 4 report screens |

Cross-cutting (every slice): `requireRole` key per action (BR-SCO-23), audit trail, SCO row lock before posting (BR-SCO-24), contract manifest regenerated, integer paise, whole-number pcs.
Scenario test after S4: create → approve → 2 challans → receipt → QA → close (+ loss variant), by test-writer.
Also closes: BL-065, SCO parts of BR-INV-05/10, BR-SUP-07 (BL-046 SCO half, BL-070).

## Ownership
backend-dev: `backend/**` non-test · frontend-dev: `frontend/**` non-test · test-writer: tests only · coordinator: `.pipeline/**`, `docs/**`.
