# 05 test-writer — BR-AUTH-06, 21 (seed table), 24
File: backend/src/lib/permissions.test.ts (18 tests, all PASS; typecheck ok)
- BR-AUTH-06: catalog keys == spec table (28); label/description present; grn.correct label; screens' keys in catalog; landing/approvals null.
- BR-AUTH-07: only setup.roles.manage not grantable.
- BR-AUTH-21: per-role SEED_GRANTS == spec table (ow/bo/fs/qa/dd), sa/operator empty, unheld keys, fs no qa_bypass, loss_override owner only.
- BR-AUTH-24 (storage): new role and newly added key are held by nobody; deleting a permission cascades grants and nulls screens.permission_key.
## Not covered (BLOCKED-ish, spec does not name where sync/seed live)
1. syncCatalog / seedGrants are types only, no module path or name in spec -> cannot test: idempotent sync, "screen removed from code disappears", sync never overwrites label/order/group, seed inserts-missing-only, audit row on delete.
2. BR-AUTH-24 runtime (role with no keys gets 403 on every route; new key held only via super-admin bypass) needs S3 enforcement; the route matrix in permissions-matrix.test.ts already covers seed roles.
UPDATE: F-TEST-3 fixed (removed disconnectDb from permissions.test.ts; 18 still pass). Added backend/src/lib/permissions-sync.test.ts (13 tests) for syncCatalog/seedGrants: FAIL-EXPECTED (permissions-sync.ts not built, import fails). Audit assertion is loose (row whose target contains the removed key/screen). Runtime no-keys-role test pending S3 brief.
(Old ask, answered:) which module/exports will provide sync and seed (e.g. `service/permissionCatalogService`)? Then I add those tests.
