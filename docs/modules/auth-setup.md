---
module: auth-setup
spec: docs/specs/auth-setup.md (draft v3)
last_verified_commit: 0a406f4
last_verified_on: 2026-09-27
depends_on: []
---

# Auth & Setup (RBAC) — as-built map

> What the code **is** (the spec says what it **should be**). Agents read this before touching the module
> and only explore code changed since `last_verified_commit`
> (`git diff 0a406f4..HEAD --stat -- backend/src/routes/auth.ts backend/src/routes/setup.ts backend/src/service/authService.ts backend/src/db/schemas/01_auth.ts backend/src/db/schemas/03_hcm.ts frontend/proxy.ts frontend/src/lib/api/auth frontend/src/lib/api/setup`).
> Use symbol names, not line numbers — lines rot.

## Summary
Full email/password JWT auth for desk workers (owner, back_office, floor_supervisor,
qa_inspector, die_designer, super-admin) plus a schema-only "operator QR" identity that has
no login endpoint yet. RBAC is DB-backed (`roles` → `role_pages` → `pages`), baked into the
JWT as `allowedPages: string[]` at login/refresh time, and enforced both server-side
(`requireRole`) and client-side (Next.js `proxy.ts` path gating + sidebar rendering). The
`setup` module (employees/roles/pages/permissions) is a full CRUD admin surface, super-admin
only, both backend and frontend. Maturity: auth + RBAC + setup CRUD = full; operator QR login
= half-built (token generation exists, no login route consumes it).

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| schema | `backend/src/db/schemas/01_auth.ts` | `roles`, `modules`, `pages`, `rolePages`, `refreshTokens`, `documentNumberCounters` |
| schema | `backend/src/db/schemas/03_hcm.ts` | `employees` (roleId FK, passwordHash, qrToken, isActive) |
| types | `backend/src/types/auth.types.ts` | `loginSchema`, `registerSchema` |
| types | `backend/src/types/setup.types.ts` | `employeeSchema`, `employeeInputSchema`, `employeeUpdateSchema`, `employeeQrTokenSchema`, `roleSchema`, `roleInputSchema`, `roleUpdateSchema`, `pageSchema`, `pageInputSchema`, `pageUpdateSchema`, `rolePageSchema`, `rolePermissionDiffSchema` |
| repository | `backend/src/repository/authRepository.ts`, `employeeRepository.ts`, `roleRepository.ts`, `pageRepository.ts`, `permissionRepository.ts`, `moduleRepository.ts` | `getEmployeeWithRoleByEmail`, `getPagesByRoleId`, `applyDiff` |
| service | `backend/src/service/authService.ts`, `employeeService.ts`, `roleService.ts`, `pageService.ts`, `permissionService.ts`, `moduleService.ts` | `login`, `refresh`, `logout`, `regenerateQr` |
| controller | `backend/src/controller/authController.ts`, `employeeController.ts`, `roleController.ts`, `pageController.ts`, `permissionController.ts`, `moduleController.ts` | thin, parse + call service |
| routes | `backend/src/routes/auth.ts`, `backend/src/routes/setup.ts` + `END_POINTS.auth` / `END_POINTS.setup` | `authRouter`, `setupRouter` |
| lib | `backend/src/lib/token.ts`, `auth-middleware.ts`, `qr-token.ts` | `Role`, `TokenPayload`, `signAccessToken`, `verifyAccessToken`, `requireAuth`, `requireRole`, `generateRawQrToken` |
| frontend api | `frontend/src/lib/api/auth/{fetchers,queries}.ts`, `frontend/src/lib/api/setup/{fetchers,queries}.ts` | `login`, `getMe`, `logout`, `useLoginMutation`, `useMeQuery`, `getEmployees`, `getRoles`, `getPages`, `getPermissionGrants`, `updateRolePermissions` |
| frontend auth core | `frontend/src/lib/auth/token.ts`, `frontend/src/lib/store/auth-session-store.ts` | `setAccessToken`/`decodeAccessToken` (localStorage + mirrored cookie), `useAuthSessionStore` (Zustand, persisted) |
| frontend gating | `frontend/proxy.ts` | `proxy()` (Next 16 middleware replacement), `isPathAllowed`, `fetchAllowedPages` (calls `GET /auth/me`) |
| frontend ui | `frontend/src/app/(protected)/setup/{page,approval/page}.tsx`, `frontend/src/components/views/setup/SetupView.tsx`, `frontend/src/components/pages/setup/{employees,roles,pages,permissions,shared}/*`, `frontend/src/components/common/Sidebar.tsx` | `SetupView` (tabs: employees/roles/pages/permissions), `NavSidebar` |

## Data model
- `roles(id, name unique, isSystem, createdBy, createdAt)` — `isSystem=true` seeds (e.g.
  super-admin/owner/back_office) are protected from update/delete in `roleService`.
- `modules(id, name unique)` — grouping for pages (e.g. "Procurement").
- `pages(id, key unique, label, path, sortOrder, moduleId → modules.id)` — `key` is immutable
  after creation (`pageUpdateSchema` omits it); `path` is what the frontend matches against
  the URL.
- `rolePages(id, roleId → roles.id, pageId → pages.id, unique(roleId,pageId))` — the actual
  permission grant table; cascade deletes on role/page removal.
- `refreshTokens(id, employeeId → employees.id, tokenHash unique, expiresAt, createdBy,
  createdAt)` — only a SHA-256 hash of the refresh JWT is stored, never the raw token.
- `employees(id, name, email unique nullable, passwordHash nullable, phone, qrToken unique
  nullable, roleId → roles.id, dailyRatePaise, isActive, createdBy, createdAt, lastUpdatedBy,
  lastUpdatedAt)` — `email`/`passwordHash` null for QR-only operators; `qrToken` stores a
  `Bun.password.hash()` digest of the raw QR token, never the raw value.
- `documentNumberCounters` — unrelated numbering series table that happens to live in this
  schema file (per-period document numbering for PR/PO/etc.), not part of auth/RBAC proper.

## API
| Method | Path | Roles | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | super-admin, owner | Create a desk-worker (email/password) employee |
| POST | `/api/auth/login` | public (rate-limited 10/15min) | Email+password login → access token + refresh cookie |
| POST | `/api/auth/refresh` | public (needs refresh cookie) | Rotate refresh token, issue new access token |
| POST | `/api/auth/logout` | public (needs refresh cookie) | Revoke refresh token, clear cookie |
| GET | `/api/auth/me` | any authenticated | Return JWT payload (`userId`, `userName`, `role`, `allowedPages`) |
| GET/POST/PATCH/DELETE | `/api/setup/employees*`, `/api/setup/employees/:id/qr` | super-admin | Employee CRUD + QR-token regeneration |
| GET/POST/PATCH/DELETE | `/api/setup/roles*` | super-admin | Role CRUD (system roles protected) |
| GET/POST/PATCH/DELETE | `/api/setup/pages*` | super-admin | Page CRUD |
| GET | `/api/setup/permissions` | super-admin | List all `role_pages` grants |
| POST | `/api/setup/roles/:roleId/permissions` | super-admin | Apply `{added[], deleted[]}` diff per module |
| GET | `/api/setup/modules` | super-admin | List modules (unpaginated reference data) |
Full shapes: `cd backend && bun run contract:query "<METHOD /path>"`.

## Key flows
- `login`: `authController.login` parses `loginSchema` → `authService.login` →
  `authRepository.getEmployeeWithRoleByEmail` (joins `roles`, requires `isActive=true`) →
  `Bun.password.verify` → `authRepository.getPagesByRoleId` (join `pages`↔`role_pages`,
  ordered by `sortOrder`) → builds `TokenPayload{userId,userName,role,allowedPages}` →
  `signAccessToken` + `signRefreshToken` → stores SHA-256 hash of refresh token in
  `refreshTokens` → controller sets refresh cookie (`setRefreshCookie`, `lib/http.ts`) and
  returns `{accessToken, user}`.
- `refresh`: reads refresh cookie → `verifyRefreshToken` → look up stored hash → delete old
  row → `authRepository.getActiveEmployeeWithRoleById` (401 if missing/inactive) → re-sign
  both tokens with the employee's *current* name, role and `getPagesByRoleId` pages → store
  new refresh hash → set new cookie (BL-018, `authService.test.ts`).
- `requireAuth`/`requireRole`: every protected Hono router does
  `router.use("*", requireAuth, requireRole(...))` (see `setupRouter`) or applies both
  per-route (see `authRouter.register`). `requireAuth` verifies the Bearer access token and
  sets `c.set("user", payload)`; `requireRole` checks `payload.role` against an allow-list.
- `updateForRole` (permissions): `permissionController.updateForRole` parses
  `rolePermissionDiffSchema` (a per-module `{added:number[], deleted:number[]}` map) →
  `permissionService.updateForRole` validates the role exists, validates all `added` page ids
  exist (`pageRepository.findExistingIds`) → `permissionRepository.applyDiff` runs an
  `onConflictDoNothing` insert for adds + a scoped delete for removals inside one transaction
  → returns the role's fresh grant list.
- QR token issuance: `employeeService.create`/`update`/`regenerateQr` call
  `generateRawQrToken()` (64-hex crypto-random) and persist only `Bun.password.hash(raw)`;
  the raw value is returned once in the response (`employeeQrTokenSchema`) and never stored
  or retrievable again.
- Frontend page gating: `frontend/proxy.ts` runs on every non-public path, reads the
  `access_token` cookie (mirrored from localStorage by `setAccessToken`), calls backend
  `GET /auth/me` to get live `allowedPages`, and redirects to `/login` (no token / me fails)
  or `/` (path not in `allowedPages`, via `isPathAllowed` prefix-matching on normalized
  paths). `NavSidebar` independently renders nav links from the Zustand-persisted
  `allowedPages` (set from the JWT at login, refreshed by `useMeQuery`), deduped/normalized
  via `normalizeAllowedPath`/`formatPageTitle` (`lib/path-utils`).
- Setup UI: `SetupView` is a tabbed shell (`employees`/`roles`/`pages`/`permissions`, tab
  state in the URL via `nuqs`) rendering `EmployeesTab`/`RolesTab`/`PagesTab`/
  `PermissionsTab`, each backed by its own TanStack Query hooks in `lib/api/setup/queries.ts`
  and a shared `SetupDialog` for create/edit modals. A separate link goes to
  `/setup/approval` (see `approval.md`).

## Invariants & gotchas
- `refresh` re-reads role/pages from the DB (fixed 2026-09-27, BL-018), so a role or page
  grant change applies on the next silent refresh (≤ access-token TTL, default 15 min), and a
  deactivated employee can no longer refresh. Already-issued access tokens stay valid until
  they expire — there is no access-token revocation.
- There is no login path for `operator`/QR-token employees in `backend/src/routes/auth.ts` —
  `POST /api/auth/login` only accepts `loginSchema` (email+password). `qr-token.ts`,
  `employeeService.regenerateQr`, and the `operator` role/enum value all exist, but nothing
  consumes the raw QR token to issue a session. Treat "QR login" as schema/plumbing-only.
- `employeeSchema` always serializes `qrToken` as `z.null()` regardless of whether one is
  set — the real digest is never returned; only `POST /employees/:id/qr` returns the raw
  value, once.
- Role protection: `roleService.update`/`.remove` throw `ForbiddenError
  ("SYSTEM_ROLE_PROTECTED")` for `isSystem=true` roles, and `.remove` also throws
  `ConflictError("ROLE_HAS_EMPLOYEES")` if active employees still reference the role.
- `pages.key` is immutable post-creation (`pageUpdateSchema.omit({key:true})`); only
  `label`/`path`/`sortOrder`/`moduleId` are patchable.
- `proxy.ts`'s `PUBLIC_PATHS` is only `["/", "/login"]` — any other path always requires a
  valid access-token cookie + a live `/auth/me` call; there is no offline/cached fallback, so
  every protected navigation costs one backend round-trip in addition to the browser's own
  data fetching.
- Setup routes are gated to `super-admin` only (`SETUP_AUTH` in `routes/setup.ts`) — `owner`
  cannot manage employees/roles/pages/permissions despite being a desk-worker role that can
  register other employees.

## Tests
| File | Covers |
|---|---|
| (none found under `backend/src/**` for auth/setup) | — |

## Known gaps / debt
- Operator QR login has no backend route — token generation/storage exists but is unusable
  end-to-end (see gotchas above).
- `authService.ts` still uses some ad-hoc error paths rather than exclusively `AppError`
  subclasses in a couple of spots noted by backend `CLAUDE.md` as pre-existing debt; not
  re-verified line-by-line here.
- Auth tests: `backend/src/service/authService.test.ts` (refresh re-reads RBAC, BL-018) and
  `backend/src/app.test.ts` (401/403 mapping). Setup module still has none.

## Current RBAC map
Verified 2026-09-29 (grep on `work/m1`). Spec: `docs/specs/auth-setup.md` v3. Verdict: roles are DB rows, but
**access is decided by role names written in code**, so a role created in Setup can do nothing.
| Layer | Where | Data or hard-coded | Gap (spec rule) |
|---|---|---|---|
| Token | `lib/token.ts` `Role` union (7 names), `TokenPayload{userId,userName,role,allowedPages}` | hard-coded | new role unknown to types; `roleName as Role` casts in `authService` (BR-07) |
| API guard | `lib/auth-middleware.ts` `requireRole(...roles)` — 18 calls across `routes/{asset,setup,auth,grn,pr,po,approval,supplier}.ts` | hard-coded | BR-09/10/11 |
| Route contract | `lib/route-registry.ts` `AuthRequirement = public \| any-authenticated \| {type:"roles"}`; same lists again in descriptors (`GRN_DRAFT_AUTH`, `GRN_QA_AUTH`, `GRN_READ_AUTH`… in `routes/grn.ts`) | hard-coded, twice | two copies can drift (BR-10) |
| Services | `grnService` `OVER_RECEIPT_OVERRIDE_ROLES`; `approvalService` `isPrivilegedApprovalReader` + `actorRole !== "super-admin"`; `employeeService` `assertNotLastActiveSuperAdmin` | hard-coded | BR-11, BR-17 keyed on a name |
| Screens | `pages` + `role_pages` → `allowedPages` in JWT → `proxy.ts` `isPathAllowed` + `NavSidebar` | data | not linked to API grants (BR-15) |
| Frontend buttons | `lib/grn-permissions.ts` (5 lists, hand copy of backend); `role !== "floor_supervisor"` in `PurchaseOrdersView`, `PurchaseOrderDetailView` (×2), `PurchaseOrderTrackingCards`; `isFloorSupervisor` in `PurchaseRequisitionsView` → `PurchaseRequisitionModals` | hard-coded | BR-13; `!== "floor_supervisor"` is a deny-list, so qa/dd/new roles see PO buttons, then get 403 |
| Setup | `/setup/*` = super-admin only (`SETUP_AUTH`); `roleService` protects `isSystem`, blocks delete with employees | mixed | no audit (BR-20), no escalation guard on register (BL-024, BR-16) |
| Approval | `approvalChain[].role`, `approval_requests.current_approver_role` store role **names** as text | data (by name) | rename breaks open requests (BR-19) |
| Session | refresh re-reads role + pages (BL-018); access token trusted for ≤15 min | — | revoke/deactivate not immediate (BR-12) |
Likely live bug (not run): PR modal loads `useMachinesQuery` for fs, but `/asset` is sa/bo only → spec BR-26 (`pr.link_machine`).

## ERP benchmark (with links)
| ERP | Model | Take for us |
|---|---|---|
| ERPNext | Role = record; Role Permission Manager grants per document type × role: read, write, create, submit, cancel, amend, report, export…; field groups by "perm level" 0–9; User Permissions restrict to specific records; Role Profiles bundle roles. [role-based permissions](https://docs.frappe.io/erpnext/user/manual/en/role-based-permissions), [role & role profile](https://docs.frappe.io/erpnext/user/manual/en/role-and-role-profile), [users & permissions](https://docs.frappe.io/erpnext/user/manual/en/users-and-permissions) | admin maps fixed rights to roles; record/field rules are a later layer |
| Odoo | Groups hold users; `ir.model.access` = CRUD per model per group; `ir.rule` = record filters; groups imply groups (User → Manager); access is the union of groups; menus/views filtered by the same groups. [security reference](https://www.odoo.com/documentation/19.0/developer/reference/backend/security.html), [access rights](https://www.odoo.com/documentation/19.0/applications/general/users/access_rights.html) | UI and API read one grant set; model check + record check both must pass |
| SAP Business One | General Authorizations tree per form/function: Full / Read-only / None; set per user or user group; new non-superuser has **no** rights; Superuser flag bypasses all; data-ownership rules for records. [How to Define Authorizations 10.0 (PDF)](https://help.sap.com/doc/04688cec5620478ea24be266ce0a1eda/10.0/en-US/c30f04de51bb4a6b810537a8e6a278d1.pdf), [SAP Learning](https://learning.sap.com/courses/implementing-sap-business-one/defining-general-authorizations) | deny by default (BR-24); superuser bypass adopted for super-admin (Q4=B, BR-18) — kept safe by few holders, last-admin guard (BR-17) and the access log (BR-20) |
| Dynamics 365 F&O | Permissions (menu items, tables) → Privileges (a task, e.g. "cancel payments") → Duties (part of a process) → Roles; users get roles; no role = no access; roles can inherit child roles; segregation-of-duties rules; data security policies. [role-based security](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/sysadmin/role-based-security) | our key = D365 "privilege" (a task, not a table); duties/inheritance not needed at our size |
| NetSuite | Per-permission level None / View / Create / Edit / Full; standard roles can't be edited, you copy ("customize") them; System Notes log every role/permission change with old/new value, plus a login audit trail. [access levels](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N326341.html), [system notes](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/chapter_158644279544.html) | copy role (BR-25); before/after log (BR-20); login audit = later |
**Common pattern:** code owns the list of checkable rights; admins only map rights → roles in a screen; checks are
deny-by-default; UI hides, server decides; every change is logged. **Adapted:** action keys `<module>.<action>` (our
routes are actions like `qa_decide`, `correct`, not table CRUD), one role per person, no inheritance, no record rules yet.

## Proposed auth layer
**Backend**
- Catalog `backend/src/lib/permissions.ts`: `export const PERMISSIONS = { "grn.qa_decide": { module: "grn", label, description }, … } as const`;
  `type PermissionKey = keyof typeof PERMISSIONS`. The only place keys are born (BR-06). `setup.roles.manage` carries
  `grantable: false`; the grant API rejects it with 400 `KEY_NOT_GRANTABLE` (BR-07). No `auth.register` key.
- Screen catalog `backend/src/lib/screens.ts`: `SCREENS = { "grn": { path: "/grn", defaultLabel, module, permission: "grn.view" }, … }`.
  Synced to `pages` on startup/seed: code owns `key`, `path`, `permission_key`; the UI owns `label`, `sortOrder`, `moduleId` (menu group),
  which sync never overwrites. Screens gone from code are deleted + logged. CI test: every `frontend/src/app/(protected)` page has a
  `SCREENS` entry and every entry has a page (same idea as `API_ROUTES`). Page create/delete endpoints go away; PATCH keeps label/order/group only (BR-06, 15).
- Tables (`01_auth.ts`): `permissions(key PK, module, label, description, grantable)` synced from the catalog on startup/seed
  (insert new, update labels, delete removed + log); `role_permissions(role_id FK cascade, permission_key FK, granted_by, granted_at, PK(role_id, permission_key))`;
  `pages.permission_key` (FK, not null) replaces `role_pages`; `auth_audit_log(id, at, actor_id, action, role_id, employee_id, before jsonb, after jsonb)` insert-only;
  `roles` gains `description`, `is_super_admin` (true on exactly one seeded system row), `last_updated_by/at`.
- `lib/authz.ts`: `loadActor(employeeId)` → `{ employeeId, roleId, roleName, isActive, isSuperAdmin, permissions: Set<PermissionKey> }` from an
  in-memory cache (Map by employee + by role), cleared by every setup write (one Bun process today; move to a
  version counter in DB if we ever run two). For super-admin, `permissions` = every catalog key. `can(actor, key)` returns
  true if `actor.isSuperAdmin`, else set lookup — the one allowed super-admin check (BR-11, 18). `assertCan(actor, key)` → 403 `PERMISSION_DENIED {key}`.
- Retire `POST /auth/register`: delete route, `registerSchema`, `authService.register`; Setup → Employees is the only create path,
  BL-004 bootstrap script the only way to seed the first super-admin. Closes BL-024.
- PR machine lookup (BR-26): read-only `GET /pr/machines` (id, code, name, active only) guarded by `pr.link_machine`; `/asset` stays `asset.manage`.
  PR create/update rejects `machineId` without `pr.link_machine`.
- Middleware: `requireAuth` verifies the token (401) then sets `c.set("actor", await loadActor(id))`, 401 if inactive (BR-12, 23).
  `requirePermission(key)` replaces `requireRole`.
- Route registry: `AuthRequirement = public | any-authenticated | { type: "permission"; key: PermissionKey }`;
  `register()` mounts the guard **from the descriptor**, so each route states its key once; manifest shows the key.
- Services take `actor` and call `can()` — `OVER_RECEIPT_OVERRIDE_ROLES` → `grn.over_receipt_override`,
  `isPrivilegedApprovalReader` → `approval.view_all`, `actorRole !== "super-admin"` → `can(actor, "approval.view_others_pending")`,
  last-admin → count of active employees whose role has `is_super_admin` (BR-17).
- Token shrinks to `{ userId, userName }`; `/auth/me` and login return `{ role, permissions, screens }`.

**Frontend**
- `usePermissions()` (from `useMeQuery`), `useCan(key)`, `<Can perm="grn.correct">…</Can>`; `PermissionKey` type from a
  file generated by `contract:generate` (`.contracts/permissions.json`), checked in CI like `API_ROUTES`.
- Delete `grn-permissions.ts` lists and all `floor_supervisor` checks; `proxy.ts` + `NavSidebar` use `screens`
  (BL-037's per-navigation `/auth/me` call becomes intended: it is how BR-12 reaches the UI).

**Admin screens (Setup, super-admin only except Employees)**: Roles = list with user count; role page = checkbox grid grouped by
module (label, description, key), "Copy role" (not on super-admin), save shows +/- diff to confirm; super-admin row shows
"all access", no grid. Screens = list from `SCREENS`; edit label, order, menu group; "Roles who see it" ticks grant/revoke the
screen's key (BR-15); no add/delete. Employees = one role dropdown listing only roles the actor may assign (BR-16); read-only "Access log" tab.

**Migration — each step is one commit on the working branch, all in one PR; no step changes behaviour**
1. Parity test first (test-writer): fixture of seed role × route → allow/deny taken from today's `requireRole` lists (BR-21),
   with the three intended differences as explicit expected changes (sa over-receipt, register gone, fs machine lookup).
2. Add permission + screen catalogs, tables, sync, seed grants per the spec table (sa gets none; bypass). Nothing reads them yet.
3. Add `permission` AuthRequirement + `requirePermission`; switch routers one at a time (setup, asset, supplier, pr, po, grn, approval); parity stays green.
4. Replace the 4 service role-name checks with `can()`.
5. Per-request actor + cache + invalidation; token shrinks; `/auth/me` returns keys and screens (BR-12, 13).
6. Frontend `useCan`/`<Can>`; remove role-name checks; sidebar/proxy use `screens`. Print a screen-diff per role vs `role_pages` for sign-off, then drop `role_pages` and the old Permissions tab.
7. Guardrails + log: BR-07/16/17/18/19/24/25 and `auth_audit_log`; new role and screen editor UI; retire `/auth/register`; `GET /pr/machines` (BR-26).
8. Delete `Role` union and `requireRole`; CI test fails on any role-name literal outside seeds (BR-11).
Size: steps 1–4 ≈ one `/feature`, 5–8 ≈ a second. Out of this layer: approval chains storing role id instead of name (approval spec).

## History
| Date | PR / commit | Change |
|---|---|---|
| 2026-09-27 | 0a406f4 | Map created from as-built code (no prior spec) |
| 2026-09-29 | — | Proposed layer updated for spec v3: super-admin bypass, register retired, screen catalog from code, PR machine lookup |
