# Report 01 — test-writer — db-migrations tests

Spec: docs/specs/db-migrations.md v1 (frozen). Brief had pointers only (no BRIEF-CONTAMINATION).
File: `backend/tests/scripts/db-migrations.test.ts` (47 tests, new; no existing test edited). Biome + tsc clean.
Run: `cd backend && bun test tests/scripts/db-migrations.test.ts` (~7 s now; each script test spawns `bun run <script>`).

## Result: 41 FAIL-EXPECTED, 6 PASS, 0 FAIL-BUG
Feature not built (`db:migrate` / `db:generate` missing, old migrations still there, CI/reset/prepare still push). All red for that reason.
The 6 passes are regression guards that are already true: no imports of old migration files (BR-MIG-02), no app import of the
drizzle migrator (BR-MIG-22), `backend/backups/*.dump` is gitignored (BR-MIG-16), CI has no push (BR-MIG-12),
`db:test:prepare` refuses a non-`_test` DB (BR-MIG-11, BR-KD-52), pg_dump-empty refusal (passes now only because `db:migrate`
is missing; it also asserts pg_dump was called, so it turns red/green correctly once built).

## Coverage by rule
| Rule | Tests |
|---|---|
| BR-MIG-01 | fresh DB: exit 0, journal = folder count, tables = schema exactly (no pages/role_pages), columns, enums+order, FK counts, named indexes; `drizzle-kit generate` says nothing to do, `drizzle-kit check` passes |
| BR-MIG-02 | old files/July folders gone, only `<14 digits>_name/{migration.sql,snapshot.json}`; no imports of old files in src/scripts/tests |
| BR-MIG-03 | baseline SQL contains every schema index + check name, the 4 named ones, lower(btrim(name)), WHERE on partial indexes; in the DB: indexdef has lower()/btrim()/WHERE, CHECK exists |
| BR-MIG-04 | 2nd folder SQL is exactly the two DROPs (comments/breakpoints stripped); old DB with pages+role_pages -> both gone, modules rows kept |
| BR-MIG-05 | `db:generate` / `db:migrate` exist; generate with schema in sync writes no folder (cleaned up if it does) |
| BR-MIG-07 | no `db:push` script, `bun run db:push` not found, no mention in package.json, scripts/, backend+root CLAUDE.md, docs/WORKFLOW.md, `.github`; separate test for `.claude/skills` + `.claude/agents` |
| BR-MIG-09 | `db:reset --no-fixtures`: public + drizzle dropped, journal = folder count, tables = schema, roles/policies/admin seeded; second reset same counts |
| BR-MIG-10 | `db:test:prepare` empty DB -> migrations + seed; re-run says "up to date", relation oids / journal xmin unchanged, seed counts equal |
| BR-MIG-11 | tables without journal -> says "rebuilding ... push/journal", sentinel + `pages` gone, rebuilt; unknown journal row -> rebuilt; non-`_test` DB refused untouched |
| BR-MIG-12 | ci.yml after `db:reset --no-fixtures` runs `drizzle-kit generate` + `check` and a git status/diff/ls-files on `migrations`; no push |
| BR-MIG-13 | target `host:port/db` printed, no password, pending list in order; failing 2nd migration (role_pages is a view) -> non-zero, names it, 1st rolled back, journal empty |
| BR-MIG-14 | unknown journal row -> refused, names it, snapshot (journal xmin + oids) unchanged; edited hash -> refused, unchanged |
| BR-MIG-15 | second run: "up to date", exit 0, journal + oids + xmin unchanged |
| BR-MIG-16 | `<db>-YYYYMMDD-HHMM.dump` in `backend/backups/`, non-empty, path printed, then applied; pg_dump fails / empty / missing -> refused, nothing applied; usual `_test` DB -> no dump |
| BR-MIG-17 | non-usual local DB, wrong confirm, remote host, local port 15432: exit 2, no pg_dump call, no connect for remote/tunnel |
| BR-MIG-22 | server starts with 1 pending migration and does not apply it |

## Not covered
- BR-MIG-08 (never edit merged migrations) — review/process rule, not code.
- BR-MIG-06 (migration in same PR) — only the CI half is tested via BR-MIG-12; the CI job going red needs a real CI run.
- BR-MIG-05 "add a column -> one new folder": needs a production schema change; only the no-change case is tested.
- BR-MIG-18..20 (db:adopt) — deferred by spec Q1 = B. BR-MIG-21 — a "use db:reset" doc rule, nothing to run.
- BR-MIG-12 does not execute the CI step; it checks the workflow text.

## How the tests isolate
Scripts are separate processes run against scratch DBs on the DATABASE_URL_TEST server: `diecast_mig_scratch_test`,
`diecast_mig_fresh_test` (usual local DB: no confirm/backup), `diecast_mig_guard` (needs MIGRATE_CONFIRM + backup).
Created in `beforeAll`, dropped in `afterAll`. A guard throws before spawning if a local target is not one of those.
`db:test:prepare` is run with `DATABASE_URL_TEST` = scratch and `DATABASE_URL` = an unused `_dummy` DB (never connected).
A fake `pg_dump` (shell script in a temp dir on PATH) writes a log and the `--file`/`-f`/stdout dump; no real pg_dump needed.
Backups from the guard DB are removed after each test.

## Spec ambiguities I resolved the plain way (flag if wrong)
1. "Usual local DB" = BR-KD-30 incl. its v3 clarification: localhost, port 5432/5433, name `diecast` or ending `_test`. Anything else needs `MIGRATE_CONFIRM`.
2. A wrong `MIGRATE_CONFIRM` value is treated like a missing one (exit 2).
3. Dump file name is `<db>-YYYYMMDD-HHMM.dump` (from the spec example) and its path appears in the output.
4. "File content changed" is simulated by changing the `hash` column of a journal row (assumes drizzle's journal keeps a hash).
5. `.claude/skills` and `.claude/agents` count as "docs" only in a separate test, so it can be waived.

## FINDINGS / conflicts with existing tests (no edits made)
| id | severity | area | file:line | finding | suggested fix |
|---|---|---|---|---|---|
| TEST-1 | minor | test | backend/tests/scripts/bootstrap-admin.test.ts:91 | existing test builds its scratch schema with `drizzle-kit push --force`. Spec BR-MIG-07: "no script applies schema by push" (scripts, not tests), so it still works while drizzle-kit has push, but it is the one remaining push user | test-writer follow-up after build: switch to migrations (needs a brief citing BR-MIG-07) |
| TEST-2 | minor | test | backend/tests/repository/approvalRepository.test.ts:5 | header comment says run `bun run db:push` | same follow-up |
| TEST-3 | minor | docs | .claude/agents/backend-dev.md:39, .claude/skills/feature/SKILL.md:29, docs/WORKFLOW.md:189, backend/CLAUDE.md | tell people to run `db:push`; my BR-MIG-07 tests go green only when these are updated | backend-dev/coordinator update docs |

## QUESTIONS
1. Do `.claude/agents` + `.claude/skills` count as "docs" for BR-MIG-07? (Recommend yes; separate test lets you waive.)
