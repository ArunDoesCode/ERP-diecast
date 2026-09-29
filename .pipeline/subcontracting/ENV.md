# Running checks in this worktree

There is no `backend/.env` (Claude may not write it). Prefix every backend bun command:

    bun --env-file=/Users/turbo_fltr/.claude/diecast-env/main-test.env <command>

e.g. `bun --env-file=… test`, `bun --env-file=… run typecheck`, `bun --env-file=… run db:test:prepare`.
Test DB: `diecast_test` on port 5433 (docker compose, already up). After a schema change: `bun --env-file=… run db:test:prepare`.

**CI parity (before any push):** CI builds the test DB with `db:reset --no-fixtures`, not `db:test:prepare`. Reproduce it with `DATABASE_URL` overridden to the test DB — the env file's `DATABASE_URL` is the DEV DB:
`SEED_USER_PASSWORD=ci-seed-password-1 DATABASE_URL=<DATABASE_URL_TEST value> bun --env-file=... run db:reset --no-fixtures`, then `bun test`. Never run `db:reset` without that override.
