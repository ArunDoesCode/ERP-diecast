# Report 22 — backend-dev — S4 implement
STATUS: DONE. scoClose.test.ts 28/28; full bun test 1342 pass 0 fail; typecheck ok; biome 0 errors; contract:check ok (no route change).

## Changed
- backend/src/service/scoService.ts — `close` (lock SCO first; 409 unless material_issued/received; 409 SCO_QA_PENDING if any line pendingQaQty>0; loss = qtyAtVendor per line; needs `can(actor,"sco.loss_override")` else 403, then reason else 400 SCO_CLOSE_REASON_REQUIRED; posts `sco_loss` out row from vendor location, refId=SCO id, refLineId=SCO line id, notes=reason, cost = weighted issue cost of open challan lines (FIFO), batch = first challan heat or line batch; settles those challan lines; lossQty += qty; stores closedBy/At/Reason).
- backend/src/repository/scoReportRepository.ts (new), service/scoReportService.ts — vendor stock (ledger balance of vendor_premise locations per vendor+item, zero rows dropped, value = sum of ledger value), loss log (sco_loss rows joined to SCO/vendor/item/employee, reason = SCO closeReason).
- backend/src/repository/scoRepository.ts — list `createdFrom`/`createdTo`; exported `endOfDayBound` (bare date at midnight UTC = whole day inclusive).
- backend/src/repository/scoReceiptRepository.ts — `addCounters` takes `lossQty`.
- backend/src/lib/sco-math.ts — `nothingLeftAtVendor` no longer treats pending-QA qty as at the vendor (see question).

## Question for coordinator (not blocking)
New test scoClose.test.ts:631-639 expects SCO = material_received right after a full receipt that is still pending QA. S3 code kept it material_issued. BR-SCO-18 says "nothing is left at the vendor"; pending pieces are already back with us, so I changed sco-math (S3 file). All S3 tests still pass. Please confirm this reading and add a spec changelog line.

## Map updates
- New: `repository/scoReportRepository.ts`; SCO close in `scoService.close`; loss log/vendor stock in `scoReportService`.
- Behaviour: SCO reaches material_received when all pieces are received, even if QA is pending; close is then 409 until QA is decided.
- Traps: Drizzle subquery needs unique column aliases (duplicate `id`/`name` -> 500); use `sql...as()`. `createdTo` is inclusive whole-day only for midnight-UTC values. Loss posting settles open challan lines (settledQty) so open-challan report drops them. Frontend files in the worktree are modified by another agent, untouched by me.
- No schema change, no db push needed. Not committed.
