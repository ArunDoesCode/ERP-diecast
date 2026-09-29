# Auth Permission Layer — explorer input for spec v5 (frozen)

**Date:** 2026-09-29 | **Map base:** docs/modules/auth-setup.md @ 0a406f4 | **Verified against HEAD**

---

## 1. Route Registry: AuthRequirement type & descriptors

**Type definition** — `backend/src/lib/route-registry.ts:4-7`
```typescript
export type AuthRequirement =
  | { type: "public" }
  | { type: "any-authenticated" }
  | { type: "roles"; roles: Role[] };
```

**Descriptor registration** — `backend/src/lib/route-registry.ts:9-42`
- `RouteDescriptor` shape includes `auth: AuthRequirement` field (line 14)
- `register(descriptor)` called immediately after each route definition
- Throws if route already registered (catch duplicates)

**Middleware application**
- `requireAuth` (middleware) — `backend/src/lib/auth-middleware.ts:6-25` verifies Bearer token, sets `c.set("user", payload)`
- `requireRole(...roles)` (middleware) — `backend/src/lib/auth-middleware.ts:27-35` checks `c.get("user").role` against allow-list
- Router setup pattern: `router.use("*", requireAuth, requireRole(...))` applies both globally (see setupRouter in backend/src/routes/setup.ts:46)
- Per-route pattern: both applied individually per route (see authRouter in backend/src/routes/auth.ts:48-50)

**Route-role parity table** (all routes, method + path + current role list)

| Method | Path | Roles |
|--------|------|-------|
| POST | /api/auth/register | super-admin, owner |
| POST | /api/auth/login | public |
| POST | /api/auth/refresh | public |
| POST | /api/auth/logout | public |
| GET | /api/auth/me | any-authenticated |
| GET | /api/setup/modules | super-admin |
| GET | /api/setup/employees | super-admin |
| GET | /api/setup/employees/search | super-admin |
| POST | /api/setup/employees | super-admin |
| PATCH | /api/setup/employees/:id | super-admin |
| DELETE | /api/setup/employees/:id | super-admin |
| POST | /api/setup/employees/:id/qr | super-admin |
| GET | /api/setup/roles | super-admin |
| POST | /api/setup/roles | super-admin |
| PATCH | /api/setup/roles/:id | super-admin |
| DELETE | /api/setup/roles/:id | super-admin |
| GET | /api/setup/pages | super-admin |
| POST | /api/setup/pages | super-admin |
| PATCH | /api/setup/pages/:id | super-admin |
| DELETE | /api/setup/pages/:id | super-admin |
| GET | /api/setup/permissions | super-admin |
| POST | /api/setup/roles/:roleId/permissions | super-admin |
| GET | /api/pr/list | super-admin, owner, floor_supervisor, back_office |
| GET | /api/pr/:id | super-admin, owner, floor_supervisor, back_office |
| POST | /api/pr/create | super-admin, owner, floor_supervisor, back_office |
| PATCH | /api/pr/:id | super-admin, owner, floor_supervisor, back_office |
| DELETE | /api/pr/:id | super-admin, owner, floor_supervisor, back_office |
| GET | /api/po/list | super-admin, owner, back_office |
| GET | /api/po/:id | super-admin, owner, back_office |
| POST | /api/po/create | super-admin, owner, back_office |
| PATCH | /api/po/:id | super-admin, owner, back_office |
| DELETE | /api/po/:id | super-admin, owner, back_office |
| POST | /api/po/:id/send | super-admin, owner, back_office |
| POST | /api/po/:id/reminder | super-admin, owner, back_office |
| POST | /api/po/:id/escalate | super-admin, owner, back_office |
| PATCH | /api/po/:id/delay | super-admin, owner, back_office |
| POST | /api/po/:id/confirm | super-admin, owner, back_office |
| POST | /api/po/:id/invoice | super-admin, owner, back_office |
| POST | /api/po/:id/close | super-admin, owner, back_office |
| GET | /api/grn/list | super-admin, owner, back_office, floor_supervisor, qa_inspector, die_designer |
| GET | /api/grn/:id | super-admin, owner, back_office, floor_supervisor, qa_inspector, die_designer |
| POST | /api/grn/create | super-admin, owner, back_office, floor_supervisor |
| PATCH | /api/grn/:id | super-admin, owner, back_office, floor_supervisor |
| DELETE | /api/grn/:id | super-admin, owner, back_office, floor_supervisor |
| POST | /api/grn/:id/bypass | super-admin, owner, back_office, floor_supervisor |
| POST | /api/grn/:id/qa-action | super-admin, owner, back_office, qa_inspector |
| POST | /api/grn/:id/correction | super-admin, owner, back_office |
| GET | /api/approval/policies | super-admin, owner, back_office |
| GET | /api/approval/policies/:id | super-admin, owner, back_office |
| POST | /api/approval/policies | super-admin |
| PATCH | /api/approval/policies/:id | super-admin |
| POST | /api/approval/requests | any-authenticated |
| GET | /api/approval/requests/:id | any-authenticated |
| GET | /api/approval/requests/:id/trail | any-authenticated |
| POST | /api/approval/requests/:id/action | any-authenticated |

---

## 2. Where c.get("user") / actor role is read in services

| File | Function | Line | Usage |
|------|----------|------|-------|
| backend/src/controller/authController.ts | me | 72 | const user = c.get("user"); return JWT payload |
| backend/src/controller/employeeController.ts | create | 40 | const actorId = Number(c.get("user").userId); |
| backend/src/controller/roleController.ts | create | 31 | const actorId = Number(c.get("user").userId); |
| backend/src/controller/pageController.ts | create | 31 | const actorId = Number(c.get("user").userId); |

**Role type:** Imported from `backend/src/lib/token.ts`; used in `AuthRequirement.roles: Role[]`

---

## 3. Setup module: current roles/pages/permissions endpoints + frontend screens

**Backend endpoints** (all super-admin gated):
- 22 routes in backend/src/routes/setup.ts (lines 48-289)
- Controllers: backend/src/controller/{employee,role,page,permission,module}Controller.ts
- Services: backend/src/service/{employee,role,page,permission,module}Service.ts

**Frontend screens:**
- frontend/src/app/(protected)/setup/page.tsx — SetupView wrapper
- frontend/src/components/views/setup/SetupView.tsx — tabbed shell (employees/roles/pages/permissions tabs)
- frontend/src/components/pages/setup/{employees,roles,pages,permissions,shared}/* — tab implementations & dialogs
- Role creation/edit form: frontend/src/components/pages/setup/roles/RoleForm.tsx (lines 31-102)
- Permission editor: frontend/src/components/pages/setup/permissions/RolePermissionEditor.tsx (lines 31-226)

---

## 4. Frontend: where allowedPages/role are read

| File | Component/Function | Line | Usage |
|-------|-------------------|------|-------|
| frontend/proxy.ts | isPathAllowed | 17-31 | Prefix-match pathname against allowedPages; redirect if no match |
| frontend/proxy.ts | fetchAllowedPages | 33-58 | Call GET /auth/me, extract allowedPages |
| frontend/src/lib/auth/token.ts | decodeAccessToken | 38-51 | Decode JWT, return {userId, role, allowedPages, exp} |
| frontend/src/lib/store/auth-session-store.ts | useAuthSessionStore | 34-110 | Zustand store (persisted to localStorage); holds token/role/allowedPages |
| frontend/src/lib/store/auth-session-store.ts | setToken | 41-63 | Decode token, update store with role + allowedPages |
| frontend/src/lib/store/auth-session-store.ts | setProfile | 65-76 | Update role/allowedPages from profile |
| frontend/src/components/common/Sidebar.tsx | NavSidebar | 31-45 | Read allowedPages from store, render nav menu |
| frontend/src/components/common/Sidebar.tsx | NavSidebar | 52 | Display role in header |

---

## 5. DB schema: roles/pages/role_pages/modules columns + seed

**Schema location:** backend/src/db/schemas/01_auth.ts

| Table | Columns | Notes |
|-------|---------|-------|
| roles | id (PK), name (unique), isSystem (bool, default false), createdBy (FK), createdAt | isSystem flags protected system roles |
| modules | id (PK), name (unique) | Grouping for pages (e.g., "Procurement") |
| pages | id (PK), key (unique), label, path, sortOrder (default 0), moduleId (FK), createdBy, createdAt | key immutable post-create |
| rolePages | id (PK), roleId (FK cascade), pageId (FK cascade), unique(roleId, pageId) | Permission grant join table |

**Seed file:** backend/src/db/seed_page_access.sql

Roles seeded (lines 4-17): super-admin, owner, back_office, floor_supervisor, operator, qa_inspector, die_designer

Pages seeded (lines 26-72): 37 pages (landing, setup, shop-floor-live-view, jobs, suppliers, purchase-orders, grn, inventory, etc.)

Role-page grants (lines 78-149):
- owner: landing, shop-floor-live-view, job-board, pnl-statement, ar-ap, employee-directory, payroll-attendance, machine-health, spare-parts
- back_office: landing, customers, enquiries, quotations, sales-orders, jobs, dispatch-challans, suppliers, purchase-orders, purchase-requisitions, grn, inventory, vendor-bills, customer-invoices, expenses
- floor_supervisor: landing, jobs, step-assignment, scrap-rework, machine-config, die-loading
- operator: operator (PWA page only)
- qa_inspector: landing, inward-inspection, in-process-inspection, trial-run-logs, final-inspection
- die_designer: landing, die-library, die-design-tasks, cnc-machine-programming
- super-admin: all pages (automatic)

---

## Map edits / findings

- **Missing in map:** DB modules table has no is_system column. Assume modules are user-creatable in spec.
- **Map gap:** Seed file defines standard role-page permissions; these become the parity fixture for spec.
- **Gotcha confirmed:** Setup UI is super-admin-only, but PR/PO/GRN/Approval routes allow multiple roles. Spec must clarify permission edit vs. read-only access.
