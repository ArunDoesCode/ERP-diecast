# Report 05 — frontend-dev — GRN + stock screens
tsc + lint clean (0 new warnings). 11 files, ~370 lines added. No tests touched, nothing committed.

## Screens touched
| URL | Roles to test | Changes |
|---|---|---|
| `/grn` (PO -> Receive goods modal, CreateGrnModal) | back_office, floor_supervisor | Challan no required (button disabled until filled); no received-date field; per-line Batch/heat no; qty accepts decimals (whole only for pcs/set, step=1) |
| `/grn/[grnId]` Edit modal (draft only) | back_office, floor_supervisor | Challan no required, cannot be blanked; per-line batch/heat no editable; decimal qty (server enforces pcs whole -> toast) |
| `/grn/[grnId]` lines table | back_office, owner, qa_inspector, floor_supervisor | New "Net accepted" column (+ "n corrected"); batch/heat, bypass reason, over-receipt excess + reason shown under item |
| Decide modal (qa_inspector, back_office, owner) | | Decision dropdown removed; Accepted + Rejected qty (must sum to arrived, inline error); batch/heat; certificate URL; remarks; override reason shown only past 105% of ordered and only for owner/back_office/super-admin (others see a "cannot override" note) |
| Bypass dialog (back_office, owner; NOT floor_supervisor) | | Reason required; optional accepted qty (rest shown as "will be recorded as rejected"); batch/heat; override reason as above. Bypass button hidden for floor_supervisor |
| Correct dialog (back_office, owner) | | Shows max correctable (net accepted); reason label linked |
| `/inventory/movements` Create movement (back_office, owner, super-admin) | | Only "Stock-take" (default) / "Opening stock"; transaction type + reference id removed; Reason required (replaces notes); cost required for stock-in (qty > 0), not sent for stock-out; list/detail labels for new ref types |
| `/inventory/items` create/edit | back_office, super-admin | Current stock + average cost inputs removed from create; read-only text in edit; neither sent |

## Files
types/grn.ts, types/asset.ts, lib/grn-permissions.ts (`// perm:` added; `canBypassGrnQa` drops floor_supervisor; `isExemptFromOverReceiptGuard` renamed `canOverrideOverReceipt`, now includes super-admin), GrnQaDecisionModal, GrnBypassAlert, GrnCorrectionAlert, GrnLinesTable, CreateGrnModal, EditGrnModal, InventoryMovementsManager, InventoryItemsManager.
Fetchers/queries unchanged (error toasts for 400/403/409 already exist via `ApiClientError` message).

## Map updates
- Query keys: none new. Routes: none new.
- Trap: GRN detail line has no UOM, so the pcs/set whole-number hint only works on the create modal (PO item has uom); edit modal and decide modal rely on the server 400 toast.
- Trap: over-receipt check on the client compares accepted qty to 105% of ordered only. It does not know earlier receipts on the PO line, so the server can still ask for an override reason (400 toast) in cases the modal did not flag.
- Trap: correction dialog does not invalidate the PO detail (no poId there); only GRN detail.

## Not done / notes
- Reconciliation screen: skipped as briefed.
- Movement detail dialog still titled "Edit movement" (pre-existing).
