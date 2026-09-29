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
- floor_supervisor (8): inventory.view, supplier.view, pr.manage, pr.link_machine, grn.view, grn.edit_draft, sco.view, sco.issue_receive
- qa_inspector: grn.view, grn.qa_decide, sco.view, sco.qa_decide
- die_designer: grn.view
- super-admin, operator: none
- No role holds: setup.roles.manage, setup.employees.manage, approval.policy.manage, approval.view_others_pending.

## Route → key (coordinator decisions for routes the spec table doesn't name; used from S3)
- `GET /asset/items`, `GET /asset/inventory/movements`, `GET /asset/items/:itemId/last-rate` → `inventory.view`
- `POST /asset/inventory/movements` → `inventory.adjust`
- `GET /supplier/listSuppliers`, `GET /supplier/detail/:id`, `GET /supplier/:id/listItems`, `GET /supplier/:id/listServices` → `supplier.view`
- All other `/asset` and `/supplier` writes → `asset.manage` / `supplier.manage`

## Screens (built pages only)
landing `/landing` (null), setup `/setup` (setup.roles.manage), employee-directory `/employee-directory` (employees.directory.view), suppliers (supplier.view), purchase-orders (po.manage), purchase-requisitions (pr.manage), grn (grn.view), inventory (inventory.view), approvals `/approvals` (null).
