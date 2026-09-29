# 27 — code-reviewer — auth-setup S1–S6 (saved by coordinator; agent had no write tool)

FINDINGS: 0 blocker, 3 major, 8 minor (+4 small)

| id | sev | area | where | finding | fix |
|---|---|---|---|---|---|
| CR-1 | major | backend | service/employeeService.ts:191,265,289 | last-admin check outside the write tx → concurrent demotions leave zero super-admins (BR-AUTH-17) | check + write in one tx, lock active super-admin rows first |
| CR-2 | major | backend | service/authService.ts:92-98 | refresh rotation get-then-delete not atomic → two concurrent refreshes both succeed (BR-AUTH-05) | `DELETE … WHERE token_hash=$1 RETURNING` as the gate; 401 if none |
| CR-3 | major | frontend | lib/api/setup/queries.ts:380-455, lib/api/auth/queries.ts:18 | grants/screen-roles/assign-role mutations don't invalidate `authKeys.me()` → own permissions/sidebar stale | invalidate `authKeys.me()` in those onSuccess |
| CR-4 | minor | backend | service/roleService.ts:96-138 | delete/rename guards run before the tx → FK 500 / skipped guard on race | move guards inside tx |
| CR-5 | minor | backend | service/roleService.ts:93 | `input.name as string` hides optional → empty PATCH renames to undefined | make `roleUpdateSchema.name` required |
| CR-6 | minor | backend | controller/employeeController.ts:98-104 | accessLog handler misplaced | own controller |
| CR-7 | minor | backend | service/authService.ts:14-20 | `getSessionUser(actor, email?)` undefined = fetch; extra query per /me | pass email explicitly |
| CR-8 | minor | backend | service/approvalService.ts submitRequest | optional `actor` silently drops auto_approve_own | make required |
| CR-9 | minor | frontend | pages/setup/roles/RoleGrantsEditor.tsx:47 | form key = roleId + count → stale selection when set changes at same size | key on hash of granted keys |
| CR-10 | minor | frontend | lib/api/setup/queries.ts:115-250 | role/employee mutations don't invalidate access log / assignableRoles / roleGrants(id) | invalidate them |
| CR-11 | minor | frontend | lib/auth/token.ts:30-45, types/auth.ts:10-25 | dead decode helper; AuthUser/AuthScreen types don't match backend | delete helper, tighten types |
| CR-12 | small | backend | lib/permissions.ts:1-5 | stale "nothing reads this yet" comment | update comment |
| CR-13 | small | frontend | views/setup/SetupView.tsx:63-75 | Pages/Permissions tabs shown to everyone (403 for employees-only); `?tab=roles` without key → blank | gate tabs by key |
| CR-14 | small | frontend | common/Sidebar.tsx | "" menu group renders empty group header | no header for "" |
| CR-15 | small | backend+frontend | routes/setup.ts:238; lib/api/setup/error-messages.ts | ROLE_HAS_INACTIVE_EMPLOYEES not documented / no plain message | add |
