# Docker or port problem

Setup (`backend/docker-compose.yaml`): `diecast-postgres` = dev DB `diecast` on host port **5432** (kept
on a volume) · `diecast-postgres-test` = test DB `diecast_test` on **5433** (in memory, empty after every
restart). API runs on **4000**, UI on **3000**. All worktrees share these two containers.

## Symptom
- `bun test` or `db:test:prepare`: connection refused / `ECONNREFUSED` / test-runner reports `TEST-ENV`.
- `docker compose up -d`: "port is already allocated" or "Cannot connect to the Docker daemon".
- `bun run dev`: address already in use.
- `db:test:prepare` or `db:migrate` talks about the migration journal.

## Check
```bash
docker info > /dev/null && echo "docker ok"       # fails = Docker Desktop is not running
cd backend && docker compose ps                   # both services "running"?
docker compose logs --tail 30 postgres-test
lsof -nP -iTCP:5433 -sTCP:LISTEN                  # who holds a port (also 5432, 4000, 3000)
```

## Fix
**Docker not running** — an agent cannot start Docker Desktop for the owner. Treat as missing access:
go to "If it fails twice".

**Containers down**
1. `cd backend && docker compose up -d`
2. `docker compose ps` until `diecast-postgres-test` is running.
3. `bun run db:test:prepare` (always after a start: the test DB came back empty), then `bun test`.

**Port in use**
1. `lsof` shows `com.docker` → the container is already up (maybe started from another worktree). Use it.
2. 5432 / 5433 held by something else (a local Postgres) → do not stop it. Go to "If it fails twice".
3. 4000 / 3000 held by a dev server **this run** started → stop that one process. Held by anything else →
   leave it; automated checks do not need the dev servers. Only the visual check and "Try it" do; note it
   in the hand-over.

**Migrations out of sync**
1. Test DB: `bun run db:test:prepare` rebuilds it by itself on a journal mismatch and prints why.
2. CI "Schema changed without a migration" → [ci-red.md](ci-red.md), branch "Migration sync".
3. Dev DB (`bun run db:migrate` exits 3, or asks for `MIGRATE_CONFIRM`) → not an agent's job. The build
   and the tests never need the dev DB. Write in the hand-over: "dev DB needs `bun run db:migrate`".
4. Two worktrees with different migrations share the one test DB: each `db:test:prepare` rebuilds it for
   its own branch, so run `db:test:prepare` right before `bun test`, and never two test runs at once.

## If it fails twice
Still no test DB after two tries → the whole run is blocked, not one slice. Hard stop (missing access):
write the commands, exit codes and the `docker compose logs` tail to `.pipeline/<id>/reports/` and
`HANDOVER.md`, set `state.json` phase to `handover`, stop. Do the work that needs no DB first
(typecheck, lint, frontend) if a slice can still move.

## Never
- Never `docker compose down -v`, `docker volume rm`, or `docker system prune`: they delete the dev DB.
- Never kill a process you did not start, and never `kill -9` a Postgres.
- Never change ports in `docker-compose.yaml` or `.env.example` to get past a clash.
- Never point tests at the dev DB (5432 `diecast`) because the test DB is down.
- Never run `bun run db:reset` to "fix" migrations — see [test-db-reset.md](test-db-reset.md).
- Never run `bunx drizzle-kit push`: migrations are generated (`bun run db:generate`) and applied.
