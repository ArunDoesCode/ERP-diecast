# Report 04 — code-reviewer — db-migrations (main...HEAD, production code)

Result: no blocker, no major. The baseline and runner match the spec (BR-MIG-01..07, 09..17, 21, 22). 5 minor items.

## Checked, no problem
- Baseline SQL by eye: 44 `CREATE TABLE` = 44 `pgTable`; 56 `CREATE INDEX` = 56 index/uniqueIndex in schemas; 19 enums; `uq_*_norm` use `lower(btrim("col"))`; partial indexes keep their WHERE (`uq_locations_one_main_store`, `uq_open_approval_request_per_doc`, `idx_inventory_ledger_sco_loss`); the only `check()` (`company_settings_single_row`, id = 1) is present; FKs include ON DELETE CASCADE / SET NULL where the schema has them; no `pages` / `role_pages` in the baseline.
- Drop migration is exactly the two `DROP TABLE IF EXISTS` (role_pages, then pages).
- `applyMigrations`: advisory lock, re-plan under the lock, one transaction, journal insert per migration, error names the migration. Correct.
- `planFrom`: unknown row, edited hash, out-of-order all throw before any write (exit 3).
- `db:migrate` guard: confirm check runs before connect and before backup; no dump when nothing is pending; creds go via PG* env, not argv; stderr scrubbed.
- postgres.js URL query params cannot override host (checked `parseOptions`), so `parseTarget` is not bypassable that way.
- CI step is after `db:reset`, runs `generate` + `check`, and `git status --porcelain` catches new and changed files.
- `db-reset.ts` guard differences vs v5 are expected (separate branch); the schema step swap is correct.

## Findings
| id | severity | area | file:line | finding | suggested fix |
|---|---|---|---|---|---|
| CR-1 | minor | backend | backend/CLAUDE.md:93 (+ backend/scripts/db-migrate.ts:44) | Doc says `bun run db:migrate` "apply pending migrations to DATABASE_URL (dev DB)". Dev DB is `diecast`, which is not a `*_test` DB, so BR-MIG-16/17 (v5) make it "unusual": plain `db:migrate` exits 2 (needs `MIGRATE_CONFIRM=diecast`), then needs `pg_dump` on PATH (not installed on this host, per report 03). Input: dev runs documented command → refused, doc gives no hint. | Doc: add "dev DB needs `MIGRATE_CONFIRM=diecast` and pg_dump; or use `db:reset`". See Question 1. |
| CR-2 | minor | backend | backend/scripts/db-migrate.ts:104-111, backend/scripts/lib/migrate.ts (hasPublicTables) | `db:migrate` on a push-built DB (tables, no journal) runs the baseline and dies with a raw Postgres `type "..." already exists` (rolled back, exit 1), after taking a pg_dump on unusual targets. Nothing says "built by push: use db:reset (dev) / adopt is deferred". `hasPublicTables` already exists. | Before the backup: if journal empty and `hasPublicTables`, exit 2 with that message. |
| CR-3 | minor | backend | backend/scripts/lib/migrate.ts:73-78 | Out-of-order refusal: branch B generates migration t=5, branch A (t=6) merges and is applied to UAT, then B merges. `db:migrate` on UAT refuses forever ("older than one already applied"); the only way out is renaming B's folder (BR-MIG-08 says never edit merged migrations). Refusing is safer than drizzle's silent skip, but the remedy is nowhere written. | Document in backend/CLAUDE.md: if B is not yet merged, regenerate after rebasing; if merged, add a new migration with the fix. Optional: CI check that new migration timestamps are newer than main's latest. |
| CR-4 | minor | backend | backend/scripts/prepare-test-db.ts:23-30; backend/scripts/lib/migrate.ts:31-37 | (a) `catch` treats ANY `plan()` error as "journal mismatch" and drops `public`+`drizzle`; `plan()` can also throw from `readMigrationFiles` (e.g. old `meta/_journal.json` found), so the DB is wiped for a non-journal reason and the same error then repeats. (b) `readJournal` selects `name`; a journal table made by an older drizzle (no `name` column) throws `column "name" does not exist` in `readJournal` (prepare-test-db.ts:20) instead of taking the rebuild path. | (a) rebuild only on `instanceof JournalMismatchError`, rethrow others. (b) read `to_regclass` + information_schema columns, or treat that failure as mismatch. |
| CR-5 | minor | backend | backend/scripts/db-migrate.ts:73-79 | pg_dump gets `PGHOST=target.host`; for an IPv6 target `u.hostname` is `[::1]` (brackets), which libpq rejects. URL query settings (`?sslmode=require`) are not forwarded to pg_dump, so the dump may connect differently from the migration connection. Only hits unusual targets. | Strip brackets for PGHOST; pass `PGSSLMODE` from `searchParams.get("sslmode")`. |
| CR-6 | minor | backend | .github/workflows/ci.yml:50-61 | `drizzle-kit generate` asks interactively when it sees a possible column rename; CI has no TTY, so a rename PR hangs the job until the 6 h job limit instead of failing with a message. | Add `timeout-minutes: 3` to the step (or `< /dev/null`) and a line in backend/CLAUDE.md on renames. |

## QUESTIONS
1. CR-1: is it intended that the local dev DB `diecast` needs `MIGRATE_CONFIRM` + `pg_dump` (spec changelog says BR-MIG-16 'usual' = local `*_test` only)? Recommend yes (spec is explicit); fix is doc only.

## Out of scope / not reviewed
- Tests (`backend/tests/scripts/db-migrations.test.ts`), `.claude/**` (owner's), known-defects guard changes (other branch).
