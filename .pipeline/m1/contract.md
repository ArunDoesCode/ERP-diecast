# m1 contract — S2: permission catalog, screens, tables (interfaces only)

No endpoints in this slice. Nothing reads these yet.

## Code: `backend/src/lib/permissions.ts`
- `PERMISSIONS`: 28 keys (incl. `employees.directory.view`, module employees), each `{ module, label, description, grantable }`. Only `setup.roles.manage` is `grantable: false`.
- `type PermissionKey = keyof typeof PERMISSIONS`; `PERMISSION_KEYS: PermissionKey[]`.
- `SCREENS: Record<screenKey, { path, permission: PermissionKey | null, defaultLabel, defaultOrder, defaultMenuGroup }>`; `type ScreenKey`.
  `permission: null` = any signed-in user.
- `SEED_GRANTS: Record<RoleSeedName, PermissionKey[]>` (`RoleSeedName` = super-admin | owner | back_office | floor_supervisor | qa_inspector | die_designer | operator). super-admin and operator = `[]`.
- Types only (not implemented): `SyncCatalogFn = () => Promise<SyncCatalogResult>` (idempotent catalog -> `permissions` + `screens`; screens sync never overwrites label/sortOrder/menuGroup; removed rows deleted + audit row), `SeedGrantsFn = () => Promise<{ inserted: number }>` (insert-missing only). `SyncCatalogResult = { permissions: {inserted,updated,deleted}, screens: {inserted,updated,deleted} }`.

- Implementations (S2 build): `backend/src/lib/permissions-sync.ts` exports `syncCatalog: SyncCatalogFn` and `seedGrants: SeedGrantsFn`; run on app start and by `bun run db:test:prepare`.

## Tables: `backend/src/db/schemas/01_auth.ts`
| Table | Columns |
|---|---|
| `permissions` | `key` text PK, `module`, `label`, `description` (all not null), `grantable` bool default true |
| `role_permissions` | `role_id` FK roles cascade, `permission_key` FK permissions cascade, `granted_by` FK employees null, `granted_at`; PK (role_id, permission_key) |
| `screens` | `key` text PK, `path`, `permission_key` FK permissions (null ok, set null on delete), `label`, `sort_order` int, `menu_group` |
| `auth_audit_log` | `id` serial PK, `actor_id` FK employees null, `action`, `target`, `before` jsonb, `after` jsonb, `at` |
Old `pages` / `role_pages` untouched (retire in a later slice). `auth_audit_log` insert-only by convention (no DB trigger).
Drizzle exports: `permissions`, `rolePermissions`, `screens`, `authAuditLog`.

## Seed map (matches spec table, BR-AUTH-21)
- owner (21): employees.directory.view, inventory.adjust, inventory.view, supplier.view, pr.manage, po.manage, grn.view, grn.edit_draft, grn.qa_decide, grn.qa_bypass, grn.correct, grn.over_receipt_override, approval.policy.view, approval.view_all, approval.auto_approve_own, sco.view, sco.manage, sco.close, sco.issue_receive, sco.qa_decide, sco.loss_override
- back_office (20): asset.manage, inventory.adjust, inventory.view, supplier.view, supplier.manage, pr.manage, po.manage, grn.view, grn.edit_draft, grn.qa_decide, grn.qa_bypass, grn.correct, grn.over_receipt_override, approval.policy.view, approval.view_all, sco.view, sco.manage, sco.close, sco.issue_receive, sco.qa_decide
- owner and back_office also hold pr.link_machine (spec v7). floor_supervisor (8): inventory.view, supplier.view, pr.manage, pr.link_machine, grn.view, grn.edit_draft, sco.view, sco.issue_receive
- qa_inspector: grn.view, grn.qa_decide, sco.view, sco.qa_decide
- die_designer: grn.view
- super-admin, operator: none
- No role holds: setup.roles.manage, setup.employees.manage, approval.policy.manage, approval.view_others_pending.

## S4 — service checks
`can(actor: Actor, key: PermissionKey): boolean` exported from `backend/src/lib/auth-middleware.ts` (super-admin → true). Services receive the `Actor` (from `c.get("actor")`) instead of a role name. Replaces: `grnService` OVER_RECEIPT_OVERRIDE_ROLES → `grn.over_receipt_override`; `approvalService` privileged reader → `approval.view_all`, others-pending → `approval.view_others_pending`, own auto-approve → `approval.auto_approve_own`; `employeeService` super-admin check → `setup.employees.manage`. `GET /asset/machines`: allowed with `asset.manage` OR `pr.link_machine`; PR save with a machine requires `pr.link_machine` (BR-AUTH-26).

## `/auth/me` and login `user` (from S3)
`{ id, name, email, role: string /* role name, display only */, permissions: string[] /* super-admin: every key */, screens: { key, path, label, menuGroup, sortOrder }[] }` (BR-AUTH-13). Token payload: `{ userId, userName }` only.

## Route → key (coordinator decisions for routes the spec table doesn't name; used from S3)
- `GET /asset/items`, `GET /asset/inventory/movements`, `GET /asset/items/:itemId/last-rate` → `inventory.view`
- `POST /asset/inventory/movements` → `inventory.adjust`
- `GET /supplier/listSuppliers`, `GET /supplier/detail/:id`, `GET /supplier/:id/listItems`, `GET /supplier/:id/listServices` → `supplier.view`
- All other `/asset` and `/supplier` writes → `asset.manage` / `supplier.manage`

## Screens (built pages only)
landing `/landing` (null), setup `/setup` (setup.roles.manage), employee-directory `/employee-directory` (employees.directory.view), suppliers (supplier.view), purchase-orders (po.manage), purchase-requisitions (pr.manage), grn (grn.view), inventory (inventory.view), approvals `/approvals` (null).

---

# S3 — permission enforcement (interfaces only; no router switched, no behaviour change)

## Types and functions
- `route-registry.ts`: `AuthRequirement` gains `{ type: "permission"; key: PermissionKey }`. `roles` stays until every router is switched, then is removed. BR-AUTH-10: a non-public route declares exactly one `permission` key or `any-authenticated`.
- `auth-middleware.ts` (signatures; bodies throw "not implemented"):
  - `type Actor = { id, name, roleId, roleName, isSuperAdmin, isActive, permissions: Set<PermissionKey> }`
  - `loadActor(employeeId): Promise<Actor | null>` (DB read, short cache), `invalidateActor(employeeId)`, `invalidateRole(roleId)` (call on any employee/role/grant change, BR-AUTH-12).
  - `requirePermission(key)`: order = token (401) -> `loadActor` (missing or inactive => 401) -> super-admin passes -> else `actor.permissions.has(key)` or 403. Sets `c.set("actor", actor)`. Replaces `requireRole`.
- Build-time note: `AppError` has no extra-fields slot and `onError` (`app.ts`) returns only `{success,message,code}`. S3 build must add an optional `details` to `AppError` and spread it in `onError` so `key` reaches the body (needs `errors.ts` + `app.ts`).

## Error bodies
| Case | Status | Body |
|---|---|---|
| No / bad / expired token (checked first, BR-AUTH-23) | 401 | `{ success:false, message, code:"UNAUTHORIZED" }` |
| Employee inactive at request time (BR-AUTH-12) | 401 | `{ success:false, message, code:"UNAUTHORIZED" }` |
| Signed in, lacks key (BR-AUTH-09) | 403 | `{ success:false, message, code:"PERMISSION_DENIED", key:"<permission key>" }` |

## Token after S3 (BR-AUTH-01/12; signing NOT changed in this step)
- Access and refresh payload: `{ userId: number|string, userName: string }` only. `role` and `allowedPages` are removed; role, active flag and keys come from `loadActor` on every request. Refresh (BR-AUTH-01/02) re-reads the employee: inactive => 401, no tokens; else tokens for the current record. `/auth/me` returns role and keys from the DB, not the token.
- Today (until S3 build): `{ userId, userName, role, allowedPages }`.

## Route -> key (real paths, from `end-points.ts`; base `/api`)
Legend: `pub` = public, `any` = any signed-in user (`any-authenticated`), else the one key. super-admin passes all.

| Route | Key |
|---|---|
| POST /auth/login, /auth/refresh, /auth/logout | pub |
| GET /auth/me | any |
| POST /auth/register | retired (route removed, BR-AUTH Q6=A) |
| GET /setup/modules | `setup.roles.manage` (?) see Q2 |
| GET/POST /setup/employees, GET /setup/employees/search, PATCH/DELETE /setup/employees/:id, POST /setup/employees/:id/qr | `setup.employees.manage` |
| GET/POST /setup/roles, PATCH/DELETE /setup/roles/:id | `setup.roles.manage` |
| GET/POST /setup/pages, PATCH/DELETE /setup/pages/:id | `setup.roles.manage` (old pages model, retired later) |
| GET /setup/permissions, POST /setup/roles/:roleId/permissions | `setup.roles.manage` |
| GET /asset/items, GET /asset/items/:itemId/last-rate, GET /asset/inventory/movements | `inventory.view` |
| POST /asset/inventory/movements | `inventory.adjust` |
| GET /asset/machines | `asset.manage` OR `pr.link_machine` (bo + fs today) see Q1 |
| POST /asset/machines, PATCH /asset/machines/:id | `asset.manage` |
| POST /asset/items, PATCH /asset/items/:id | `asset.manage` |
| GET/POST /asset/services, PATCH /asset/services/:id | `asset.manage` |
| GET/POST /asset/locations, PATCH /asset/locations/:id | `asset.manage` |
| GET /supplier/listSuppliers, GET /supplier/:supplierId/detail, GET /supplier/:supplierId/listItems, GET /supplier/:supplierId/listServices | `supplier.view` |
| POST /supplier/createSupplier, PATCH /supplier/updateSupplier/:id, POST /supplier/:supplierId/createItem, PATCH /supplier/:supplierId/editItem, POST /supplier/:supplierId/createService, PATCH /supplier/:supplierId/editService | `supplier.manage` |
| GET /pr/getprs, GET /pr/getprdetails/:id, POST /pr/createpr, PATCH /pr/updatepr, DELETE /pr/deletepr/:id | `pr.manage` (saving a machine: service check `pr.link_machine`, else 403, BR-AUTH-26) |
| GET /po/getpos, GET /po/getpodetails/:id, POST /po/createpo, PATCH /po/updatepo, DELETE /po/deletepo/:id, POST /po/:id/send, /reminder, /escalate, /confirm, /invoice, /close, PATCH /po/:id/delay | `po.manage` |
| GET /grn/getgrns, GET /grn/getgrndetails/:id | `grn.view` |
| POST /grn/creategrn, PATCH /grn/updategrn, DELETE /grn/deletegrn/:id | `grn.edit_draft` |
| POST /grn/:id/lines/:lineId/qa | `grn.qa_decide` |
| POST /grn/:id/lines/:lineId/bypass | `grn.qa_bypass` |
| POST /grn/:id/lines/:lineId/correction | `grn.correct` |
| (service check, not a route key) over-receipt above PO qty | `grn.over_receipt_override` |
| GET /approval/getPolicies, GET /approval/getPolicyDetails/:id | `approval.policy.view` |
| POST /approval/createPolicy, PATCH /approval/updatePolicy/:id | `approval.policy.manage` |
| POST /approval/submitRequest, GET /approval/getRequestDetails/:id, GET /approval/getRequestTrail/:id, POST /approval/actOnRequest/:id, GET /approval/getCurrentApprovalByDoc/:docType/:docId | any (chain decides who may act) |
| GET /approval/getMyPendingApprovals | any (other employee's list needs `approval.view_others_pending`, service check) |
| (service check) read any approval request | `approval.view_all` |
| (service check) owner's own requests auto-approve | `approval.auto_approve_own` |
| `employees.directory.view`, `sco.*` | screens / M2 routes (not in this table yet) |

Note: the explorer parity table used older paths (`/pr/list`, `/grn/list`...); the paths above are the real ones and match `permissions-matrix.test.ts`.

## Open questions (spec is silent)
1. `GET /asset/machines` is allowed today for bo (`asset.manage`) and, after BR-AUTH-26, fs (`pr.link_machine`). BR-AUTH-10 says one key per route. Options: (A) allow `asset.manage` OR `pr.link_machine` via a service-level check, route declared `any-authenticated`; (B) also seed `pr.link_machine` to bo. Recommend A (seed test needs bo and fs both allowed, spec seed table says bo lacks `pr.link_machine`).
2. `GET /setup/modules` and `/setup/pages*`: no key in spec. Assumed `setup.roles.manage` (super-admin only, same as today).
