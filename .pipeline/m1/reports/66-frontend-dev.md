# 66 frontend-dev — S7 frontend

Commits: 0dd880a (drop Pages/Permissions tabs + old client code), b6198e2 (gates + findings).
tsc + lint clean.

## Findings
| id | result |
|---|---|
| MRG-F1 | fixed: `permissions.ts` deleted; Suppliers list/detail use `useCan("supplier.manage")` |
| FE-SA | fixed: `isSuperAdmin` in AuthUser, session store (persisted), login + /auth/me. PR edit dialog and PR line cancel (PO detail) allow requester OR super-admin; "Submit for approval" and Withdraw stay requester-only (BR-PR-17) |
| FE-INACTIVE | fixed: `getAssetItems` always sends `isActive=true` (PR + supplier-offering pickers). Assumes backend parses "true" (manifest shows the param as "unrepresentable", i.e. a transform) |
| FE-LABEL | fixed: PO tracking card shows "Phone call / Email / WhatsApp / In person" |
| FE-HIST | already fixed in panel (`cancelled` -> "Cancelled", notes shown); no change |

## Map updates
- Removed: Setup tabs Pages + Permissions, `components/pages/setup/{pages,permissions}`, `setup.pages`/`setup.permissions` routes, page/permission fetchers/hooks/types, `setupKeys.pages`/`permissionGrants`, `lib/api/suppliers/permissions.ts`.
- Added: `useAuthSessionStore.isSuperAdmin` (ownership checks only; gates elsewhere use `useCan`).
- No role-name literals remain in `src` (grep for super-admin/back_office/owner/etc. clean). `role` in the store is display-only (Sidebar).

## Screens touched
- /setup (super-admin / setup.* holders): tabs now Employees, Roles, Screens, Access log.
- /suppliers, /suppliers/:id (supplier.manage): create/edit buttons.
- PR edit dialog: non-requester super-admin can edit draft + Cancel PR; no Submit button for them.
- PO detail: line-cancel for requester or super-admin.
- PR item picker / supplier offerings: inactive items hidden.

## Backend needs
- Confirm `GET /asset/items?isActive=true` accepts the string "true". `isActive` also on `/asset/locations` (not used by FE yet).
- `/auth/me` + login must return `isSuperAdmin` (backend-dev in progress); until then it reads undefined -> false.
