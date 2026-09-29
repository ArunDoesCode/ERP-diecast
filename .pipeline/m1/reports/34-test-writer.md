# 34 test-writer
- F-TEST-11 fixed: `cancel()` in pr-cancel.test.ts now uses rest args; explicit `undefined` sends no reason. pr-cancel.test.ts 32 pass.
- F-TEST-10 fixed: db-reset.test.ts `run()` throws before spawning if a local target DB is not `diecast_kd_reset_test`; child env drops DATABASE_URL_TEST; beforeAll refuses if scratch name equals shared DB. Remote/unparsable URLs (refusal tests) still allowed.
- db-reset.test.ts: 13 pass / 27 fail (script not built yet, FAIL-EXPECTED); shared diecast_test untouched afterwards.
- Note: original test already used a scratch DB; I could not find the exact wipe path. Only production-side cause left would be the script reading another env/.env, which the new guard cannot see.
