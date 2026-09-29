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

---

# S6 — role editor, screens admin, guardrails, access log (contract; handlers return 501)

Base `/api/setup`. Envelope `{ success:true, data }`; lists `{ success:true, data, meta:{page,pageSize,total,totalPages} }`. Errors `{ success:false, message, code }`. Path params are numeric ids except `:key` on screens (string). Every route needs a bearer token (401 first, BR-AUTH-23) and the key shown (403 `PERMISSION_DENIED` + `key`; super-admin passes). Body validation failure = 400.

Decision: extended the existing `/setup/roles` and `/setup/employees` routes; added `/setup/screens` and `/setup/access-log`.

## Old endpoints (kept unchanged until S7, then deleted)
| Old | Becomes |
|---|---|
| GET/POST/PATCH/DELETE `/setup/pages*` | `GET /setup/screens`, `PATCH /setup/screens/:key` (no create/delete, BR-AUTH-06) |
| GET `/setup/permissions` (role_pages) | `GET /setup/roles/:id/grants` and `GET /setup/screens` (`roleIds`) |
| POST `/setup/roles/:roleId/permissions` (page-id diff) | `POST /setup/roles/:id/grants` (key diff) |
| GET `/setup/modules` | unchanged; screens use free-text `menuGroup` |
`GET /setup/roles` row gains fields (extra only). Existing role routes keep their paths and gain the error codes below.

## Roles (key `setup.roles.manage`, super-admin only, BR-AUTH-07)
| Method + path | Request | Response 2xx | Errors |
|---|---|---|---|
| GET `/roles?page&pageSize&sortBy=name&sortDir` | pagination | 200 paginated `{ id, name, isSystem, isSuperAdmin, keyCount, employeeCount }` (employeeCount = active employees) | - |
| POST `/roles` | `{ name }` | 201 `{ id, name, isSystem:false }` | 409 `CONFLICT` duplicate name |
| POST `/roles/:id/copy` (BR-25) | `{ name }` | 201 role (isSystem false, same keys as source) | 404 `NOT_FOUND`; 403 `SYSTEM_ROLE_PROTECTED` (source is super-admin); 409 `CONFLICT` |
| PATCH `/roles/:id` (rename) | `{ name }` | 200 role | 403 `SYSTEM_ROLE_PROTECTED` (any system role, BR-18); 409 `ROLE_IN_APPROVAL_CHAIN` (BR-19); 409 `CONFLICT`; 404 |
| DELETE `/roles/:id` | - | 200 `{ success:true }` | 403 `SYSTEM_ROLE_PROTECTED`; 409 `ROLE_HAS_EMPLOYEES` (active employees); 409 `ROLE_IN_APPROVAL_CHAIN`; 404 |
| GET `/roles/:id/grants` | - | 200 `{ roleId, roleName, isSystem, isSuperAdmin, readOnly, keys:[{ key, module, label, description, grantable, granted }] }` - whole catalog. Super-admin: `readOnly:true`, all `granted:true` | 404 |
| POST `/roles/:id/grants` | `{ added: string[], removed: string[] }` (keys; at least one non-empty) | 200 same shape as GET grants (fresh) | 400 `KEY_NOT_GRANTABLE` (`setup.roles.manage`, BR-07); 400 `UNKNOWN_KEY`; 403 `SYSTEM_ROLE_PROTECTED` (super-admin role); 404. All-or-nothing transaction. |
Check order for role writes: role exists (404) -> system-role rule (403) -> body/state rule (400/409). Other system roles (owner etc.): grants editable, rename/delete 403.

## Screens (key `setup.roles.manage`, BR-AUTH-15)
| Method + path | Request | Response | Errors |
|---|---|---|---|
| GET `/screens` (not paginated: bounded, from code) | - | 200 array `{ key, path, permissionKey: string\|null, label, sortOrder, menuGroup, roleIds:number[] }`, ordered menuGroup, sortOrder, key. `roleIds` = roles holding the key (super-admin never listed) | - |
| PATCH `/screens/:key` | `{ label?, sortOrder?, menuGroup? }` strict, at least one | 200 screen | 404 unknown key; 400 any other field |
| POST `/screens/:key/roles` | `{ added: roleId[], removed: roleId[] }` (at least one) | 200 screen (fresh `roleIds`) | 404 screen/role; 400 `SCREEN_HAS_NO_KEY` (permissionKey null); 400 `KEY_NOT_GRANTABLE` (setup screen); 403 `SYSTEM_ROLE_PROTECTED` (super-admin role). Ticking = granting the screen's key, identical to the grants endpoint. |

## Employees (key `setup.employees.manage`)
| Method + path | Request | Response | Errors |
|---|---|---|---|
| GET `/employees/assignable-roles` (not paginated) | - | 200 array `{ id, name }`: super-admin = all roles; others = roles whose keys they all hold, never super-admin (BR-16) | - |
| PATCH `/employees/:id/role` | `{ roleId }` strict (`roleIds` or extra fields = 400, BR-08) | 200 employee | 404 employee/role; 403 `ROLE_NOT_ASSIGNABLE` (BR-16; code chosen by dev, see report); 409 `LAST_ADMIN` (BR-17) |
| DELETE `/employees/:id` (deactivate, existing) | - | 200 `{success:true}` | 409 `LAST_ADMIN` (BR-17); 404 |
Existing `PATCH /employees/:id` and `POST /employees` also carry `roleId`; the S6 build must apply the same BR-16 / BR-17 checks there.

## Access log (key `setup.roles.manage`, read-only, BR-AUTH-20)
GET `/access-log?page&pageSize&sortBy=at|action|actorId&sortDir` -> 200 paginated `{ id, at (ISO string), actorId|null, actorName|null, action, target, before: json|null, after: json|null }`. Default sortDir is `asc` (pagination skill); UI sends `sortBy=at&sortDir=desc`. No POST/PATCH/DELETE exists. Each S6 write appends one row (`action` e.g. `role.create`, `role.copy`, `role.rename`, `role.delete`, `role.grants`, `screen.update`, `employee.role`, `employee.deactivate`).

## Error codes (new in S6)
`SYSTEM_ROLE_PROTECTED` 403, `ROLE_HAS_EMPLOYEES` 409, `ROLE_IN_APPROVAL_CHAIN` 409, `LAST_ADMIN` 409, `KEY_NOT_GRANTABLE` 400, `UNKNOWN_KEY` 400, `SCREEN_HAS_NO_KEY` 400, `ROLE_NOT_ASSIGNABLE` 403. Existing: `PERMISSION_DENIED` 403 (with `key`), `NOT_FOUND`, `CONFLICT`. Stubs currently return 501 `NOT_IMPLEMENTED`.

## PR-S1 — PR cancel (coordinator decisions; backend-dev updates the descriptor + schema in the build)
- `DELETE /api/pr/deletepr/:id` — key `pr.manage`; JSON body `{ reason: string }` (trimmed 3–500, else 400 `PR_CANCEL_REASON_REQUIRED`), required for every status incl. draft (BR-PR-41).
- Response 200 `{ success, data: { pr } }`; `pr` and `GET /api/pr/getprdetails/:id` carry `cancelledBy` (employee id), `cancelledByName`, `cancelledAt` (ISO), `cancelReason` (BR-PR-46, BR-KD-08).
- Error codes per spec: BR-PR-39 / 41 / 42 / 43 / 47 (use the PR spec's codes; known-defects references them).
- Tests are HTTP-level through `createApp().request()` with real logins; the forced "trail insert fails" sub-case of BR-PR-42 is a known gap (no production hook).

## PR-S2 — decisions
- Second submit while an approval request is open → 409 `APPROVAL_ALREADY_OPEN` (BR-PR-19, the specific case wins); any other non-draft source → `APPROVAL_INVALID_SOURCE_STATUS` (BR-APR-24).
- Withdraw (BR-PR-21): `POST /api/approval/actOnRequest/:id` with `action: "withdraw"` — requester only; request → cancelled with a trail row; PR → `draft`. `action: "cancel"` is not the PR-withdraw path.
- BR-PR-14 (standard rate required) tests wait for the inventory item `standard_rate` column (work/m1-stock merge).

# APR / PO — S1/S2 contract (brief 44)
Base `/api`. Envelope `{ success, data }`; lists add `meta`. New handlers return 501 `NOT_IMPLEMENTED` until the build. Exact shapes: `backend/.contracts/api-manifest.json`.
**Two kinds of change.** (A) already in the manifest. (B) build-step changes the build must add together with the service/db; not in the manifest yet because the current service code depends on the old types. The frontend builds against A + B.

## Approval (`/api/approval`)
| Endpoint | Key | Change |
|---|---|---|
| GET `/getPolicies`, `/getPolicyDetails/:id` | `approval.policy.view` (or `.manage`, BR-APR-01) | none (B: holders of only `.manage` must pass too) |
| POST `/createPolicy` | `approval.policy.manage` | see policy body |
| PATCH `/updatePolicy/:id` | `approval.policy.manage` | see policy body |
| POST `/submitRequest` `{ docType: pr\|po\|sco, docId }` | any login | none. 403 not creator, 409 `APPROVAL_INVALID_SOURCE_STATUS`, 409 `APPROVAL_ALREADY_OPEN`, 400 `APPROVAL_NO_ELIGIBLE_APPROVER` |
| POST `/actOnRequest/:id` | any login (step match checked in service) | see action body |
| GET `/getRequestDetails/:id`, `/getRequestTrail/:id`, `/getCurrentApprovalByDoc/:docType/:docId` | any login; read rule BR-APR-51 (403 otherwise) | none (A: `chainSnapshot` / policy `approvalChain` may now be `[]`) |
| GET `/getMyPendingApprovals?employeeId` | any login; another's list needs `approval.view_others_pending` (403); inactive target 404 | none |
| **GET `/getApprovalHistory/:docType/:docId` (NEW, A)** | any login; BR-APR-51 (403) | array, requests newest first, each = request list item + `trail[]` oldest first (`actorName` included). `[]` if never submitted. Live state ("level x of N", who acts now) = the first item when `status = pending_approval` (`currentLevel`, `chainSnapshot`). |

**Policy body.** Amounts in **paise**. BL-025 is a frontend bug: the form must show stored paise / 100 as ₹ and send ₹ x 100 (up to 2 decimals).
- create: `name, priority>=1, docType, subDocType (default "any"), description?, isActive?, autoApprove?, minAmountPaise?, maxAmountPaise?, approvalChain`. (A) chain may be `[]` when `autoApprove`; auto-approve off + no step = 400. Max > min else 400. Duplicate active (priority, docType, category) = 409 `POLICY_PRIORITY_TAKEN`.
- (B) `approvalChain` becomes optional on create (auto-approve form sends none). `isSaleOrderLinked` is removed from create and update (BR-APR-15): do not send it. `docType` in a PATCH = 400 (BR-APR-11). `null` is allowed only on `description, minAmountPaise, maxAmountPaise` (BR-APR-09). `approvalLevels` in a body is ignored.
- update is partial; omitted `subDocType` stays as stored (BL-022/023: the edit form loads details first, sends the shown category, keeps unsaved edits across refetch).

**Action body** `{ action: approve|reject|sent_back|withdraw|cancel, notes? }`
- `notes` (trimmed, non-empty) is **required** for approve, reject, sent_back: 400 `APPROVAL_NOTES_REQUIRED` from the service (BR-APR-37). Optional for withdraw (BR-APR-39, requester only, 403 otherwise; request → cancelled, doc → draft). `cancel` is not the withdraw path.
- Send back = `action: "sent_back"` (no separate endpoint): request `require_more_info`, doc → `draft`.
- Errors: 409 `APPROVAL_NOT_PENDING`; 403 not the current step's approver; 403 `APPROVAL_ALREADY_ACTED` (BR-APR-33). Reject of a PO cancels the PO and its PR lines (BR-APR-43).
- 200 → the updated approval request.

## PO (`/api/po`, all key `po.manage`; 401 no login, 403 `PERMISSION_DENIED`)
(A) `po` now also carries `cancelledBy, cancelledByName, cancelledAt, cancelReason, shortClosed, invoicedBy, invoicedAt, dueDate` (dueDate = revised date else expected date). Items carry `gstPercent, lineValuePaise, lineTaxPaise`. (B) these do not exist in the DB/service yet, so they are absent at runtime until the build. Money is integer paise; `subtotalPaise, taxAmountPaise, totalAmountPaise` are recomputed on every line change (BR-PO-04).
| Endpoint | Body / query | Notes |
|---|---|---|
| GET `/getpos?status=a,b&supplierId&q&overdue=true&page&pageSize&sortBy&sortDir` | | `overdue` = dispatched/partial_received, open qty, due date < today (BR-PO-19, revised date wins; B for the changed meaning) |
| GET `/getpodetails/:id` | | `{ po, items }` |
| POST `/createpo` | `{ supplierId, paymentTermsDays? (0-365), deliveryTerms?, expectedDeliveryDate?, notes?, lines: [{ prItemId, unitPricePaise (>=1), gstPercent? }] }` | 201 `{ po, items }`. Omitted `paymentTermsDays` = supplier default (B, BR-PO-23). Omitted `gstPercent` = supplier price-list % else 0 (B, BR-PO-04). GST % one of 0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40. Inactive supplier 400; PR line already drafted 400 / 409 `PO_LINE_ALREADY_DRAFTED`. Qty is never sent. |
| PATCH `/updatepo` | `{ poId, paymentTermsDays?, deliveryTerms?, notes?, expectedDeliveryDate?, inserts: [{ prItemId, unitPricePaise, gstPercent? }], updates: [{ id, unitPricePaise (>=1), gstPercent? }], deletes: [{ id }] }` | draft only, else 409 `PO_NOT_EDITABLE` (pending: 409 `DOC_LOCKED_IN_APPROVAL`). Removing all lines 400. Expected date before PO date 400 (BR-PO-18). |
| DELETE `/deletepo/:id` | `{ reason }` **required for every status incl. draft**, trimmed 3-500 (A, changed) | only draft/pending_approval/approved/dispatched with no GRN (draft or posted), else 409. PR lines → cancelled (B); open approval cancelled. |
| POST `/:id/send` | `{ channel: email\|whatsapp\|phone\|in_person, note?, toEmail? }` | `approved` → `dispatched`; email needs `toEmail` (400); expected date required (400, BR-PO-18) |
| PATCH `/:id/delay` | `{ revisedDeliveryDate, delayReason }` both **required** (A, changed) | dispatched/partial_received only, else 400 |
| POST `/:id/confirm` `{ confirmationMethod, note? }`; POST `/:id/reminder`, `/:id/escalate` `{ channel, note?, toEmail? }` | | log rows only; dispatched/partial_received else 400 |
| POST `/:id/invoice` | `{ invoiceNumber, invoiceDate, billedAmountPaise, dueDate? }` | fully_received only, else 400; same invoice number + supplier = 409 |
| POST `/:id/close` | `{ note? }` | fully_received/invoiced → closed, else 400 |
| **POST `/:id/short-close` (NEW, A)** | `{ reason }` trimmed 3-500 | partial_received only, else 400; PO → closed, `shortClosed = true`, PR lines → closed. 200 `po`. |
| **GET `/:id/communications` (NEW, A)** | | array of log rows newest first (`type po_sent\|reminder\|escalation`, `channel`, `note`, `toEmail`, `sentBy`, `sentByName`, `sentAt`) |
- Submit / approve / reject / send back / withdraw of a PO use the approval endpoints (`docType: "po"`); the PO is matched on its total incl. GST.
- Status changes re-read the PO under a row lock; the race loser gets 409 (BR-PO-22).

## Questions for the coordinator
1. Rate prefill (BR-SUP-16) and supplier default terms: which endpoint gives the frontend the price suggestion (last rate + source), default terms and GST %? Not in this brief; PO create currently requires `unitPricePaise` from the client.
2. `GET /:id/communications` and `GET /getApprovalHistory/...` are inferred from BR-PO-21 / BR-APR-54 (the spec names the data, not the route).

### APR / PO — coordinator decisions (2026-09-29)
- PO defaults (BR-PO-03/04/23, BR-SUP-16): the frontend prefills rate, GST % and payment terms from `GET /api/supplier/:id/listItems` (active price rows) and supplier detail; on create/update the backend fills the same defaults when `unitPricePaise` / `gstPercent` / `paymentTermsDays` are omitted. Both stay editable.
- Route names confirmed: `GET /api/approval/getApprovalHistory/:docType/:docId`, `POST /api/po/:id/short-close`, `GET /api/po/:id/communications`.
- Line cancel (BR-PR-33): `POST /api/pr/:id/lines/:lineId/cancel` body `{ reason }` (3–500), key `pr.manage`, requester or super-admin; only a `pending` line while the header is `approved`/`partial_ordered`; header recomputed (BR-PR-36). Built in PO-S1.

## PO-S1/S2 as built (brief 52) — the (B) items are now live
Envelope `{ success, data }`. All PO routes key `po.manage`; PR line cancel key `pr.manage`. Exact shapes: `backend/.contracts/api-manifest.json` (94 routes).

**PO row** (`po` in create / update / details / list / every action): all stored columns plus `cancelledBy, cancelledByName, cancelledAt, cancelReason, shortClosed, invoicedBy, invoicedAt, closedBy, closedAt, closeNote, revisedDeliveryDate, delayReason, dueDate` (dueDate = revised date else expected date). **Item**: `gstPercent, lineValuePaise, lineTaxPaise` next to `qty, unitPricePaise, uom`.

| Endpoint | Body | Rules / errors |
|---|---|---|
| POST `/po/createpo` | `{ supplierId, paymentTermsDays? 0-365, deliveryTerms?, expectedDeliveryDate?, notes?, lines: [{ prItemId, unitPricePaise? >=1, gstPercent? }] }` | 201 `{ po, items }`. Omitted terms = supplier default; omitted rate = last PO rate for that supplier+item, else price list, else item average cost (none >= 1 -> 400 `PO_RATE_REQUIRED`); omitted GST % = active price-list % else 0. Supplier missing 404, inactive 400 `SUPPLIER_INACTIVE`. Expected date before today 400 `PO_DATE_BEFORE_PO_DATE`. Line not pending / PR not approved or partial_ordered 400; race 409 `PO_LINE_ALREADY_DRAFTED`. |
| PATCH `/po/updatepo` | `{ poId, paymentTermsDays?, deliveryTerms?, notes?, expectedDeliveryDate?, inserts: [{ prItemId, unitPricePaise?, gstPercent? }], updates: [{ id, unitPricePaise?, gstPercent? }], deletes: [{ id }] }` | Header fields are all optional now; at least one change needed. 200 `{ po, items }` (`items` = touched lines). Pending PO 409 `DOC_LOCKED_IN_APPROVAL`; any other non-draft 409 `PO_NOT_EDITABLE`. Removing every line 400 `PO_NEEDS_A_LINE` (nothing saved). Date before PO date 400. Omitted update rate/GST keeps the stored value. |
| DELETE `/po/deletepo/:id` | `{ reason }` 3-500, always | draft / pending_approval / approved / dispatched only, else 409 `PO_INVALID_TRANSITION`; any GRN (draft or posted) 409 `PO_HAS_GRN`. PR lines -> cancelled (issuedQty back), open approval cancelled (trail actor = canceller), PR header recomputed. |
| POST `/po/:id/send` | `{ channel, note?, toEmail? }` | approved only (else 400 `PO_INVALID_STATUS`); expected date required 400 `PO_EXPECTED_DATE_REQUIRED`; race loser 409 `PO_STATUS_CHANGED`. |
| POST `/po/:id/reminder`, `/escalate` (201 log row), `/confirm` (200 po), PATCH `/po/:id/delay` (both fields required) | as before | dispatched / partial_received only, else 400 `PO_INVALID_STATUS`; race 409 `PO_STATUS_CHANGED`. |
| POST `/po/:id/invoice` | `{ invoiceNumber, invoiceDate, billedAmountPaise, dueDate? }` | fully_received only (400); same number + same supplier 409 `SUPPLIER_INVOICE_DUPLICATE`; PO -> invoiced, `invoicedBy/At` set. |
| POST `/po/:id/close` | `{ note? }` | fully_received or invoiced (else 400). |
| POST `/po/:id/short-close` | `{ reason }` 3-500 | partial_received only (else 400). PO -> closed, `shortClosed = true`, reason saved in `closeNote`, `closedBy/At`; PR lines -> closed (issuedQty kept). 200 `po`. |
| GET `/po/:id/communications` | | array newest first: `id, poId, type po_sent / reminder / escalation, channel, status, toEmail, note, sentBy, sentByName, sentAt`. 404 unknown PO. |
| GET `/po/getpos?overdue=true` | | dispatched / partial_received, open qty, due date (revised else expected) before today. |

**PR line cancel (new):** `POST /pr/:id/lines/:lineId/cancel` body `{ reason }` 3-500 (validated, not stored). 200 `{ pr, item }` (`pr` = recomputed header, `item` = the line with `status: "cancelled"`). Errors: 404 `PR_LINE_NOT_FOUND` / `PR_NOT_FOUND`; 403 `PR_NOT_REQUESTER`; 409 `PR_LINE_ON_LIVE_PO` (po_draft / ordered); 409 `PR_LINE_NOT_PENDING` (closed / cancelled); 409 `PR_INVALID_TRANSITION` (header not approved / partial_ordered). All lines cancelled -> PR becomes `cancelled`.

**Approval effects (no new routes):** PO approved (last level or auto) -> its PR lines `ordered`. Reject or request-cancel -> PO `cancelled` with `cancelledBy` = the actor, reason = the comment, PR lines `cancelled`. Send back / withdraw -> PO `draft`, PR lines stay `po_draft`. PO is matched on `totalAmountPaise` (incl. GST).

**PR line cancel fields (PO-F1):** the cancel response `item` and PR detail lines carry `cancelledBy`, `cancelledAt`, `cancelReason` — same names as the PR header cancel — stored on the line.

## S7 (after merge da516f2)
- `/auth/me` and login `user` add `isSuperAdmin: boolean` (FE-SA). Nothing else in the shape changes.
- New stock-branch routes: `GET /asset/inventory/stock`, `GET /asset/inventory/reconciliation` → `inventory.view`; `GET /supplier/:id/history` → `supplier.view`. `GET /asset/locations` stays `asset.manage` (auth-setup table). `GET /asset/machines` stays any signed-in user, service allows `asset.manage` or `pr.link_machine` (BR-AUTH-26).
- Removed: `role_pages` table and its routes, `Role` union in `lib/token.ts`, `requireRole`, `{type:"roles"}` auth requirement.
- BR-PR-14: `GET /api/pr/getprdetails/:id` returns `noCostHistory: boolean` on each line in `items[]` (true when the item's average cost is 0 and the estimate used its standard rate).
- `GET /asset/locations`: `asset.manage` or `inventory.view` (auth-setup v10; registry `{type:"permission", key:"asset.manage", alsoKeys:["inventory.view"]}`). Replaces the S7 line above.
