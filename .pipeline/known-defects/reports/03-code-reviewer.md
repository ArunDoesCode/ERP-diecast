# Report 03 — code-reviewer — BR-KD-30, 35, 52 (db-reset.ts, prepare-test-db.ts)

Result: 1 major, 3 minor. The v5 guard matches the spec except one regression (empty DB name). Not run: I did not execute db-reset (it can drop a DB).

| id | severity | area | file:line | finding | suggested fix |
|---|---|---|---|---|---|
| CR-1 | major | backend | backend/scripts/db-reset.ts:68,96 | `const confirm = process.env.DB_RESET_CONFIRM ?? ""` makes "unset" equal `""`. A URL with no DB name (`postgres://postgres:x@localhost:5432`) gives `dbName = ""`, so `confirm !== dbName` is false and the guard passes with no confirm. Same for a remote host with `--allow-remote` and no confirm (line 83). The server then picks its default DB (user name / `postgres`) and the script drops its `public` schema. Old code compared `undefined !== dbName`, which refused. Regression of BR-KD-30 ("any other local DB needs the confirm"). | Refuse when `dbName === ""` (exit 2, "DATABASE_URL has no database name") right after parsing; or keep `confirm` as `string \| undefined` and require `confirm !== undefined && confirm === dbName`. Needs a test (test-writer). |
| CR-2 | minor | backend | backend/scripts/prepare-test-db.ts:27 | The child inherits the full env, so a stray `DB_RESET_CONFIRM=diecast` (left in the shell after a dev reset) makes `db:test:prepare` fail with exit 2 "does not match 'diecast_test'". `db:test:prepare` never needs a confirm. | Drop it from the child env: `const { DB_RESET_CONFIRM: _c, ...env } = process.env;` then pass `{ ...env, DATABASE_URL: url }`. |
| CR-3 | minor | backend | backend/scripts/prepare-test-db.ts:26 | Spawns `"bun"` from PATH. If run through another runner or a different bun, the version can differ from the one running the script. | Use `process.execPath`. |
| CR-4 | minor | docs | backend/CLAUDE.md:94; docs/WORKFLOW.md:144 | Both still say `db:test:prepare` pushes "schema + page-access seed". It now drops `public`+`drizzle`, runs the full `db:reset --no-fixtures` and needs `SEED_USER_PASSWORD` (exit 4 without it). A developer following the doc gets exit 4. Also `src/db/seed_roles.sql` is now unused. | Coordinator updates both lines (needs `SEED_USER_PASSWORD`); delete `seed_roles.sql` in a follow-up if nothing else reads it. |

## Checked and fine
- Order of checks: production, then mismatched confirm, then local/remote rules. All refusals exit 2 before any connection.
- Local `*_test` on 5432/5433 with no confirm runs; `diecast` needs a matching confirm; wrong confirm is refused on every path.
- `prepare-test-db.ts` calls `resolveTestDatabaseUrl()` (missing, invalid, not `*_test`, equals `DATABASE_URL` all give exit 2). Child exit code is passed through; a null exit code (signal) becomes 1. `DATABASE_URL` for the child is the test URL, so no step can reach the dev DB.
- Rotate-password warning is still only printed for `--allow-remote`; unchanged from v3, matches spec.
