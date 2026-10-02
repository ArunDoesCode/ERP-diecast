# Report 01 — backend-dev — prepare-test-db.ts merge

Result: conflict resolved, no markers left. tests/scripts/ 203 pass, full bun test 1509 pass, typecheck clean, lint exit 0 (warnings only, all in test files), biome clean on scripts/.

## What changed
- backend/scripts/prepare-test-db.ts rewritten as one file (only file changed):
  - Target refusals exit 2 before connecting, in order: resolveTestDatabaseUrl (missing, invalid, not `*_test`, equals DATABASE_URL), then lib/migrate parseTarget (several hosts, any query string, no db name) and assertDriverMatches (encoded host), then non-local host.
  - SEED_USER_PASSWORD missing or under 8 chars: exit 4, before any write, value never printed.
  - Then: rebuild only when tables-without-journal or JournalMismatchError (public + drizzle dropped, reason printed); applyMigrations; seed_roles.sql; syncCatalog + seedGrants; admin via bootstrap-admin child (exit 2 "already bootstrapped" accepted on re-run); approval policies via seed-approval-policies child. Same result as db:reset --no-fixtures (test compares roles, keys, grants, employees, table counts).
  - A failing step exits 1 and leaves the schemas alone (non-journal errors never rebuild).
- backend/scripts/db-reset.ts checked, not edited: still has the BR-KD-53 guard (query string, several hosts, driver-read host/port/db, confirm rules, exit 2/4) and an "apply migrations" step via lib/migrate (BR-MIG-09); no push or drizzle-reset config left.

## Notes
- Not a spec conflict: KD-52 "db:test:prepare runs db:reset --no-fixtures" is replaced by BR-MIG-10/11 (migrate in place, rebuild only on mismatch), per the db-migrations changelog. The result is still identical to db:reset --no-fixtures. The script no longer spawns db:reset.
- Tests need SEED_USER_PASSWORD in the env (the worktree backend/.env has none); I ran with a throwaway value.

## Map updates
- db:test:prepare no longer shells out to db:reset; it migrates in place and seeds (roles sql, permission sync, bootstrap-admin child tolerating exit 2, approval-policies child). Keep its seed steps in line with db-reset's steps.
- Trap: tests/scripts and db:test:prepare need SEED_USER_PASSWORD (>= 8 chars) in the env.
