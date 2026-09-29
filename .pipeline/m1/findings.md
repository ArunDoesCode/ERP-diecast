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
| F-TEST-9 | stop hook | backend/src/routes/role-admin.test.ts:171 | typecheck: string | null not assignable to string (screen menuGroup is nullable: "" = no group, questions.md #14) | fix after S6 build (test-writer) | resolved (menuGroup stays NOT NULL, "" = no group) |
| SEC-1 | security 28 | backend/src/service/employeeService.ts update | non-super-admin with setup.employees.manage can edit a super-admin (password) → takeover; BR-AUTH-16 (spec v9) | fix now (test first) | fixed |
| SEC-2 | security 28 | employeeService.ts remove | can deactivate super-admin / higher-role employees; BR-AUTH-16 v9 | fix now (test first) | fixed |
| SEC-3 | security 28 | employeeService.ts regenerateQr | no target check, no audit, raw token; BR-AUTH-16/20 v9 | fix now (test first) | fixed |
| SEC-4 | security 28 | employeeService.ts create/update/regenerateQr | employee changes not audited; BR-AUTH-20 v9 | fix now (test first) | fixed |
| SEC-5 | security 28 | employeeService.ts update; authService.ts | password/method change + deactivation don't revoke refresh tokens; BR-AUTH-05 v9 | fix now (test first) | fixed |
| SEC-6/CR-1 | security 28 + code 27 | employeeService.ts assertNotLastActiveAdmin | last-admin check outside write tx → zero super-admins under race; BR-AUTH-17 v9 | fix now (test first) | fixed |
| CR-2 | code 27 | authService.ts:92-98 | refresh rotation not atomic → concurrent reuse; BR-AUTH-05 v9 | fix now (test first) | fixed |
| SPEC-1 | spec 30 | backend tests | BR-AUTH-13 untested | fix now (test-writer) | fixed |
| SPEC-4 | spec 30 | backend tests | ROLE_HAS_INACTIVE_EMPLOYEES untested (BR-AUTH-19 v8) | fix now (test-writer) | fixed |
| SPEC-3 | spec 30 | spec | undocumented codes | fixed in spec v9 | fixed |
| CR-3 | code 27 | frontend setup/auth queries | own permissions stale after grant/role change | fix now (frontend) | fixed |
| CR-9..11, CR-13..15, PERF-10 | code 27, perf 29 | frontend | grants editor key, invalidations, dead code/types, tab gating, empty group header, missing error message, /auth/me staleTime | fix now (frontend) | fixed |
| CR-4, CR-5, CR-7, CR-8, CR-12, CR-15 | code 27 | backend role/auth/approval services | guards inside tx, required name, explicit email, required actor, stale comment, inactive-employees doc | fix now (backend) | fixed except CR-8 (with PR-S2) |
| PERF-1, PERF-2, PERF-4, PERF-5 | perf 29 | backend schema/services | index employees.role_id, auth_audit_log(at,id)+actor_id; batch setScreenRoles; row lock in grant tx | fix now (backend) | fixed |
| CR-6, PERF-3, PERF-6..9, PERF-11, PERF-12, SEC-8 | code 27, perf 29, security 28 | various | minor structure/perf; multi-instance cache note | backlog | backlog |
| SPEC-2 | spec 30 | approvalRepository.ts:394 | = F-APR-1 | approval module | open |
| SPEC-5, SEC-9 | spec 30, security 28 | legacy role_pages routes | S7 | S7 | open |
| SPEC-6 | spec 30 | authService.refresh | harmless | reject (no spec rule, no risk) | rejected |
| F-TEST-10 | backend-dev 25 | backend/scripts/db-reset.test.ts | running the full suite while db:reset is unbuilt/red wipes the shared diecast_test seed → 40 unrelated failures; db:reset tests must only ever target their own scratch DB (known-defects BR-KD-30 guard + test isolation) | fix now (test-writer) | fixed |
| F-TEST-11 | backend-dev 25 | backend/src/routes/pr-cancel.test.ts "BR-PR-41 missing reason on an approved PR" | helper default param turns undefined into a valid reason → test can never pass; send no reason (null / no body) | fix now (test-writer) | fixed |
| TEST-36-W | coordinator | backend/src/routes/pr-lifecycle.test.ts withdraw test | uses action "cancel"; contract PR-S2 says action "withdraw" | fix now (test-writer) | fixed |
| SEC-10 | security 37 | backend/src/service/authService.ts refresh | ms race: refresh concurrent with password reset keeps a session | backlog (accept window) | backlog |
| SEC-11 | security 37 | employeeService.regenerateQr | QR credential issued to password-method employee; QR login not built (BL-017) | backlog (fix with BL-017) | backlog |
| F-TEST-12 | backend-dev 38 | backend/src/routes/pr-machine.test.ts "updating a PR to add a machine" | edited by a non-requester; BR-PR-17 = requester or super-admin only → fixture must have the requester edit | fix now (test-writer) | open |
| CR-8-T | backend-dev 35 | backend/src/repository/approvalRepository.test.ts:173 | calls submitRequest with 2 args; CR-8 makes the actor required → pass an actor | fix now (test-writer), then backend one-liner | open |
| CR-8-L | coordinator | backend/src/service/approvalService.ts:415-417 | biome format error after CR-8 commit (lint fails) | fix now (backend-dev) | fixed |
| FE-SA | frontend-dev 40 | /auth/me + PR screens | no super-admin flag in UI → super-admin cannot edit PRs from the UI (backend allows, BR-PR-17) | S7: /auth/me returns isSuperAdmin; PR edit uses it | open |
| FE-INACTIVE | frontend-dev 40 | PR item picker (useAssetItemsLookupQuery) | unverified that lookup excludes inactive items (backend rejects PR_INVALID_ITEM) | check after stock merge | open |
| DBR-1 | backend-dev 44 | backend/scripts/db-reset*.ts fixtures | 13 "db:reset with fixtures" tests now fail (were green at 24c5dd9) — likely new rules (required approval comments, requester-only submit, PR create rules) broke fixture flows | fix with APR build (backend-dev), confirm with test-runner | open |
| FE-HIST | frontend-dev 49 | frontend ApprovalHistoryPanel | trail action "cancelled" is written for both withdraw and document cancel; panel labels it "Withdrawn" → show "Cancelled" + notes | fix in next frontend pass | open |
| F-TEST-14 | stop hook | backend/src/repository/approvalRepository.test.ts:173, backend/src/types/approval.types.test.ts:33 | still use isSaleOrderLinked; BR-APR-15 drops it from matching and from the policy API | fix now (test-writer) | fixed |
