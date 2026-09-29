# Report 22 — test-writer — TEST-3 (stockPosting.test.ts to new manual-movement shape)

Result: 31 pass, 39 fail. Typecheck and biome clean. All fails are FAIL-EXPECTED: `POST /inventory/movements` returns 501 until S6-S10 lands. No FAIL-BUG.

## What changed (backend/src/service/stockPosting.test.ts only)
- Added helpers `stockTake(role,item,loc,countedQty,extra)` and `openingStock(role,item,loc,qty,cost,extra)`.
- All old `quantityChange` calls converted (BR-GRN-33, 37, 39, 40, 41, 43, 44).
- BR-GRN-43 doc-type tests: body now uses `countedQty`; still expects 400 with "source document".
- BR-GRN-42: two/five concurrent posts now use GRN accepts (opening stock twice on one item+location is 409 by BR-INV-23). Added a race test: two opening stocks on the same new item+location -> one 2xx, one 409, balance 10. Mixed accept + opening test uses different locations (balances 30 and 100).
- BR-GRN-33: the two "manual stock-out below zero" tests cannot be built with a stock-take (countedQty >= 0, so a stock-take cannot go below zero). Replaced with: negative countedQty -> 400; counted 0 at an empty location while another holds stock -> 400 no difference. The 409 path is still covered by the correction test.
- New: BR-INV-22 (7 tests: 480->470 = -10 at average; counted = balance -> 400 "no difference"; counted above -> + at sent cost; per-location difference; counted 0; empty location counted 0 -> 400; old `quantityChange` shape -> 400).
- New: BR-INV-23 (5 tests: GRN already posted -> 409; second opening -> 409; other location allowed; qty 0 -> 400; no cost -> 400).

## Notes
- BR-GRN-32, 33 (correction), 37, 38, 39, 40, 42, 44 assertions unchanged apart from the posting call.
- Currently passing: GRN-path tests (accept/bypass/correction, average, rounding, item-API 400s, reconciliation) and 403/401 role checks.
- Spec gap (not blocking): "no difference" is asserted by message text containing "no difference" (from BR-INV-22 wording).

## BRIEF-CONTAMINATION
None.
