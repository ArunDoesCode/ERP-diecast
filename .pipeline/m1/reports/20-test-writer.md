# Report 20 — test-writer — bootstrap-admin (BR-KD-17,20,23,25,27,28,29)

File: backend/scripts/bootstrap-admin.test.ts (16 tests). Result: 15 FAIL-EXPECTED (scripts/bootstrap-admin.ts does not exist), 1 PASS (unreachable DB -> exit 1, passes by accident). No FAIL-BUG.

Design: script runs as a child process against scratch DB `diecast_kd_bootstrap_test` (created/dropped on the DATABASE_URL_TEST server, schema via drizzle-kit push). Shared test DB untouched.

Assumptions the dev must meet: entry `bun scripts/bootstrap-admin.ts`; env BOOTSTRAP_ADMIN_NAME/EMAIL/PASSWORD/PHONE; role name `super-admin`; exit-3 message contains `db:reset`; exit-2 message contains "already bootstrapped"; success output has id, name, email, role.

Not testable here: hidden TTY prompt (BR-KD-17 terminal path), password never as CLI argument. BR-KD-29 uses host 0.0.0.0 as "non-localhost".
