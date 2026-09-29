# Findings — m1-stock

| id | severity | area | file:line | finding | status |
|---|---|---|---|---|---|
| SPEC-pre-1 | major | backend | grnService accept/bypass | S3 allowed accept/bypass on `fully_received` PO; BR-GRN-01 allows only dispatched/partial_received | routed to backend-dev in brief 10 |
| TW-note-1 | minor | spec | grn-stock BR-GRN-43 | spec example says owner → 200, contract returns 201; tests accept both | backlog: align spec example at next spec change |
| TW-note-2 | minor | test | stockPosting.test BR-GRN-38 | "stock −5" example unreachable legally; test seeds −5 directly in DB | accepted, no action |
| FE-note-1 | minor | frontend | GrnQaDecisionModal | over-receipt warning ignores earlier receipts (client lacks them); server still enforces | backlog |
