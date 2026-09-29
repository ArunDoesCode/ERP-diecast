# Report 28 — test-writer — regression (BR-INV-07, 13, 15, 24)
Brief had no test-change request; existing tests already covered the main cases, so I added extra spec-derived tests. 8 new tests, all PASS (132/132 in both inventory files). No FAIL-BUG.
| BR | new test | file |
|---|---|---|
| 07 | PATCH reorder -5 → 400, 0 → ok | inventoryMasters.test.ts |
| 13 | PATCH another location to main_store → 409, type unchanged | inventoryMasters.test.ts |
| 13 | 4 concurrent main_store creates → all 409, count unchanged | inventoryMasters.test.ts |
| 15 | deactivated location keeps ledger rows + movement list | inventoryMasters.test.ts |
| 15 | stock-take into inactive location → 400, nothing posted | inventoryMasters.test.ts |
| 15 | reactivated location takes postings | inventoryMasters.test.ts |
| 24 | same supplier's PO for another item ignored | inventoryStock.test.ts |
(7 listed; the BR-INV-13 pair and 15 trio plus 07 and 24 = 7 tests.)
QUESTIONS: if a specific gap was meant, cite it in a test change request; I did not read findings.
