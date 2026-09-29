# Report 28 — test-writer — regression for CR-1 (BR-SCO-14, BR-SCO-17)

File: backend/src/routes/scoReceiptCost.test.ts (new, 2 tests, typecheck + biome clean)

Setup: one SCO line, ratio 1:1, lot A 100 pcs @100 and lot B 100 pcs @200 (average raised via stock-take). One receipt: 100 processed + 100 unprocessed, then QA.

| test | result |
|---|---|
| BR-SCO-14 processed pieces costed from their own challan lot (all 100 accepted) | FAIL-BUG |
| BR-SCO-15 rejected pieces / mixed accept 60 + reject 40 costed from own lot | FAIL-BUG |

FAIL-BUG detail: unprocessed returned at 200 (20,000 total) but processed raw-out posted at 150 (15,000). Sum 35,000 instead of 30,000. Finished item cost is therefore wrong too (150 + 2,500 instead of 100/200 + 2,500). Suspect scoReceiptService.ts:431-439 (with :312-326), as CR-1 says.

Assertions do not depend on whether processed or unprocessed takes the older lot (spec does not fix this): they require the two groups to use each lot once and processed cost to be 100 or 200, never the 150 blend.

No brief contamination. No production code touched. Not committed.
