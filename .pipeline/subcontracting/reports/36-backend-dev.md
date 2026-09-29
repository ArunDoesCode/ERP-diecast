# Report 36 — backend-dev
BR-SCO-09: `assertChallanDateNotFuture` in backend/src/service/scoChallanService.ts, called at top of `create` (before the transaction, so no number burned). Rejects date >= start of tomorrow UTC with 400 `SCO_CHALLAN_DATE_FUTURE`. Contract error list updated.
Checks: typecheck ok, lint 0 errors (260 pre-existing warnings), bun test 1346 pass / 0 fail, contract:check ok.
