# Report 16 - backend-dev - S3 implement (receipt + QA)
BLOCKED on one test. scoReceipt.test.ts 55/56 pass; full suite 1313 pass / 1 fail; typecheck ok, lint 0 errors, contract:check ok. Not committed.

## Blocker (test contradicts itself)
`scoReceipt.test.ts:1076-1087` (BR-SCO-24 "two receipts at once for the last 400") expects `qtyAtVendor` = 400 after one receipt of 400 processed pieces is pending QA (400 issued, so 0 raw left un-reserved).
`scoReceipt.test.ts:652-657` (BR-SCO-12 qtyAtVendor) expects 300 after 600 issued, 250 processed + 50 unprocessed received (pending QA reduces it), and `:629-640` (BR-SCO-12 "even pending QA reduce what is still at the vendor") needs the same reservation.
No single formula gives 300 in the first case and 400 in the second. I implemented the reservation formula (issued - rawUsed(accepted+rejected+pending) - unprocessed - loss), which matches 652-657, 629-640 and BR-SCO-12 text. Spec BR-SCO-12/18 do not define `qtyAtVendor`; only the S3 contract does ("incl. pending QA reservation", ambiguous). Test-writer must fix line 1086 (expect 0), or the spec must say what qtyAtVendor means.

## Built
- `service/scoReceiptService.ts`: create, decideQa, listBySco, getDetails.
- `repository/scoReceiptRepository.ts`: receipt/line/settlement queries, FIFO open challan lines (row lock), counters, scrap yard, vendor location.
- `service/scoService.ts` getDetails: adds qtyAtVendor, chargeDue (per line and total), challanSettlements.
- `lib/sco-math.ts`: `rawUsedFor` (cumulative, round half up), `qtyAtVendor`, `nothingLeftAtVendor`.
- No schema change, no route/contract change (manifest unchanged, contract:check ok).

## Behaviour notes
- Numbering: `SCO-GRN-<yyyy-mm>-<seq>` from counter `sco_grn` (allocateDocumentSequence).
- Receipt: arrival checks give 400 (line not on SCO, qty over); after SCO lock the same checks give 409 (`SCO_RECEIPT_CONFLICT`). Repeated vendor challan no. = 409 `SCO_RECEIPT_CHALLAN_REPEATED` (pre-check + unique index caught).
- Settlement raw pieces = rawUsed(new cumulative processed) - rawUsed(old) + unprocessed; processed taken first from oldest challan, then unprocessed; one settlement row per challan line touched.
- Unprocessed return: one ledger pair per line (vendor out, main store in, `sco_receipt`, referenceId = receipt id, referenceLineId = receipt line id), cost = weighted issue cost of the challan lines it came from, heat of the first one.
- Line with processed = 0: stored as accepted with 0/0 (nothing for QA); receipt status derived from lines with processed > 0 (accepted if none).
- QA: raw used split = rawUsed(decided + accepted) - rawUsed(decided) for accepted, remainder for rejected. Issue cost = weighted average of the challan lines the receipt line settled. Finished cost = round(send x issueCost / return) + service price, average effect "in" (BR-GRN-38). Rejected: vendor out + scrap yard in (average untouched). Zero-qty rows are not posted.
- material_received checked after receipt and after QA: every line issued = send, no pending QA, nothing at vendor.

## Map updates
- New: `lib/sco-math.ts`; SCO receipt service/repository now real (files listed above).
- Trap: `qtyAtVendor` = reservation formula (pending QA counts as no longer at vendor); BR-SCO-18 uses decided-only (pending counts as at vendor).
- Trap: issue cost at QA/unprocessed is a weighted average over the challan lines settled; exact only when challans share a cost (settlement rows merge processed and unprocessed pieces of one receipt line).
- Trap: a receipt with no processed pieces is `accepted` immediately.
- Ledger reference for receipt/QA rows: `sco_receipt`, referenceId = receipt id, referenceLineId = receipt line id.
- Counters on SCO line moved only by receipt (`unprocessedQty`, `pendingQaQty`) and QA (`acceptedQty`, `rejectedQty`, `pendingQaQty`).
- Scrap yard = first `scrap_yard` location by id; missing -> 409 at QA when there are rejects.
