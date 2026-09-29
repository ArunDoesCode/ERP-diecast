# Report 14 - backend-dev - S3 contract (receipt + QA)
DONE. Interfaces only, no logic, not committed. typecheck pass, lint 0 errors (259 warnings, pre-existing), contract:check ok (107 routes), bun test 1258 pass / 0 fail.

## Built
- Schema (`02_procurement-purchasing.ts`): `subcontracting_grns` + `_items` rebuilt; new `sco_receipt_settlements`; SCO line counter `pending_qa_qty`.
- Endpoints (`/api/sco`): POST /:id/receipts, GET /:id/receipts, GET /receipts/:receiptId, POST /receipts/:receiptId/lines/:lineId/qa (501 stubs); GET /getscodetails/:id response now `scoFullDetailsSchema`.
- Files: types/scoReceipt.types.ts, controller/scoReceiptController.ts, service/scoReceiptService.ts, repository/scoReceiptRepository.ts (stubs), routes/sco.ts, routes/end-points.ts, contract.md S3 section, manifest.

## Questions
1. Non-integer ratio (send / return, e.g. 1000 send : 700 return): raw pcs consumed = processed x ratio is fractional, counters are ints. Recommend: round(processed x send / return) per receipt line, and the last settling call takes the remainder. Spec examples are all 1:1.

## Map updates
- New files above; endpoints above; table `sco_receipt_settlements`; enum reuse: receipt and line `status`/`qaStatus` = `grn_status`, `draft` never used (default `pending_qa`).
- New line counter `pendingQaQty` (processed qty awaiting QA, reserved at vendor): atVendor = issued - (accepted+rejected+pending) x ratio - unprocessed - loss.
- Trap: drizzle push asks interactively about column renames; the old grn tables were empty so I dropped them in the test DB (`drop table subcontracting_grn_items, subcontracting_grns cascade`) then ran db:test:prepare. Dev DB needs the same drop before `db:push` (if it has no rows). CI uses db:reset, fine.
- `sco_grn` counter: no allocation code exists yet (the brief said "existing"); implement step must add it (plain sequence, e.g. via allocate in document-number.ts).
- Ledger reference for receipts still to be decided at implement step (suggest receipt id / line id like challans).
