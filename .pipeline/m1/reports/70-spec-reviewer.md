# 70 spec-reviewer
| id | sev | rule | file:line | finding | fix |
|---|---|---|---|---|---|
| SPEC-M1 | major | BR-PR-14 | frontend/src/types/purchase-requisitions.ts:101; PR screens | backend returns noCostHistory per line; frontend never reads it, so the "estimate uses standard rate" message is missing | add noCostHistory to the line type, show the note on flagged PR lines |
| SPEC-M2 | minor | lint | backend/src/routes/grn.ts:5 | requireAuth import unused after `use("*", requireAuth)` was removed (requirePermission covers auth) | drop the import |
| SPEC-M3 | minor | BR-AUTH-11 | backend/src/db/schemas/02_procurement-approval.ts:22; F-APR-1 approvalRepository.ts:394 | role names in a comment and in the default approval chain, outside seed data | already tracked as F-APR-1; move the default chain into seed |
| SPEC-M4 | minor | tests | backend | bun test not run: DATABASE_URL_TEST unset in this shell (31 files fail on env, 0 pass) | test-runner to run with DB up |
