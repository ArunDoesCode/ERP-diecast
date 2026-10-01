# Report 02 — backend-dev — BR-KD-30, 35, 52

Result: `bun test tests/scripts/` 90 pass / 0 fail. `typecheck` clean. `lint` exit 0 (260 pre-existing warnings, none in these files).

## Changes
- `backend/scripts/db-reset.ts` (guard block, ~l.67-100): confirm set but != db name -> exit 2 always. Non-local needs `--allow-remote` + matching confirm. Local: only `*_test` on 5432/5433 runs with no confirm; anything else (incl. `diecast`) needs matching `DB_RESET_CONFIRM`. Removed v3 "diecast is usual" and "confirm without --allow-remote refused". Production check unchanged. Rotate-password warning still tied to `--allow-remote`.
- `backend/scripts/prepare-test-db.ts`: rewritten. Calls `resolveTestDatabaseUrl()` (missing / invalid / not `*_test` / equals DATABASE_URL) -> exit 2. Then spawns `bun scripts/db-reset.ts --no-fixtures` with `DATABASE_URL=DATABASE_URL_TEST`. db:reset's own input check gives exit 4 for a missing/short SEED_USER_PASSWORD before any write; child exit code is passed through.

## Map updates
- `db:test:prepare` no longer does a drizzle-kit push + seed_roles.sql by itself; it is `db:reset --no-fixtures` on the test URL (drops `public` + `drizzle` schemas each run). Schema step is still `drizzle-kit push` (inside db:reset); migrations switch comes later.
- It now needs `SEED_USER_PASSWORD` in the environment (exit 4 otherwise); the test DB gets `admin@diecast.local`.
- `db-reset.ts` guard v5 rule: only local `*_test` on 5432/5433 is confirm-free; a local `diecast` needs `DB_RESET_CONFIRM=diecast`.
- Trap: `DB_RESET_CONFIRM` that is set but wrong is refused even on a `*_test` DB.
- `src/db/seed_roles.sql` is no longer used by prepare-test-db (db:reset seeds roles from `SEED_GRANTS`); not deleted (out of scope).
