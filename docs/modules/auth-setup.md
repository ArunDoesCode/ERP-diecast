---
module: auth-setup
spec: none yet
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
  row → re-sign both tokens with the *same* payload carried over from the old JWT (roles/
  pages are not re-fetched from DB on refresh — see gotchas) → store new refresh hash → set
  new cookie.
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
- `refresh` does **not** re-query the DB for the employee's current role/pages — it reuses
  the payload embedded in the old (still-valid) refresh JWT. If an admin changes a user's
  role or page grants, that user's `allowedPages`/`role` won't change until they log out and
  back in (or until the refresh JWT itself expires), not on the next silent refresh.
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
- Refresh does not refresh RBAC state from DB (see gotchas) — stale `allowedPages`/`role`
  can persist across a role change until re-login.
- No automated tests found for auth or setup modules on either side.

## History
| Date | PR / commit | Change |
|---|---|---|
| 2026-09-27 | 0a406f4 | Map created from as-built code (no prior spec) |
