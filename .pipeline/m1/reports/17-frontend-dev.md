# 17 — frontend-dev — S6 Setup UI

tsc + lint clean. Backend not run against (endpoints may 501).

## Screens touched
| URL | Who | What |
|---|---|---|
| /setup?tab=roles | `setup.roles.manage` | Columns: name (System (locked) badge), Permissions (super-admin = "All access"), Employees. Actions: Edit access (not super-admin), Rename (non-system), Copy (not super-admin), Delete (non-system). + New Role |
| Roles > Edit access (dialog) | same | Checkbox grid grouped by module; non-grantable keys disabled "super-admin only"; live +/− list; Save (+n / −n) |
| Roles > Copy (dialog) | same | Name prefilled "X (copy)"; posts /roles/:id/copy |
| /setup?tab=screens | same | Per screen: label, order, menu group inline + Save; "n role(s)" button opens role tick dialog; screens with no key show "No key" |
| /setup?tab=access-log | same | Read-only, newest first, 20/page: when, who, action, target, before → after |
| /setup?tab=employees | `setup.employees.manage` | New action "Change role" (dialog, assignable roles only). Edit form: role select now disabled (use Change role); create form lists assignable roles only |

Tabs Employees / Roles / Screens / Access log are hidden without the key. Old Pages + Permissions tabs untouched (S7).

Error codes mapped to plain toasts in `lib/api/setup/error-messages.ts`: KEY_NOT_GRANTABLE, UNKNOWN_KEY, SYSTEM_ROLE_PROTECTED, ROLE_HAS_EMPLOYEES, ROLE_IN_APPROVAL_CHAIN, LAST_ADMIN, ROLE_NOT_ASSIGNABLE, SCREEN_HAS_NO_KEY, CONFLICT.

## Map updates
- Routes (`API_ROUTES.setup`): employees.assignableRoles/assignRole, roles.copy/grants, screens.list/update/roles, accessLog.list.
- Query keys: `setup/role-grants/<id>`, `setup/screens`, `setup/access-log`, `setup/assignable-roles`.
- Views/components: `pages/setup/{roles/RoleGrantsEditor,roles/RoleCopyDialog,screens/ScreensTab,ScreenRow,ScreenRolesDialog,access-log/AccessLogTab,employees/EmployeeRoleDialog}`.
- Trap: `ApiClientError` now carries `.code` (client.ts) — needed for code mapping.
- Trap: `Role` type fields `isSuperAdmin/keyCount/employeeCount` are optional (old list shape).

## Notes / questions
- Default tab is still "employees"; a user with only `setup.roles.manage` lands on a blank tab until they click Roles. Spec silent; left as is.
- Edit-employee PATCH still sends unchanged `roleId` (backend requires it); relies on backend not applying BR-16 when role is unchanged.
- Cleared menu group sends `""` (backend may 400); spec silent.
