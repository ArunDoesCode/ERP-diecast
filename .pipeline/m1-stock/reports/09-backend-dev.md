# Report 09 — backend-dev — S3 QA decisions + update whole-number check

Result: DONE. All S3 tests green (BR-GRN-01 accept/bypass, 09, 10, 12, 13, 15, 18, 25, 27). typecheck clean, lint 121 warnings (unchanged). Full `bun test`: 146 pass / 7 fail (was 135 / 18). No green test turned red. The 7 reds are S4 only (BR-GRN-29, 33-correction, 34, 35).

## Files changed
- `backend/src/service/grnService.ts` —
  - `qaAction`: accepted + rejected must equal arrived (400); PO must be dispatched / partial_received / fully_received, checked in the tx before posting (409); over-receipt check under the PO-line lock, stores excess, reason, actor on the line.
  - `bypass`: accepted <= arrived (400), rest stored as rejected; same PO check and over-receipt rule; stores `qaBypassedAt`.
  - `overReceiptGuard`: override roles super-admin, owner, back_office (`// perm: grn.over_receipt_override`), reason required, excess = received + accepted - ordered x 1.05, all in thousandths.
  - `update`: same whole-number check as create for pcs/set lines (S2 leftover).
- `backend/src/repository/grnRepository.ts` — `findLineUoms(grnId)`; `updateGrnItemLine` accepts `qaBypassedAt` and the over-receipt fields.

## PO changes
None.

## Map updates
- Over-receipt override: super-admin, owner, back_office + `overrideReason`; excess stored is the qty above 105%, not above ordered.
- Accept/bypass allowed while PO is dispatched, partial_received or fully_received; any other status = 409.
- Concurrency (BR-GRN-15/09) relies on `findGrnItemForUpdate(tx)` locking the GRN line and PO line rows (FOR UPDATE on the join).
- Full reject (accepted 0) does not check the PO status and does not touch the PO.
