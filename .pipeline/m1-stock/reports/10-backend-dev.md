# Report 10 — backend-dev — S4 correction + SPEC-pre-1

Result: DONE. Full `bun test`: 153 pass / 0 fail. typecheck clean, lint 121 warnings (unchanged), contract:check up to date (83 routes).

## Files changed
- `backend/src/service/grnService.ts` — `correction`: PO must be dispatched / partial_received / fully_received, else 409 (invoiced/closed/cancelled); sum of corrections (existing + new) <= accepted else 400; posted at the line's own ledger row location and cost; `blockNegative` (409 Insufficient stock); PO received qty down, then `recomputeReceiptStatus`. SPEC-pre-1: accept/bypass allowed PO statuses are now only dispatched, partial_received.
- `backend/src/repository/grnRepository.ts` — `sumCorrections`, `findPostedRow` (location + cost from the line's grn / grn_bypass ledger row); `getDetails` adds `correctedQty` and `netAcceptedQty` per line.
- `backend/src/service/poService.ts` (PO change) — `recomputeReceiptStatus` now also moves backward: fully_received -> partial_received or dispatched, partial_received -> dispatched (nothing received left), skipping the transition table for those receipt moves only (BR-PO-10). Manual status changes still use the table unchanged.

## Map updates
- Correction: one tx, cost/location = original posting's ledger row (not the PO price, not the current average); average via `out_at_cost` (BR-GRN-39).
- Details lines expose `correctedQty` and `netAcceptedQty`; line `acceptedQty` never changes.
- `poService.recomputeReceiptStatus` is the only place receipt status moves, both ways; invoiced/closed are never touched by it (grnService blocks first).
- Accept/bypass: PO dispatched or partial_received only (fully_received = 409).
