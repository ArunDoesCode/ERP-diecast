# Report 17 — frontend-dev — S3 screens
Status: DONE. tsc + lint clean. Not committed.

## Screens touched
| URL | Role | What |
|---|---|---|
| /subcontracting/[scoId] | `sco.view` (reads) | New Receipts card (list, View toggles lines + "Challans settled"), "At vendor and charge due" card (qty at vendor, pending QA, accepted, charge ex GST / GST / total), "Challan settlement" card (settled/qty per challan line, link to challan). Shown when status is material_issued / material_received / closed. `material_received` badge already existed. |
| same | `sco.issue_receive` | "Enter receipt" button (status material_issued only) -> dialog: vendor challan/invoice no., received date, notes, per line processed qty + unprocessed qty (max = at vendor). 400/409 messages shown inline + toast. |
| same | `sco.qa_decide` | "QA decision" button on receipt lines that are pending_qa -> dialog: accepted, rejected (sum must equal processed, checked client-side too), notes. |

## Map updates
- Types: Receipt, ReceiptLine, ReceiptSettlement, ScoChargeDue, ChallanSettlementRow in `types/subcontracting.ts`; ScoLine gets optional `qtyAtVendor`, `pendingQaQty`, `chargeDuePaise`, `chargeDueGstPaise`.
- Routes: `subcontracting.receipts(scoId)`, `receiptDetail(id)`, `receiptQa(id, lineId)`.
- Query keys: `scoKeys.receipts(scoId)`, `scoKeys.receiptDetail(id)`. Hooks: useScoReceiptsQuery, useReceiptDetailQuery, useCreateReceiptMutation, useDecideQaMutation.
- Components (pages/subcontracting): EnterReceiptDialog, QaDecisionDialog, ScoReceiptsCard, ScoSettlementCard.
- Traps: client-side max check uses ratio = send/return (processed x ratio + unprocessed <= at vendor); rounding for non-integer ratios is the backend's open question, server stays authoritative.
