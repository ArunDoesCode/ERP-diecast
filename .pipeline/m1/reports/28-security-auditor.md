# 28 — security-auditor — auth-setup S1–S6 (saved by coordinator; agent had no write tool)

FINDINGS: 3 blocker, 2 major, 4 minor

| id | sev | where | finding | fix |
|---|---|---|---|---|
| SEC-1 | blocker | backend/src/service/employeeService.ts `update` | `assertCanAssign` runs only when roleId changes; a non-super-admin with `setup.employees.manage` can PATCH a super-admin (same roleId, new email/password) → account takeover | on every update: caller is super-admin, or target's current role is assignable by the caller (never super-admin) |
| SEC-2 | blocker | employeeService.ts `remove` | non-super-admin with `setup.employees.manage` can deactivate super-admin / higher-role employees (only LAST_ADMIN applies) | same target check before deactivate |
| SEC-3 | blocker | employeeService.ts `regenerateQr` | no target check, no audit; raw QR token returned for a higher-role employee | SEC-1 target check + audit `employee.qr` + invalidateActor |
| SEC-4 | major | employeeService.ts create/update/regenerateQr | BR-AUTH-20 gaps: employee create, email/password/login-method changes, QR regen, non-role edits not in access log | audit rows in the same tx, no secrets in before/after |
| SEC-5 | major | employeeService.ts update; authService.ts refresh | password/method change doesn't revoke refresh tokens | delete employee's refresh tokens on password/method change and deactivation |
| SEC-6 | minor | employeeService.ts `assertNotLastActiveAdmin` | runs outside the write tx → race can leave zero super-admins | check inside the tx with FOR UPDATE |
| SEC-7 | minor | employeeService.ts update | edits to inactive employees allowed; no audit for non-role edits | covered by SEC-1/SEC-4 |
| SEC-8 | minor | lib/auth-middleware.ts actor cache | 2 s TTL; multi-instance lag | accept; document for multi-instance |
| SEC-9 | minor | routes/setup.ts legacy /pages*, /permissions* | role_pages writes not audited; nothing gated by them | removed in S7 |

Checked OK: route auth on every setup route; grants (non-grantable key, super-admin read-only, catalog check, tx + audit + invalidation); role/screen admin; assignRole guards; token = identity only, actor from DB; refresh rotation + jti; audit log insert-only, sort whitelisted, pageSize ≤100; no secrets in responses; approval/asset any-authenticated routes enforced via can().
