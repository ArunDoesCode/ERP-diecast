# 67 code-reviewer — merge da516f2 + S7 (dfbf5f5..HEAD)

No blockers. Route conflict resolution, grnService merge, S7 removals and isSuperAdmin plumbing check out. Three minor findings.

| id | severity | area | file:line | finding | suggested fix |
|---|---|---|---|---|---|
| CR-M1 | minor | frontend | frontend/src/types/purchase-requisitions.ts:101; PurchaseOrderDetailView.tsx:414,1220 | BR-PR-14: backend returns `noCostHistory` per line, but the frontend never reads it (grep finds no use). Spec says the screen shows "estimate uses standard rate" for such a line. A line with avg cost 0 shows the standard rate as if it were a cost-based estimate. | add `noCostHistory?: boolean` to the PR item type; show a small "uses standard rate" hint next to `estRatePaise` in the PR detail and edit modal. Or log it as a UI gap for the manual checklist. |
| CR-M2 | minor | backend | backend/src/routes/grn.ts:5; backend/src/routes/supplier.ts:5 | `requireAuth` is still imported, but no longer used (grn `router.use("*", requireAuth)` was removed; supplier never used it). Every route in both files uses `requirePermission`, so auth is still enforced. Dead import. | drop `requireAuth` from both imports |
| CR-M3 | minor | backend | backend/src/repository/prRepository.ts:394 | `findItemMasterByIds` now filters `isActive = true` in SQL, and the comment says "take work/m1 version on merge". Now `assertItemsUsable` (prService.ts:48) checks `isActive` on rows that are already all active. The SQL filter alone gives the same PR_INVALID_ITEM. Stale merge comment; the `isActive` select and the service check are dead. | remove the stale comment. Keep either the SQL filter or the `isActive` check, not both. |

Checked, no issue:
- Auth on merged routes: all grn and asset routes use `requirePermission`. `GET /asset/machines` uses `requireAuth`, and `assetService.listMachines` checks `asset.manage` or `pr.link_machine` (BR-AUTH-26).
- grnService: one tx per action; locks always GRN then PO, in that order (no deadlock). `overReceiptGuard` uses the locked PO-line qty. Correction lowers received qty and calls `recomputeReceiptStatus`.
- poService.recomputeReceiptStatus: the two-way move fully_received / partial_received / dispatched is limited to those three states. Other transitions still go through `assertValidStatusTransition`.
- S7: no `requireRole`, `Role` or `{type:"roles"}` left in src or scripts (only the guard test). `role_pages` and `pages` are gone from the schema, `seed_roles.sql` replaces the page seed, and `prepare-test-db` is updated.
- isSuperAdmin: backend session schema, authService, frontend store, login and me all carry it; it is used only for the BR-PR-17 ownership checks.
- db-reset fixtures: `standardRatePaise` is set, `created.id` matches the new supplier return shape, and QA calls satisfy accepted + rejected = arrived.
- BR-PR-14 SQL: the effective-rate CASE is used in the detail row, create estimate and recompute.
- Frontend `getAssetItems` sends `isActive: true`, and the backend query schema accepts it. This covers FE-INACTIVE for the PR picker, which uses `useAssetItemsLookupQuery`.
