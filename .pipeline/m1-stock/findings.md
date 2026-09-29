# Findings — m1-stock

| id | severity | area | file:line | finding | status |
|---|---|---|---|---|---|
| SPEC-pre-1 | major | backend | grnService accept/bypass | S3 allowed accept/bypass on `fully_received` PO; BR-GRN-01 allows only dispatched/partial_received | routed to backend-dev in brief 10 |
| TW-note-1 | minor | spec | grn-stock BR-GRN-43 | spec example says owner → 200, contract returns 201; tests accept both | backlog: align spec example at next spec change |
| TW-note-2 | minor | test | stockPosting.test BR-GRN-38 | "stock −5" example unreachable legally; test seeds −5 directly in DB | accepted, no action |
| FE-note-1 | minor | frontend | GrnQaDecisionModal | over-receipt warning ignores earlier receipts (client lacks them); server still enforces | backlog |
| PERF-1 | major | backend | grnService qaAction/bypass/correction | parent GRN + PO rows not locked → stale header/PO status under concurrency | fix now (iter 1) |
| PERF-2 | major | backend | inventoryLedger indexes | no index on reference_line_id | fix now (iter 1) |
| PERF-3 | minor | backend | assetRepository inventoryReconciliation | double full aggregate | fix now (cheap, iter 1) |
| PERF-4 | minor | backend | ledger index | (item, location) index lacks id | fix now (iter 1) |
| PERF-5 / CR-6 | minor | backend | grnRepository getDetails | corrections sum outside snapshot | reject: display only, transient |
| SEC-1 / SPEC-3 / CR-1b | major | backend | grnService update/remove | draft edit/delete check-then-act without lock, not one tx | fix now (iter 1) |
| SPEC-2 / CR-1a | major | backend | grnService update | challan clash on edit → 500 not 409 | fix now (iter 1) |
| SPEC-1 | major | backend | stockPostingRepository:121 | BR-GRN-39 negative average possible | fix now (iter 1) |
| CR-2 | major | backend | grnService update | batchNumber on draft edit not saved | fix now (iter 1) |
| CR-3 | major | frontend | grn/asset queries | stale caches after correction / stock changes | fix now (iter 1) |
| CR-4, CR-5 | minor | frontend | GRN modals | unit list mismatch; correction max not enforced | fix now (cheap, iter 1) |
| SEC-2, SEC-3, SEC-4 | minor | backend | types / assetService | no qty/cost upper bound; bad locationId → 500; certificateUrl allows javascript: | fix now (cheap, iter 1) |
| SPEC-4, SPEC-5 | minor | backend | grnService comments | stale comment; BR id comments missing | fix now (iter 1) |
| SPEC-6 | minor | backend | assetRepository:451-468 | opening_stock accepted as stock-out; BR-GRN-40 "opening stock goes in" | backlog: spec is silent; spec edits are off-limits on this branch → BL item, ask at next spec change |
| COORD-1 | major | backend | 02_procurement-catalog.ts:115 | ledger total_value_change_paise int4 → receipts > ₹2.1 cr refused | fix now (brief 15) |
| PERF-6 / SPEC-8 | minor | backend | grnService applyDraftUpdate | reads use db not tx | fix if another round runs, else backlog |
| SPEC-7 | minor | backend | grnService mapChallanClash | any 23505 → challan conflict | reject: only the challan unique index can fire there |
| PERF-7 | minor | backend | schema | no migration SQL; deploy relies on db:push | backlog → BL-011 (migrations) |
| SPEC-guards | minor | spec | grn types | input caps not in spec | backlog: add to spec at next change |
| CR-7 | minor | frontend | lib/grn-units.ts | unit list duplicated from backend | backlog |
| CR-8 | minor | frontend | usePoItemUoms | new Map per render, no effect today | reject: no functional impact |
| TEST-1, TEST-2 | (blocker per runner) | test | cd77a53, b78b070 | test( commits also carry .pipeline briefs/reports | reject: PROTOCOL rule 5 only requires test files in test( commits and none in feat(/fix( — both hold; runner confirmed no feat/fix commit touches a test file |
| TEST-3 | major | test | backend/src/service/stockPosting.test.ts (manual-movement tests) | 28 grn-stock tests post the old signed-qty body; spec inventory.md BR-INV-22: "Stock-take: the clerk enters the counted qty; the system posts counted − current balance at that location" and BR-INV-23 (opening stock qty + rate). Contract changed to match. | test-writer: update those tests to the new shape (brief 22) |
