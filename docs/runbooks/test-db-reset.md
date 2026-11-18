# Test DB reset

> **Safety fact.** `bun run db:reset` wipes the database named in **`DATABASE_URL`**. In `.env` and in the
> run's env file that is the **dev** DB (`localhost:5432/diecast`). It does **not** use
> `DATABASE_URL_TEST`. Only `bun test` and `bun run db:test:prepare` switch to the test DB on their own.
> On 2026-09-29 a "reproduce CI" run wiped the owner's dev DB this way.

## Symptom
- Many unrelated tests fail together (403, missing role, empty tables).
- Test DB container was restarted (it is in memory: `tmpfs` in `backend/docker-compose.yaml`).
- Tests pass locally but fail in CI and you want the same DB as CI.

## Check
```bash
cd backend && docker compose ps            # diecast-postgres-test must be running (host port 5433)
```
Test DB URL (from `backend/.env.example`): `postgres://postgres:postgres@localhost:5433/diecast_test`

## Fix
1. **First choice — no reset needed.** This only ever touches `DATABASE_URL_TEST`, and refuses a name that
   does not end in `_test`:
   ```bash
   cd backend && bun run db:test:prepare      # needs SEED_USER_PASSWORD (8+ chars) in the env
   ```
   It applies migrations and the seed, and rebuilds the test DB by itself when its migration journal does
   not match the repo. Then `bun test`.
2. **Only if step 1 fails, or to copy CI exactly** — reset the test DB. Print the target first:
   ```bash
   cd backend
   T=postgres://postgres:postgres@localhost:5433/diecast_test
   DATABASE_URL="$T" bun -e 'const u=new URL(process.env.DATABASE_URL);console.log("target:",u.host+u.pathname)'
   ```
   The line must read exactly `target: localhost:5433/diecast_test`. Anything else → stop.
3. Reset, the way CI does it (`.github/workflows/ci.yml`, step "Test DB schema + seed"), in **one** line so
   the override cannot get lost between commands:
   ```bash
   cd backend && DATABASE_URL=postgres://postgres:postgres@localhost:5433/diecast_test bun run db:reset --no-fixtures
   ```
   With an env file: `DATABASE_URL=<same url> bun --env-file=<path> run db:reset --no-fixtures`
   (a value given on the command line wins over the file).
4. The first output line must be `db:reset target: localhost:5433/diecast_test (password ***)`.
   Any other database → hard stop. Then `bun test`.

`SEED_USER_PASSWORD` comes from the env file (CI sets a throw-away value in `ci.yml`; test DB only).
A wrapper script that does steps 2–3 and refuses a non-`_test` name is **missing — to be added**.

## If it fails twice
`db:test:prepare` and the reset both fail → [docker-or-port-problem.md](docker-or-port-problem.md).
Still failing → this is an environment failure for the whole run, not one slice: write the command, exit
code and last 20 output lines to `.pipeline/<id>/reports/` and `HANDOVER.md`, set `state.json` phase to
`handover`, stop. Exit code 2 = the guard refused; 4 = `SEED_USER_PASSWORD` missing or too short.

## Never
- Never run a bare `bun run db:reset`. Never run it with `DATABASE_URL` pointing at `diecast`.
- Never set `DB_RESET_CONFIRM` or pass `--allow-remote`. They exist to get past the guard; an agent
  never needs them. Same for `MIGRATE_CONFIRM` with `db:migrate`.
- Never trust the guard alone. It asks for a confirm on local non-test DBs today, but the rule is yours.
- Never `export DATABASE_URL=…` in a shell and reset in a later command.
- Never point `DATABASE_URL_TEST` at a DB whose name does not end in `_test`.
- Never run `docker compose down -v`: it deletes the dev DB volume.
