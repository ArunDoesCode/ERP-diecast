# Findings — m1

| id | source | file:line | issue | decision | status |
|---|---|---|---|---|---|
| TEST-1 | test-writer 02 | backend/src/lib/rate-limiter.ts | 11th login → 403 RATE_LIMITED, BR-AUTH-04 needs 429 | fix now | fixed |
| TEST-2 | test-writer 02 | backend/src/lib/token.ts, authService | refresh JWT has no unique id → same-second duplicate token (500 on token_hash) and reused token still valid, BR-AUTH-05 | fix now | fixed |
| F-TEST-4 | backend-dev 06 | backend/src/lib/permissions-sync.test.ts (+1 other test file) | biome format errors in test files | fix now (test-writer) | fixed |
| F-TEST-5 | backend-dev 09 | backend/src/routes/auth.test.ts (BR-AUTH-23 control), backend/src/app.test.ts (403 test) | sign token for non-existent userId 1 and expect 403 / code FORBIDDEN; spec: role comes from DB (BR-AUTH-12), inactive/missing → 401, denial code PERMISSION_DENIED (BR-AUTH-09) | fix now (test-writer) | fixed |
| F-TEST-6 | backend-dev 09 | backend/src/lib/permissions.test.ts:42, permissions-matrix.test.ts GET /api/asset/machines | expect pr.link_machine = fs only; spec v7 seeds ow, bo, fs | fix now (test-writer) | fixed |
| F-FE-1 | backend-dev 09 | frontend/src/lib/api/routes.ts:17 | auth.register still listed; route retired (spec Q6/Q10) → BL-008 contract test fails | fix now (frontend-dev) | fixed |
| F-TEST-7 | backend-dev 13 | backend/src/routes/pr-machine.test.ts ("holder … saves a PR with a machine") | reads body.data.id; POST /api/pr/createpr returns data.pr.id (see backend/.contracts/api-manifest.json) | fix now (test-writer) | fixed |
| F-APR-1 | backend-dev 13 | backend/src/repository/approvalRepository.ts:394 | fallback approval chain hard-codes role "owner"; BR-AUTH-11 allows role names only in seed data → move the default chain into seed data | backlog to approval module (this batch) | open |
| F-PR-1 | backend-dev 13 | backend/src/types/pr.types.ts updatePrSchema | saleOrderId/assetId/notes were wrongly required on PATCH → made optional | accepted (bug fix) | fixed |
| TEST-8 | test-writer 16 | DELETE /setup/roles/:id | 500 FK violation when only inactive employees hold the role → 409 ROLE_HAS_INACTIVE_EMPLOYEES (spec v8) | fix now (backend-dev S6) | open |
