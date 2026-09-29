# Running checks in this worktree

There is no `backend/.env` (Claude may not write it). Prefix every backend bun command:

    bun --env-file=/Users/turbo_fltr/.claude/diecast-env/main-test.env <command>

e.g. `bun --env-file=… test`, `bun --env-file=… run typecheck`, `bun --env-file=… run db:test:prepare`.
Test DB: `diecast_test` on port 5433 (docker compose, already up). After a schema change: `bun --env-file=… run db:test:prepare`.
