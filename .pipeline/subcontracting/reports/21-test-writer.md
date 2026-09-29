# Report 21 — test-writer — BR-SCO-19 close vs pending QA

File: backend/src/routes/scoClose.test.ts (only file changed)

Replaced the vague "pending QA" test (accepted 200 or 400/409) with three strict tests from the spec changelog (S4: close while a line is pending QA -> 409, nothing written off until every processed line has a QA decision):

| Test | Result |
|---|---|
| owner closes with 400 pending QA, 600 at vendor -> 409; status, ledger, lossQty, closedAt unchanged | FAIL-EXPECTED (close not built, 501) |
| back office closes with all 1000 received but pending QA -> 409, stays material_received | FAIL-EXPECTED |
| two receipts, one decided, one pending -> 409; after last QA decision, owner close writes off 500 | FAIL-EXPECTED |

Whole file: 4 pass, 24 fail (all S4 handlers still 501). Biome: 1 pre-existing warning, no errors.

Notes: fully-received-but-pending-QA case by back office (no loss role) is asserted 409, not 403 — spec says pending QA blocks close first; flag if you read the order differently.
