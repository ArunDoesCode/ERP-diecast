# Report 03 — backend-dev — S2 contract

Done. Catalog, 4 tables, seed map, signatures, contract.md. typecheck clean; lint: 0 errors (13 pre-existing warnings, two `noExplicitAny` in 01_auth.ts lines 19/35 are old code); `bun test` 23 pass. `db:test:prepare` run OK. Dev-DB `db:push` not run (no dev env file in this worktree; only test env available) — run it locally.

## Changed
- backend/src/lib/permissions.ts (new)
- backend/src/db/schemas/01_auth.ts (+4 tables)
- .pipeline/m1/contract.md

## Map updates
- New: `lib/permissions.ts` (`PERMISSIONS`, `SCREENS`, `SEED_GRANTS`, sync types); tables `permissions`, `role_permissions`, `screens`, `auth_audit_log` in `01_auth.ts`.
- `screens` is a new table beside old `pages`; `pages`/`role_pages` still live until the frontend slice.
- Trap: `seed_page_access.sql` grants role `'back-office'` (hyphen) but the role is `back_office` — those grants silently insert nothing today. Not fixed (out of scope).
- Trap: seed SQL lists 37 pages but only 9 frontend pages are built; `SCREENS` covers built pages only.

## Questions (non-blocking)
1. `employee-directory` page exists; old seed gave it to owner; spec has no key for it. Left out of `SCREENS`. Which key (or add one)?
2. `landing` and `approvals` set `permission: null` (any signed-in user). Confirm.
3. Unbuilt seed pages (jobs, customers, ...) omitted from `SCREENS` since they have no key and no page.
