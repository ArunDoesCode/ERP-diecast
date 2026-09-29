# Report 20 — test-writer — S4 tests
File: backend/src/routes/scoClose.test.ts (26 tests, HTTP level, TEST_scocl_ fixtures). Typecheck ok.
Run: 4 pass, 22 FAIL-EXPECTED (close/loss-log/vendor-stock return 501 NOT_IMPLEMENTED; getscos date filter not applied). No FAIL-BUG.
Passing now: fs/qa/unauth 403/401 on close route guard cases, pageSize>100 -> 400, etc.

| BR | tests |
|---|---|
| 19 | clean close (bo), optional reason, close from material_issued (un-issued dropped), 990 back bo -> 403, owner no reason -> 400 SCO_CLOSE_REASON_REQUIRED, reason 2/501 chars -> 400, owner 10 written off (sco_loss, -10 @12000 at vendor, lossQty 10), whole-lot loss, approved -> 409, twice -> 409, 404, closed SCO takes no challan/receipt |
| 22 | 980 accepted -> 24,500 + 4,410 GST still shown after close |
| 23 | fs/qa close 403, unauth 401, owner clean close ok, reports need sco.view |
| 24 | two concurrent owner closes with loss -> 200 + 409, loss posted once |
| 25 | loss ledger row: createdBy owner, createdAt, batch H-231 |
| reports | vendor-stock qty/value and zero rows hidden; loss-log row shape, scoId filter, no-loss SCO excluded, date filter; getscos createdFrom/createdTo |

Notes
- Test "pending QA at close" is deliberately loose: spec BR-SCO-19 does not say whether close is allowed while a receipt line awaits QA. Only asserts loss <= 600 (or 400/409). See QUESTIONS.
- Ledger reason on the loss row is not asserted (no ledger reason column; spec BR-SCO-25 reason is on the SCO closeReason, asserted).
