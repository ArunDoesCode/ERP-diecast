# 30 — spec-reviewer — auth-setup S1–S6 (saved by coordinator; agent had no write tool)

Verdict: NOT READY (0 blocker, 1 major). Tests at review time: 260 pass, 35 fail (db-reset + pr-cancel red by design, 2 unnamed errors, BR-AUTH-11 scan).
BR coverage: 01–12, 14–21, 23–26 enforced + tested (BR-22 retired). Gaps below.

| # | sev | where | finding | fix |
|---|---|---|---|---|
| SPEC-1 | major | backend tests | BR-AUTH-13 has no named test (login / `/auth/me` return role, permissions, screens; super-admin gets all) | test-writer adds BR-AUTH-13 tests |
| SPEC-2 | minor | repository/approvalRepository.ts:394 | fallback approval chain hard-codes role "owner" → BR-AUTH-11 scan | move into seed data (F-APR-1) |
| SPEC-3 | minor | roleService, employeeService, pageService | codes ROLE_NOT_ASSIGNABLE, SCREEN_HAS_NO_KEY, UNKNOWN_KEY not in spec | add to spec |
| SPEC-4 | minor | roleService | no test names ROLE_HAS_INACTIVE_EMPLOYEES (spec v8) | test-writer adds |
| SPEC-5 | minor | routes/setup.ts | legacy /setup/pages and role_pages permission routes still live | S7 |
| SPEC-6 | minor | authService.refresh | inactive employee's refresh still consumes the token | none (harmless) |
