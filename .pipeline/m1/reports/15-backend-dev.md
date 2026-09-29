# Report 15 — backend-dev — S6 contract

Result: DONE. 11 new descriptors (90 total in manifest), 501 stubs, contract.md "S6" section. Typecheck clean, lint clean (warnings only, pre-existing). Tests: 180 pass, 1 fail (`no-role-names.test.ts`, BR-AUTH-11, red test waiting for S8 — role union in `lib/token.ts`, `approvalRepository.ts:394`; not caused by S6).

## New routes (base /api/setup, all `setup.roles.manage` except employees = `setup.employees.manage`)
POST /roles/:id/copy · GET /roles/:id/grants · POST /roles/:id/grants · GET /screens · PATCH /screens/:key · POST /screens/:key/roles · GET /employees/assignable-roles · PATCH /employees/:id/role · GET /access-log.
Changed: GET /roles row adds isSuperAdmin, keyCount, employeeCount; error notes on role PATCH/DELETE/employee DELETE. Old pages/permissions routes kept, marked Legacy (removed S7).

## Files
routes/setup.ts, routes/end-points.ts, types/setup.types.ts, controllers role/permission/employee/page (501 stubs; screens stubs live in pageController, grants in permissionController, access-log in employeeController — no new controller files), .contracts/api-manifest.json, .pipeline/m1/contract.md.

## Map updates
- New endpoints above; codes SYSTEM_ROLE_PROTECTED, ROLE_HAS_EMPLOYEES, ROLE_IN_APPROVAL_CHAIN, LAST_ADMIN, KEY_NOT_GRANTABLE, UNKNOWN_KEY, SCREEN_HAS_NO_KEY, ROLE_NOT_ASSIGNABLE.
- Trap: role grant routes use `:id`, old `POST /roles/:roleId/permissions` uses `:roleId` — different paths, no clash.
- Trap: existing `PATCH /employees/:id` and `POST /employees` accept `roleId` — BR-16/17 must be enforced there too, not only on `/role`.
- Trap: `/employees/assignable-roles` is registered before any `/employees/:id` GET; there is none, so no clash.
- Trap: `roleListItemSchema` extends roleSchema; roleService.list must return the extra fields at build time.

## QUESTIONS (spec silent, I chose; confirm or change)
1. BR-16 error code: spec says 403 only. I used `ROLE_NOT_ASSIGNABLE`.
2. Screen tick on a screen with no key (landing, approvals): I return 400 `SCREEN_HAS_NO_KEY`.
3. Screens list unpaginated (bounded reference data), like modules; assignable-roles too.
4. Ticking/granting on the super-admin role: 403 `SYSTEM_ROLE_PROTECTED` (BR-18 "no grant list to edit").
5. `UNKNOWN_KEY` 400 for a key not in the catalog.
