# 16 test-writer — role admin tests (BR-AUTH-07, 08, 15, 16, 17, 18, 19, 20, 25)

File: `backend/src/routes/role-admin.test.ts` (77 tests, HTTP via `createApp()`, real DB, `test_roleadm_` fixtures).
Typecheck and biome clean. Run: 21 pass, 56 fail.

## Results
- FAIL-EXPECTED (56): S6 handlers are 501 (create, copy, grants, screens, access-log, assign-role, LAST_ADMIN, log writes). Later tests that depend on a created role fail as a chain.
- PASS (21): 403 for non-super-admin, super-admin/owner rename+delete protection, ROLE_HAS_EMPLOYEES, log read-only routes, and other guards that already exist.
- FAIL-BUG (1): see below.

| id | severity | area | file:line | finding | suggested fix |
|---|---|---|---|---|---|
| TEST-1 | major | backend | `roleService.remove` (DELETE /setup/roles/:id) | Deleting a role whose only employees are inactive returns 500 (FK violation on `employees.role_id`). Spec BR-AUTH-19 says only ACTIVE employees block delete; the test accepts 200 or a 409 that is not `ROLE_HAS_EMPLOYEES`, but never 500. | Decide with spec owner: block with a 409 or reassign/allow; must not 500. |

## Notes
- BR-AUTH-17 "only admin" tests return early if the test DB has other active super-admins (cannot reach the state without touching non-TEST data). In an empty DB they run.
- Code for BR-AUTH-16 denial (`ROLE_NOT_ASSIGNABLE`) is dev-chosen; tests assert 403 and unchanged DB only.
- Tests that edit screens restore label/order/group in `afterAll`.
- Not covered here (outside brief BR list): BR-AUTH-06 catalog sync, BR-AUTH-13.
