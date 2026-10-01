---
module: auth-setup
spec: docs/specs/auth-setup.md (frozen)
last_verified_commit: eea4fb1
last_verified_on: 2026-09-29
depends_on: []
---

# Auth & Setup (RBAC) — as-built map

> What the code **is** (the spec says what it **should be**). Agents read this before touching the module
> and only explore code changed since `last_verified_commit`
> (`git diff eea4fb1..HEAD --stat -- backend/src/lib backend/src/routes/auth.ts backend/src/routes/setup.ts backend/src/service/authService.ts backend/src/service/employeeService.ts backend/src/service/roleService.ts backend/src/db/schemas/01_auth.ts frontend/proxy.ts frontend/src/lib/api/auth frontend/src/lib/api/setup frontend/src/components/pages/setup`).
> Use symbol names, not line numbers — lines rot.

## Summary
Email/password JWT login for desk workers. Access is decided by **permission keys** (`<module>.<action>`)
that code defines and the DB maps to roles. The token holds only `userId` + `userName`; the server loads
the caller (role, keys) on every request, so changes apply on the next request. `super-admin` bypasses
every check. Setup lets admins manage employees, roles, grants, screens and read an access log. Operator QR
login is still not built (token issuing exists, no login route).

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| schema | `backend/src/db/schemas/01_auth.ts` | `roles`, `modules`, `permissions`, `rolePermissions`, `screens`, `authAuditLog`, `refreshTokens`, `documentNumberCounters` (unrelated numbering) |
| schema | `backend/src/db/schemas/03_hcm.ts` | `employees` (roleId, passwordHash, qrToken, isActive) |
| catalog | `backend/src/lib/permissions.ts` | `PERMISSIONS` (all keys), `PERMISSION_KEYS`, `SCREENS` (registry), `SEED_GRANTS` (per seed role) |
| sync | `backend/src/lib/permissions-sync.ts` | `syncCatalog`, `seedGrants` — run on app start (`index.ts`) and in `db:reset` (which `db:test:prepare` runs) |
| guard | `backend/src/lib/auth-middleware.ts` | `requireAuth`, `requirePermission(key)`, `can(actor,key)`, `loadActor`, `invalidateActor`, `invalidateRole`, `Actor`, `SUPER_ADMIN_ROLE_NAME` |
| routes contract | `backend/src/lib/route-registry.ts` | `AuthRequirement = public \| any-authenticated \| {type:"permission",key}`; `register()` mounts the guard from the descriptor |
| token | `backend/src/lib/token.ts`, `qr-token.ts`, `rate-limiter.ts` | `TokenPayload{userId,userName}`, `signAccessToken`, `signRefreshToken`, `generateRawQrToken`, `rateLimiter` |
| types | `backend/src/types/auth.types.ts`, `setup.types.ts` | `loginSchema`, employee / role / grant / screen / access-log schemas |
| repository | `backend/src/repository/{auth,employee,role,permission,screen,authAudit,module}Repository.ts` | `getEmployeeRoleById`, `getPermissionKeysByRoleId`, `listScreens` |
| service | `backend/src/service/{auth,employee,role,permission,page,authAudit,module}Service.ts` | `login`, `refresh`, `logout`, `getSessionUser`, `regenerateQr`; `pageService` = screens admin |
| controller / routes | `backend/src/controller/*`, `backend/src/routes/{auth,setup}.ts`, `END_POINTS.auth` / `.setup` | `authRouter`, `setupRouter` |
| bootstrap | `backend/scripts/bootstrap-admin.ts` (`bun run bootstrap-admin`) | creates the first super-admin |
| frontend api | `frontend/src/lib/api/{auth,setup}/{fetchers,queries}.ts`, `setup/error-messages.ts` | `login`, `getMe`, `useMeQuery`, role / grant / screen / access-log hooks |
| frontend session | `frontend/src/lib/auth/token.ts`, `frontend/src/lib/store/auth-session-store.ts` | `setAccessToken` (localStorage + cookie), `useAuthSessionStore` (`permissions`, `screens`, persisted) |
| frontend gating | `frontend/src/hooks/use-can.ts`, `components/common/Can.tsx`, `frontend/proxy.ts`, `components/common/Sidebar.tsx` | `useCan(key)`, `<Can perm>`, `proxy()` (paths from `/auth/me` `screens`), sidebar from `screens` |
| frontend setup UI | `frontend/src/components/views/setup/SetupView.tsx`, `components/pages/setup/{employees,roles,screens,access-log,shared}/*` | tabs: employees / roles / screens / access log; `RoleGrantsEditor`, `EmployeeRoleDialog` |

## Data model
- `roles(id, name unique, isSystem, createdBy, createdAt)` — system roles: `super-admin`, `owner`, `back_office` (seed).
- `permissions(key PK, module, label, description, grantable)` — mirror of `PERMISSIONS`; `setup.roles.manage` is `grantable=false`.
- `role_permissions(roleId, permissionKey, grantedBy, grantedAt)` — PK(roleId, key); cascade on role/key delete. Super-admin has no rows (bypass).
- `screens(key PK, path, permissionKey nullable, label, sortOrder, menuGroup)` — code owns `key/path/permissionKey`; UI owns `label/sortOrder/menuGroup` (sync never overwrites). `permissionKey` null = any signed-in user.
- `auth_audit_log(id, actorId, action, target, before jsonb, after jsonb, at)` — insert-only; indexes on `(at desc, id desc)` and `actorId`.
- `refreshTokens(employeeId, tokenHash unique, expiresAt)` — only a SHA-256 hash of the refresh JWT; each token unique (jti).
- `employees(... email unique nullable, passwordHash nullable, qrToken nullable, roleId, isActive)` — `qrToken` is a `Bun.password.hash` digest; raw value shown once.
- `modules(id, name)` — kept, listed by `GET /setup/modules`.
- Removed in S7: `pages`, `role_pages`, `seed_page_access.sql`.

## Permission keys (from `PERMISSIONS`)
| Module | Keys |
|---|---|
| setup | `setup.roles.manage` (not grantable), `setup.employees.manage` |
| other | `employees.directory.view`, `asset.manage`, `inventory.adjust`, `inventory.view`, `supplier.view`, `supplier.manage` |
| pr / po | `pr.manage`, `pr.link_machine`, `po.manage` |
| grn | `grn.view`, `grn.edit_draft`, `grn.qa_decide`, `grn.qa_bypass`, `grn.correct`, `grn.over_receipt_override` |
| approval | `approval.policy.view`, `approval.policy.manage`, `approval.view_all`, `approval.view_others_pending`, `approval.auto_approve_own` |
| sco | `sco.view`, `sco.manage`, `sco.close`, `sco.issue_receive`, `sco.qa_decide`, `sco.loss_override` |
New key = add to `PERMISSIONS`, use it in a route descriptor, add to `SEED_GRANTS` if a seed role needs it.

## API
| Method | Path | Guard | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | public, rate-limited 10 / 15 min (429) | Email + password → access token + refresh cookie |
| POST | `/api/auth/refresh` | public (refresh cookie) | Atomic single-use rotation |
| POST | `/api/auth/logout` | public (refresh cookie) | Revoke refresh token |
| GET | `/api/auth/me` | any signed-in | `{id,name,email,role,isSuperAdmin,permissions[],screens[]}` (login returns the same user shape) |
| GET/POST/PATCH/DELETE | `/api/setup/employees*`, `/employees/:id/qr` | `setup.employees.manage` | Employee CRUD + QR regenerate |
| GET | `/api/setup/employees/assignable-roles` | `setup.employees.manage` | Roles the caller may assign |
| PATCH | `/api/setup/employees/:id/role` | `setup.employees.manage` | Set the one role |
| GET/POST/PATCH/DELETE | `/api/setup/roles*` | `setup.roles.manage` | Role CRUD (list has `keyCount`, `employeeCount`) |
| POST | `/api/setup/roles/:id/copy` | `setup.roles.manage` | Copy a role with its keys |
| GET/POST | `/api/setup/roles/:id/grants` | `setup.roles.manage` | Catalog with `granted` flags / apply added-removed diff |
| GET/PATCH | `/api/setup/screens`, `/screens/:key` | `setup.roles.manage` | List / edit label, order, menu group |
| POST | `/api/setup/screens/:key/roles` | `setup.roles.manage` | Tick roles = grant the screen's key |
| GET | `/api/setup/access-log` | `setup.roles.manage` | Paginated log, `sortBy=at` |
| GET | `/api/setup/modules` | `setup.roles.manage` | Module list |
`/auth/register` is retired. Full shapes: `cd backend && bun run contract:query "<METHOD /path>"`.

## Key flows
- **Every request:** `requireAuth` verifies the Bearer token (bad → 401) → `loadActor(userId)` (cache ≈2 s; missing or inactive → 401) → sets `user` + `actor`. `requirePermission(key)` then checks `can()`; missing → 403 `PERMISSION_DENIED` with the key. 401 always comes before 403. Super-admin gets every key.
- **Invalidation:** every setup write calls `invalidateActor(employeeId)` or `invalidateRole(roleId)`; changes hit the next request without re-login.
- **Service checks:** services take the `actor` and call `can()` (e.g. `grn.over_receipt_override`, `approval.view_all`, `approval.view_others_pending`). No role-name checks (BR-AUTH-11).
- **login:** `loginSchema` → `authService.login` (active employee, `Bun.password.verify`, same error for every failure) → access + refresh tokens (`userId`, `userName`), refresh hash stored → cookie → `{accessToken, user}` via `getSessionUser` (screens filtered by the caller's keys).
- **refresh:** verify cookie JWT → delete the stored hash and issue the next one in one atomic step (reuse fails) → active employee check → new tokens. Deactivation, password change and method change revoke all refresh tokens.
- **Grants:** `permissionService` validates keys (`UNKNOWN_KEY`, `KEY_NOT_GRANTABLE`), applies the diff in one transaction with a row lock, logs before/after, calls `invalidateRole`.
- **Employee edits:** non-super-admin callers cannot edit, deactivate or QR-regenerate a super-admin, or assign a role holding keys they lack (`ROLE_NOT_ASSIGNABLE`). Last active super-admin check runs inside the transaction (`LAST_ADMIN`). Create / edit / QR events are logged without secrets.
- **Role guardrails:** `SYSTEM_ROLE_PROTECTED`, `ROLE_HAS_EMPLOYEES`, `ROLE_HAS_INACTIVE_EMPLOYEES`, `ROLE_IN_APPROVAL_CHAIN` (delete / rename blocked while in use).
- **Screens:** `screens` rows come from `SCREENS`; `SCREEN_HAS_NO_KEY` when a tick targets a screen with a null key.
- **Frontend:** `/auth/me` fills the store (`permissions`, `screens`, `isSuperAdmin`). `proxy.ts` calls `/auth/me` per navigation and allows paths in `screens`; sidebar renders `screens`; buttons use `useCan` / `<Can>`. Role names never appear in UI gates.
- **Bootstrap:** `bun run bootstrap-admin` creates the first super-admin (known-defects BR-KD-17..29).

## Invariants & gotchas
- Role names live only in seed data; a CI literal scan (`no-role-names.test.ts`) fails on any other (BR-AUTH-11). The only name check is `isSuperAdminRoleName`.
- Access tokens are not revocable, but they carry no rights; the actor is re-read per request, so deactivation / role change is felt within the cache window.
- The actor cache is in-process (one Bun process). Two instances would need a shared invalidation (SEC-8).
- `employeeSchema` always returns `qrToken: null`; only `POST /employees/:id/qr` returns the raw value, once.
- Schema reaches DBs by `db:push` (no migrations, BL-011). `role_pages` has no drop migration (SEC-12).
- **Stale test DB:** a DB created before S7 still has `pages` / `role_pages`; drop them (or recreate the DB) before `bun run db:test:prepare`, else push / prepare fails.
- `proxy.ts` `PUBLIC_PATHS` = `/`, `/login`; each protected navigation costs one `/auth/me` call.
- No login path for QR-token employees; `POST /auth/login` is email + password only.

## Tests
| File | Covers |
|---|---|
| `lib/permissions.test.ts` | BR-AUTH-06 catalog, BR-21 seed grants = spec table, BR-24 deny by default |
| `lib/permissions-sync.test.ts` | BR-AUTH-06 `syncCatalog`, BR-21/24 `seedGrants` |
| `lib/no-role-names.test.ts` | BR-AUTH-11 literal scan; access follows keys |
| `routes/permission-enforcement.test.ts` | BR-09 check on every action, BR-10 every route declares a key, BR-12 no re-login, BR-18, BR-24, BR-01/02 |
| `routes/permissions-matrix.test.ts` | BR-21 seed role x route allow / deny |
| `routes/role-admin.test.ts` | BR-07, 08, 15, 16, 17, 18, 19, 20, 25 |
| `routes/employee-security.test.ts` | BR-16 edits, BR-20 no secrets, BR-05 refresh tokens, BR-13 login / me shape, BR-19 |
| `routes/employee-last-admin-race.test.ts` | BR-17 under concurrency |
| `routes/auth.test.ts` | BR-03 identical failures, BR-04 rate limit, BR-05 single-use refresh, BR-23 401 before 403 |
| `service/authService.test.ts` | BR-01/02 refresh reads DB, inactive cannot refresh |
| `routes/pr-machine.test.ts` | BR-26 `pr.link_machine` |
| `backend/tests/scripts/bootstrap-admin.test.ts` | BR-KD-17..29 |
| `app.test.ts`, `lib/route-registry.test.ts` | 401 / 403 mapping, descriptor guard mounting |

## Known gaps / debt
- Operator QR login has no route (BL-017); `regenerateQr` still issues a credential to password-method employees (SEC-11).
- SEC-8 actor cache is per process; SEC-10 refresh racing a password reset by a few ms can keep a session; SEC-12 no `role_pages` drop migration.
- Minor structure / perf: CR-6, PERF-3, PERF-6..9, PERF-11, PERF-12 (`.pipeline/m1/findings.md`, backlog ids being added).
- Approval chains store role **names** as text (rename guarded by `ROLE_IN_APPROVAL_CHAIN`); move to role ids is an approval-spec change.

## History
| Date | PR / commit | Change |
|---|---|---|
| 2026-09-27 | 0a406f4 | Map created from as-built code (no prior spec) |
| 2026-09-29 | work/m1 0a406f4..eea4fb1 | permission layer S1–S7 built (auth-setup v9): keys, screens, role admin, guardrails, audit log; role_pages/requireRole removed |
