# Report 04 — test-writer — grn-stock tests
File: backend/src/service/stockPosting.test.ts (56 tests). Typecheck + biome clean. Run: 14 pass, 42 fail.
Level: GRN paths via grnService (qaAction/bypass/correction); manual movements, items API, reconciliation via createApp() HTTP.
Fixtures: TEST_stock_ prefix; own actor employee, supplier, PO, items, locations; existing main_store reused (or created). Cleanup FK-safe (also releases document_number_counters refs).

## Results (all 42 fails are red because the stock slices are not built; no fixture problems seen)
| BR | tests | result |
|---|---|---|
| 21 | accept row fields+batch, bypass row, reject-all no row, no main_store 404 | FAIL-EXPECTED (referenceLineId null); reject-all PASS; 404 PASS |
| 22 | forced PO-update failure (trigger) for accept / bypass / correction | FAIL-BUG: ledger row saved although PO update fails (grnService qaAction, non-atomic) |
| 24 | 2.5@1 -> +3/-3 net 0; 0.5@1 -> +1 | FAIL-BUG: correction row value -2 not -3 (round half away from zero) |
| 32, 39 | correction row, avg after correction (20412, 21000, unchanged at 0) | FAIL-EXPECTED (item average stays 0) |
| 33 | correction over balance 409, manual out 409 (x2) | FAIL-EXPECTED (manual endpoint still old body shape -> ZodError) |
| 37, 38 | stock/average after accept, bypass, correction, manual | FAIL-EXPECTED (item stock stays 0 today) |
| 40 | items API with currentStock/averageCostPaise (POST, PATCH) -> 400 | PASS; opening_stock via manual: FAIL-EXPECTED |
| 41 | zero rows after mix; drift detection x2 | FAIL-EXPECTED (reconciliation 501 until S5) |
| 42 | 2x +10, 5x +10, accept+manual concurrent | FAIL-EXPECTED (manual body shape) |
| 43 | 9 doc types -> 400 "source document", no/blank reason, 403 floor_supervisor/qa_inspector, 200 owner/back_office/super-admin, 401 | FAIL-EXPECTED (old handler) |
| 44 | in cost 0 / none -> 400, out valued at average, in feeds average | FAIL-EXPECTED |

## Notes
- Spec BR-GRN-43 says "owner -> 200", contract says 201; tests accept 200 or 201.
- BR-GRN-38 negative-stock example: item stock set to -5 directly in DB (no legal path); asserts average only.
- BR-GRN-21 "no main_store": test temporarily flips all main_store rows to scrap_yard, restores in finally.
- BR-GRN-22 uses a temporary DB trigger on purchase_order_items (dropped in finally).
- No production change needed for testability.
- Brief contamination: none.
