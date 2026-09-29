# Report 10 — test-writer — S2 challan tests
File: backend/src/routes/scoChallan.test.ts (47 tests, HTTP level via createApp, real DB, TEST_scoch_ fixtures, company_settings saved/restored).
Result: 43 FAIL-EXPECTED (endpoints return 501), 4 pass (Zod-level 400s: qty 0, fractional, no lines). Typecheck clean. No FAIL-BUG (feature not built).
Coverage: BR-SCO-07 (lots, over-qty 400, stock short 409, bad SCO status 409, 404s), 08 (2 ledger rows, cost, heat, location on first use, stock/avg unchanged), 09 (number format/FY/consecutive, no burn on refusal, print data, unregistered, missing HSN / company 400), 10 (inter-state, unregistered, >= Rs 50,000 boundary, per-challan value), 11 (due date +1yr, ok/warning/overdue, nothing blocked, open list), 24 (races, all-or-nothing multi-line), 25 (who/when/heat).
Notes:
- BR-SCO-24 race test expects 409 for the loser even when the loser would exceed remaining qty (spec example: "two challans for the last 400 at once -> one 200, one 409"); BR-SCO-07 says over-qty is 400. Dev must re-check qty after taking the lock and return 409 in that case.
- BR-SCO-25 ledger reference: spec does not say if referenceId is the challan or SCO; test accepts either.
- Stock is seeded through POST /asset/inventory/movements (opening_stock); SCO approved via direct DB status update.
