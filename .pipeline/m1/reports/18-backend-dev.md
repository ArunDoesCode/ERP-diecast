# Report 18 — backend-dev — S6 build (commit b6a09c3)

Result: `role-admin.test.ts` 77/77 green. typecheck clean, lint no new warnings, `contract:check` clean (90 routes).

## What was built
- Roles: list (keyCount, employeeCount = active only, isSuperAdmin), create, copy (BR-25), rename, delete, grants get/set (all-or-nothing tx).
- Delete order: 404 -> system 403 -> `ROLE_HAS_EMPLOYEES` -> `ROLE_HAS_INACTIVE_EMPLOYEES` (TEST-8, was a 500) -> `ROLE_IN_APPROVAL_CHAIN`.
- Approval-chain check (BR-19): any `approval_policies.approval_chain` containing `{role: name}` (jsonb `@>`, active or not) OR an open `approval_requests` (`pending_approval`) with `current_approver_role = name`.
- Screens: list with `roleIds` (super-admin never listed), PATCH label/sortOrder/menuGroup, tick/untick = key grant via the same `applyRoleKeyDiff` as the role page.
- Employees: `assignable-roles`, `PATCH /:id/role`; BR-16 (`ROLE_NOT_ASSIGNABLE` 403) and BR-17 (`LAST_ADMIN` 409, replaces old `LAST_SUPER_ADMIN`) also on `POST /employees` and `PATCH /employees/:id`. Deactivate also LAST_ADMIN-guarded.
- Access log: `GET /setup/access-log` (paginated, `at` as ISO string, actorName joined). Insert-only repo (no update/delete).
- Audit rows (same tx as the write): `role.create`, `role.copy`, `role.rename`, `role.delete`, `role.grants` (before/after key lists + added/removed), `screen.update`, `employee.role`, `employee.deactivate`. Only real changes are logged; a no-op grant diff writes nothing.
- Cache: `invalidateRole` after rename/delete/grants/screen tick; `invalidateActor` after employee role change / update / deactivate.

## Coordinator decisions applied
1. `PATCH /employees/:id` with an unchanged `roleId` skips BR-16/17 and logs nothing.
2. Screen `menuGroup: ""` accepted (no 400). **Deviation:** stored as `""`, not null. `role-admin.test.ts:171` types `menuGroup` as `string` (typecheck fails if the column becomes nullable) and I may not touch tests. So the column stays NOT NULL, `""` = no group, response type stays `string`. Frontend already does `menuGroup ?? ""`, works unchanged. If you want real null: schema + test-writer change request.

## Schema change (outside the listed edit paths, needed)
`backend/src/db/schemas/01_auth.ts`: `roles.created_by` and `role_permissions.granted_by` FKs now `ON DELETE SET NULL`. Reason: the test's cleanup deletes employees before roles; roles/grants made through the API carry `createdBy`/`grantedBy` = the test admin, so the FK blocked cleanup (beforeAll then failed on every later run). `db:test:prepare` run. **Dev DB not pushed** (no dev env in this worktree): run `bun run db:push` locally.

## Other
- `lib/auth-middleware.ts`: added `SUPER_ADMIN_ROLE_NAME` / `isSuperAdminRoleName`; `loadActor` and the role/employee services use it (the only place the name lives, next to the permission check).
- Transactions are opened in services (`db.transaction`) with `tx` passed to repositories via `repository/executor.ts` (`DbExecutor`), same pattern as `prService`/`approvalService`.
- `employee create` is not logged (BR-20 does not list it).
- Not touched: routes/end-points, frontend, tests, legacy `/pages*`, `/permissions`, `/roles/:roleId/permissions` (S7).

## Full `bun test`
- BR-AUTH-11 remainder (known): `approvalRepository.ts:394`, `lib/token.ts` role literals.
- `pr-cancel.test.ts` (BR-PR-39..47): 24 red, feature not built (`PR_CANCEL_REASON_REQUIRED` exists nowhere in src). Not from S6.
- `scripts/bootstrap-admin.test.ts` failed once in a full run ("scratch schema push failed"), passes alone (16/16); looks like parallel runs on the shared docker DB.

## Map updates (docs/modules/auth-setup.md)
- New files: `repository/{authAuditRepository,screenRepository,executor}.ts`, `service/authAuditService.ts`. `permissionService` exports `applyRoleKeyDiff` / `assertKeysGrantable` / `assertRoleGrantsEditable`; `pageService` now also owns screens.
- Endpoints (all under `/api/setup`): roles `copy`, `grants` GET/POST; `screens` GET, PATCH `/:key`, POST `/:key/roles`; `employees/assignable-roles`, PATCH `/employees/:id/role`; `GET /access-log`.
- Error codes: `SYSTEM_ROLE_PROTECTED`, `ROLE_HAS_EMPLOYEES`, `ROLE_HAS_INACTIVE_EMPLOYEES`, `ROLE_IN_APPROVAL_CHAIN`, `LAST_ADMIN`, `KEY_NOT_GRANTABLE`, `UNKNOWN_KEY`, `SCREEN_HAS_NO_KEY`, `ROLE_NOT_ASSIGNABLE`.
- Traps:
  - Drizzle strips the table name from columns inside `sql` templates in a single-table select: `${roles.id}` in a correlated subquery became `"id"` and matched `employees.id`. Write `"roles"."id"` literally.
  - Any FK to `employees` without `set null` blocks test cleanup (tests delete employees before roles).
  - `screens.menu_group` is NOT NULL; `""` means no group.
  - Role writes check "exists (404) -> system (403) -> state (400/409)"; the super-admin role is identified by name via `isSuperAdminRoleName`.
