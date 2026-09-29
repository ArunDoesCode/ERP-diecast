# Report 15 — test-writer — S3 receipt + QA tests

File: backend/src/routes/scoReceipt.test.ts (HTTP level, real app, TEST_scorc_ fixtures, cleaned in afterAll).
Result: 56 tests, 54 FAIL-EXPECTED (S3 handlers return 501 NOT_IMPLEMENTED), 2 pass (Zod 400s: missing vendorChallanNo, 0+0 line). Typecheck and biome clean. No FAIL-BUG (nothing implemented yet).

| BR | tests |
|---|---|
| 12 | 409 on non-material_issued; 201 pending_qa; challan no required; unique per vendor (409) and reusable across vendors; 700 vs 600 -> 400; processed+unprocessed cap; ratio 2 cap; earlier receipts reduce qty at vendor; foreign scoItemId 400; qtyAtVendor |
| 13 | no stock before QA; 480+20; accepted/rejected status; 480+10 -> 400; second decision 409; concurrent decisions post once; fs -> 403; 404s; receipt status follows lines |
| 14 | 480 @12,000 raw out, finished +480 @14,500; ratio 2 cost 26,500; average 12,250 (BR-GRN-38); non-whole ratio (1000/300: 333, 667, 1000) and half-up (5/2: 3 then 2) |
| 15 | scrap yard +20 @12,000, vendor -20; no charge for rejects; all rejected |
| 16 | store +100 at save, no QA, no charge; 0+0 line -> 400 |
| 17 | 600+400 with 700 back -> 600 + 100; open list; later receipt settles rest; ratio 2 counts raw; receipt details settlements |
| 18 | 980+20 -> material_received; processed+unprocessed; 990 back stays; partial issue stays; no more receipts (409) |
| 22 | 980 accepted -> 2,450,000 + 441,000 paise; pending QA earns 0; across receipts; read-only |
| 24 | two receipts for last 400 -> 201/409; two unprocessed returns; multi-line 400 rolls back; bad QA totals change nothing; receipt saved whole |
| 25 | who/when on receipt and ledger rows; QA who/when/notes; heat on all QA postings; finished row heat + settlement challan JWC/ |

## Assumptions to confirm (spec/contract ambiguous)
- BR-SCO-18: I check material_received only after QA decisions are done (not at receipt save). Contract says "when nothing left at vendor"; pending QA counts as still at vendor per contract.
- Non-whole ratio rounding tested by decisions made in receipt order, cumulative processed at QA time.
- BR-SCO-24 concurrent QA / receipt loser = 409 (per S2 clarification).
- Test uses first existing scrap_yard location (creates one if none); "which scrap yard" not asserted beyond type.
- Ledger referenceId for receipt rows not asserted (contract silent).
- BR-SCO-19/20/21/23 close etc. are out of this brief's scope.
