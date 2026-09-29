# Findings — m1

| id | source | file:line | issue | decision | status |
|---|---|---|---|---|---|
| TEST-1 | test-writer 02 | backend/src/lib/rate-limiter.ts | 11th login → 403 RATE_LIMITED, BR-AUTH-04 needs 429 | fix now | open |
| TEST-2 | test-writer 02 | backend/src/lib/token.ts, authService | refresh JWT has no unique id → same-second duplicate token (500 on token_hash) and reused token still valid, BR-AUTH-05 | fix now | open |
| F-TEST-4 | backend-dev 06 | backend/src/lib/permissions-sync.test.ts (+1 other test file) | biome format errors in test files | fix now (test-writer) | open |
