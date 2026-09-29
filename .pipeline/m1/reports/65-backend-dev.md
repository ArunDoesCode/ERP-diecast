# 65 backend-dev — S7 cleanup, isSuperAdmin, MRG-B1/B2

## Commits
- dd24280 feat(m1): S7 drop role_pages, Role union, requireRole; isSuperAdmin on session user
- (next) fix(m1): MRG-B1 db-reset fixtures; MRG-B2 PR estimate standard rate + noCostHistory

## Done
- Removed: `role_pages` + `pages` tables, `/setup/pages*`, `/setup/permissions`, `/setup/roles/:roleId/permissions`, `pageRepository`, legacy service/controller methods, `Role` union, `requireRole`, `{type:"roles"}`, `getPagesByRoleId`. SPEC-5 / SEC-9 closed. F-APR-1 / SPEC-2 already clean (no-role-names scan finds nothing).
- `seed_page_access.sql` -> `seed_roles.sql` (roles only; screens and grants come from permissions-sync). `prepare-test-db.ts` updated.
- `/auth/me` + login `user` carry `isSuperAdmin`.
- MRG-B1: fixtures pass `standardRatePaise`, use `supplierService.create` return shape, QA calls send accepted+rejected.
- MRG-B2 (BR-PR-11/14): line rate = avg cost, else standard rate; `noCostHistory` on PR detail lines (`estRatePaise` is now the effective rate). Green: pr-lifecycle 71/71.

## Green
typecheck, no-role-names (4/4), pr-lifecycle, all scripts tests except one below. Lint: 0 errors in my files (warnings pre-existing).

## Still red
| id | area | finding |
|---|---|---|
| MRG-T3 | test | permissions-matrix rows for removed /setup/pages*, /setup/permissions, /setup/roles/:roleId/permissions (6) - routed already |
| BR-KD-46 | test/spec | scripts/db-reset.test.ts:688 expects item_master.current_stock = 0 and average_cost = 0 after fixtures. Spec BR-KD-46 says 0 "until BL-014"; BL-014 is now fixed (postStock updates stock + avg cost on GRN accept), and BR-KD-44 requires accepted GRNs, so stock/avg cost are non-zero by design. Fixtures do not set them directly (only via real GRN services). Fix: spec wording + test should assert ledger balance == current_stock. Not changed in code. |

## Map updates
- auth-setup: `pages`/`role_pages` gone; `seed_roles.sql` seeds roles only; `pageService/pageController` now hold only screens code (names kept).
- Trap: stale test DBs with data need the two tables dropped before `db:test:prepare` (`DROP TABLE role_pages, pages CASCADE`), drizzle push asks for data-loss confirmation.
- PR: `estRatePaise` = effective rate (CASE avg>0 else standard); `noCostHistory` on detail items.
- Trap: db-reset fixtures drift when service shapes change (`supplierService.create` returns supplier, QA needs both qtys).

## Fix round (SEC-13, PERF-M1, SPEC-M2/CR-M2, CR-M3, SPEC-M3)
- SEC-13: `GET /asset/machines` now `requireAnyPermission("asset.manage","pr.link_machine")`; registry `{type:"permission", key:"asset.manage", alsoKeys:["pr.link_machine"]}` (asset.ts). Service check kept as second layer. Manifest regenerated (no diff beyond auth).
- PERF-M1: `idx_grns_po_id` on `grns.po_id` (schema; pushed to test DB).
- SPEC-M2/CR-M2: unused `requireAuth` import removed (grn.ts, supplier.ts).
- CR-M3: stale merge comment removed (prRepository); prService `assertItemsUsable` relies on the repo's active-only lookup (single check).
- SPEC-M3: neutral role example in 02_procurement-approval.ts comment.
- Result: typecheck clean, `bun test` 1154 pass / 0 fail (BR-KD-46 test now passes too). No test expectation changed.
