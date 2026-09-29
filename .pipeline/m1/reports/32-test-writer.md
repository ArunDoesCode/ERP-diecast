# Report 32 — test-writer — regression (auth BR-05/13/16/17/19/20)

Files: backend/src/routes/employee-security.test.ts (29 tests), backend/src/routes/employee-last-admin-race.test.ts (3 tests).
Result: 13 pass, 16 fail (all FAIL-BUG, code exists and breaks the v9 rule). Typecheck clean. Lint: no new warnings from these files.

## FAIL-BUG (findings confirmed)
| finding | test | got |
|---|---|---|
| SEC-1 | non-super-admin PATCH super-admin (password) / higher-role employee | 200, expected 403 ROLE_NOT_ASSIGNABLE (employeeService.update) |
| SEC-2 | non-super-admin DELETE super-admin / higher-role employee | 200, expected 403 |
| SEC-3 | non-super-admin POST /qr on super-admin / higher-role employee | 200, expected 403 (employeeService.regenerateQr) |
| SEC-4 | create / edit (email+password) / QR regenerate write no auth_audit_log row | no new rows for actor |
| SEC-5 | password change, login-method change, deactivation leave refresh_tokens rows | tokens not revoked |
| SEC-6/CR-1 | two super-admins deactivate / demote each other concurrently | zero active super-admins left |
| CR-2 | 6 concurrent refresh() with one token | 2 succeed, expected exactly 1 |

## PASS
- BR-AUTH-13 (SPEC-1): login and /auth/me return role, permissions, screens; super-admin gets every key and screen; grant change shows up.
- BR-AUTH-19 (SPEC-4): ROLE_HAS_INACTIVE_EMPLOYEES and ROLE_HAS_EMPLOYEES.
- BR-AUTH-05: reuse and logout give 401. BR-AUTH-16 controls (assignable-role edit/QR, super-admin edit). BR-AUTH-20 log has no write verbs.

## Notes
- Race file parks the other active super-admins in the test DB (is_active=false) and restores them in afterAll. Test DB only.
- Audit action names and target format are not in the spec, so tests check "a row exists for the actor" and "no secret in any row", not names.
- Cleanup matches employees by name `TEST_empsec_%` because QR-method edits clear email.

QUESTIONS: none
