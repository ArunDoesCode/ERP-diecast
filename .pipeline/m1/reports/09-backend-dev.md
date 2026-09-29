# Report 09 — backend-dev — S3 permission enforcement

Status: DONE with 4 stale-test questions. Committed on work/m1 (feat(m1): auth S3).
Checks: typecheck clean, lint clean (0 errors), contract:check ok (81 routes).

## Test results
- permission-enforcement.test.ts, permissions-matrix.test.ts (except asset/machines row), authService.test.ts: green.
- auth.test.ts: green except one test (see Q1).
- Still red, not mine to fix: no-role-names.test.ts, pr-machine.test.ts (S4).

## What changed
- lib/auth-middleware.ts: `Actor`, `loadActor` (DB, 2s cache), `invalidateActor`, `invalidateRole`, `requireAuth` (token 401 -> actor missing/inactive 401 -> sets user + actor), `requirePermission(key)` (403 PERMISSION_DENIED + key; super-admin passes), `requireRole` kept (now reads actor.roleName).
- lib/errors.ts + app.ts: optional `details` on AppError, spread in onError.
- lib/token.ts: `TokenPayload = {userId, userName}`; `signAccessToken` still accepts extra fields (auth.test/app.test sign old-shape tokens).
- All routers switched (descriptor `auth` + middleware side by side). po/pr/setup/supplier/asset/grn/approval use keys per contract. `GET /asset/machines` = any-authenticated + `assetService.listMachines(params, actor)` allows asset.manage OR pr.link_machine, else 403 key `asset.manage`.
- `/auth/register` removed (route, controller, service, schema, END_POINTS). Frontend `API_ROUTES.auth.register` still exists (see Q3).
- authService: login/refresh sign `{userId,userName}`; `getSessionUser(actor)` builds `{id,name,email,role,permissions,screens}` (super-admin: all keys; screens = permission null or held, ordered sortOrder,key). `/auth/me` and login `user` use it.
- Invalidation wired: employeeService update/remove, roleService update/remove, permissionService.updateForRole.
- permissions.ts SEED_GRANTS: `pr.link_machine` added to owner and back_office (spec v7, coordinator message).
- permissions-sync.ts `seedGrants` now also sets `is_system = true` on the seed roles (they were seeded false, so BR-AUTH-18 rename/delete protection never fired). Test DB re-prepared (`db:test:prepare`).
- Controllers grn/approval: `actorRole` now `c.get("actor").roleName` (S4 removes role names).

## QUESTIONS (stale tests vs spec — I did not touch tests)
1. auth.test.ts "BR-AUTH-23 control ... 403, not 401" and app.test.ts "wrong role maps ForbiddenError to 403 JSON": sign a token for userId 1 with `role: operator` and expect 403. Test DB has no employee 1; BR-AUTH-12 / contract say a token whose employee is missing/inactive is 401, and role comes from the DB not the token. app.test also expects code `FORBIDDEN` but BR-AUTH-09 says `PERMISSION_DENIED`. Test-writer should create a real no-key employee and expect PERMISSION_DENIED.
2. Spec v7 (`pr.link_machine` to ow/bo/fs) makes these stale: lib/permissions.test.ts:42 (`"pr.link_machine": ["fs"]`, fails for owner and back_office seed rows) and permissions-matrix.test.ts `GET /api/asset/machines` (expects only bo, fs; owner is now allowed).
3. Frontend `frontend/src/lib/api/routes.ts:17` still has `auth.register`; `frontend-routes-contract.test.ts` (BL-008) fails until the frontend drops it (frontend-dev).

## Map updates (docs/modules/auth-setup.md)
- Files: `lib/auth-middleware.ts` (actor cache, requireAuth/requirePermission), `authService.getSessionUser`, `authRepository.getEmployeeRoleById/getPermissionKeysByRoleId/listScreens`.
- Endpoints: `/auth/register` gone; `/auth/me` and login `user` = `{id,name,email,role,permissions,screens}`; 403 body has `code:"PERMISSION_DENIED"` and `key`.
- Trap: seed roles were `is_system=false` until `seedGrants` runs; any DB without a sync run has unprotected system roles.
- Trap: actor cache TTL 2s per process; any new write path that changes employee role/active flag or role grants must call `invalidateActor`/`invalidateRole`.
- Trap: `requireAuth` is idempotent per request (skips if `actor` already set), so router-level `requireAuth` plus per-route `requirePermission` costs one DB read.
- Trap: token no longer has role/allowedPages; frontend `proxy.ts` and sidebar must read `/auth/me` `permissions`/`screens` (S-frontend).
- Scripts to remember: `git add` limited to own files; other agents' untracked test files sit in the worktree.
