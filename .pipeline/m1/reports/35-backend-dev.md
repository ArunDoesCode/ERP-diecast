# 35 — backend-dev — auth review fixes (backend)
Commit 990441d. Target tests employee-security + employee-last-admin-race + role-admin: 106 pass, 0 fail (3 runs, race test stable). typecheck, lint (0 errors), contract:check clean.
`bun test src`: 362 pass / 19 fail. Failures: no-role-names (known, F-APR-1) + 18 in pr-lifecycle.test.ts (PR_INVALID_ITEM / PR_DUPLICATE_ITEM / qty / edit rules; PR module, files I did not touch; not in the known list — coordinator to confirm they are pre-existing red PR tests).

## Fixed
| id | change | where |
|---|---|---|
| SEC-1/2/3 | target check (super-admin, or target's current role assignable; never super-admin) on update, remove, regenerateQr, and also assignRole; 403 ROLE_NOT_ASSIGNABLE | service/employeeService.ts `assertCanManageTarget` |
| SEC-4 | audit rows in same tx: employee.create, employee.update (safe fields + passwordChanged flag, no secrets), employee.qr (flag only); employee.role kept | employeeService.ts, `employeeAuditView` |
| SEC-5 | password/method change and deactivation delete refresh tokens in the tx; invalidateActor | employeeService.ts, authRepository.deleteRefreshTokensByEmployee |
| SEC-6/CR-1 | `lockTarget`: inside tx lock all active super-admins (id order), then target row; last-admin check after | employeeService.ts, employeeRepository.lockActiveByRole / findByIdForUpdate |
| CR-2 | rotation gate = `DELETE … WHERE hash AND not expired RETURNING` | authRepository.consumeRefreshToken, authService.refresh (old getRefreshTokenByHash/deleteRefreshToken removed) |
| CR-4 | role rename/delete guards inside tx under `roles` row lock | roleService.ts, roleRepository.findByIdForUpdate |
| CR-5 | roleUpdateSchema = roleInputSchema (name required) | types/setup.types.ts |
| CR-7 | getSessionUser(actor, email) explicit; Actor now carries `email`; /me passes actor.email (no extra query) | authService, authController, auth-middleware |
| CR-12, CR-15 | comment fixed; ROLE_HAS_INACTIVE_EMPLOYEES documented | lib/permissions.ts, routes/setup.ts |
| PERF-1 | index employees_role_id_idx | db/schemas/03_hcm.ts |
| PERF-2 | auth_audit_log (at desc, id desc) + actor_id indexes | db/schemas/01_auth.ts |
| PERF-4 | setScreenRoles loads roles with one `inArray` query | pageService.ts, roleRepository.findByIds |
| PERF-5 | applyRoleKeyDiff locks the role row; setScreenRoles locks roles in ascending id order | permissionService.ts, pageService.ts |

## Not done
- CR-8 (submitRequest actor required): src/repository/approvalRepository.test.ts:173 calls `submitRequest(input, id)` with 2 args; making `actor` required breaks typecheck and I may not edit tests. Needs test-writer to pass an actor first, then a one-line change in approvalService.ts. Left optional.
- Dev DB `db:push` not run (only the test env file is available here); `db:test:prepare` done. Run `bun run db:push` once on the dev DB.

## Notes
- Spec check: BR-AUTH-16 v9 says "every change to an employee"; I applied the target check to assignRole too. Same rule, no test contradicts it.
- `create` now runs in a tx (audit row).
- Not added (out of brief): index on refresh_tokens.employee_id (now used by delete-by-employee).

## Map updates (docs/modules/auth-setup.md)
- Actor has `email`. `getSessionUser(actor, email)` requires email.
- New repo fns: employeeRepository.findByIdForUpdate / lockActiveByRole, roleRepository.findByIdForUpdate / findByIds, authRepository.consumeRefreshToken / deleteRefreshTokensByEmployee. Removed getRefreshTokenByHash, deleteRefreshToken.
- Audit actions added: employee.create, employee.update, employee.qr.
- Schema: employees_role_id_idx, auth_audit_log_at_id_idx, auth_audit_log_actor_id_idx.
- Gotcha: employee writes must go through `lockTarget` (locks all active super-admins in id order first, then the target); any new employee-changing path must do the same or LAST_ADMIN can race. `regenerateQr(id, actor)` signature changed.
- Gotcha: role row is locked (FOR UPDATE) in rename/delete/grant tx; an employee insert/update with that role_id takes a key-share lock, so they serialise.
- Gotcha: a PostToolUse hook reformats files after Write/Edit (biome); multi-line schema edits may need re-reading.
