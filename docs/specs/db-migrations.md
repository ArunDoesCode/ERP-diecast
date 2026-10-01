---
module: db-migrations
status: frozen           # draft | frozen | changed-after-freeze
version: 1
frozen_on: 2026-10-01
owner: Arun
depends_on: [known-defects, auth-setup]
backlog: [BL-011, BL-056]   # GitHub #16, #44; replaces decision D-004
---
# DB migrations (push → generated migrations)

## Summary

Today the schema reaches a database with `db:push` ("make the DB look like the code"). Before UAT-1 the
factory DB holds real data, so every schema change must become a numbered SQL file that is reviewed,
committed and applied once, in order, with a backup first. Forward-only: no "down" scripts; going back
means restoring the backup. The old `pages` / `role_pages` tables are dropped by the second migration.

Done = an empty DB gets the full schema from `bun run db:migrate`; `db:reset`, `db:test:prepare` and CI
use migrations, not push; CI fails when a schema change has no migration; an existing push-built DB can
be adopted without losing a row.

## Who can do what

| Action                                             | Allowed                                          |
| -------------------------------------------------- | ------------------------------------------------ |
| `db:generate` (write a migration file)           | developer, in a PR                               |
| `db:migrate` on a local `*_test` DB              | anyone with shell                                |
| `db:migrate` on any other DB (local dev `diecast`, UAT, prod, tunnel) | owner / plant IT, with typed confirm (BR-MIG-17) and a backup (BR-MIG-16) |
| `db:adopt` (one-time, push-built DB)             | plant IT / owner, with typed confirm             |

Scripts are not HTTP routes. Their guard is shell access plus the rules below.

## Flow (state of one database)

| From                                 | Action               | To                     | Rule          |
| ------------------------------------ | -------------------- | ---------------------- | ------------- |
| empty                                | `db:migrate`       | up to date             | BR-MIG-01, 13 |
| built by push (no journal)           | `db:adopt`         | up to date             | BR-MIG-18..20 |
| up to date                           | new migration merged | behind                 | BR-MIG-06     |
| behind                               | `db:migrate`       | up to date             | BR-MIG-13, 16 |
| up to date                           | `db:migrate`       | up to date (no writes) | BR-MIG-15     |
| ahead of the code / edited migration | `db:migrate`       | refused, unchanged     | BR-MIG-14     |
| local dev or test                    | `db:reset`         | up to date + seed      | BR-MIG-09     |

"Journal" = drizzle's table `drizzle.__drizzle_migrations`, one row per applied migration.

## Rules

IDs are permanent (strike out, never renumber).

### Migration files

| ID        | Rule                                                                                                                                                                                                                             | Example (given → then)                                                                                                                                                                                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BR-MIG-01 | One baseline migration, made by`drizzle-kit generate` from `src/db/schemas`, creates every table, enum, index and constraint the code has today.                                                                             | Empty DB,`db:migrate` → all tables exist; `drizzle-kit generate` right after says nothing to do                                                                                                                                                                                        |
| BR-MIG-02 | The old files in`src/db/migrations` (three July 2026 folders, `schema.ts`, `relations.ts`, empty `index.ts`) are deleted before the baseline is generated; nothing in `src/`, `scripts/` or `tests/` imports them. | After delete →`typecheck`, `lint`, `bun test` green; only the new folders remain                                                                                                                                                                                                     |
| BR-MIG-03 | The baseline SQL contains every expression and partial index and every check constraint from the schema, by name.                                                                                                                | Baseline has`uq_locations_name_norm` on `lower(btrim("name"))`, the other `*_norm` indexes, `uq_locations_one_main_store`, `uq_open_approval_request_per_doc`, `idx_inventory_ledger_sco_loss`, and `CHECK` `company_settings_single_row`; one missing → baseline rejected |
| BR-MIG-04 | The second migration is a custom one (`drizzle-kit generate --custom`) with exactly `DROP TABLE IF EXISTS role_pages;` then `DROP TABLE IF EXISTS pages;`.                                                                 | Fresh DB → runs, changes nothing. Old DB with both tables → both gone,`modules` and its rows kept                                                                                                                                                                                       |
| BR-MIG-05 | `package.json` has `db:generate` (write a new migration from the schema) and `db:migrate` (apply pending migrations to `DATABASE_URL`).                                                                                  | Add a column,`bun run db:generate` → one new folder with `migration.sql` + `snapshot.json`                                                                                                                                                                                           |
| BR-MIG-06 | Every schema change ships its generated migration in the same PR; hand-written SQL only via`generate --custom`, never typed into a DB.                                                                                         | PR adds`item_master.weight_g` with no new migration folder → CI fails (BR-MIG-12)                                                                                                                                                                                                        |
| BR-MIG-07 | `db:push` is removed from `package.json`, scripts and docs; no script applies schema by push.                                                                                                                                | `bun run db:push` → "script not found"                                                                                                                                                                                                                                                   |
| BR-MIG-08 | Forward-only: a migration merged to`main` is never edited, renamed or deleted; a mistake is fixed by a new migration, a bad run by restoring the backup.                                                                       | Wrong default in a merged migration → new migration that alters it                                                                                                                                                                                                                         |

### Scripts that build a DB

| ID        | Rule                                                                                                                                                                                                         | Example (given → then)                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| BR-MIG-09 | `db:reset` keeps its guard and steps, but its schema step applies the migrations (after dropping `public` and `drizzle`) instead of pushing.                                                           | `db:reset` → journal has 2 rows, then roles, admin, policies, fixtures as today               |
| BR-MIG-10 | `db:test:prepare` applies pending migrations to the test DB, then the seed; a re-run with nothing pending changes no schema.                                                                               | Second run → "up to date", seed re-applied idempotently                                         |
| BR-MIG-11 | If the test DB has tables but no journal, or a journal row the repo doesn't have,`db:test:prepare` drops its `public` and `drizzle` schemas and rebuilds, saying why. Only a `*_test` DB (BR-KD-52). | Old test DB with`pages` → "built by push, rebuilding", then green (closes the BL-056 blocker) |
| BR-MIG-12 | CI, after`db:reset --no-fixtures`, runs `drizzle-kit generate` and `drizzle-kit check`; any new or changed file under `src/db/migrations` fails the job.                                             | Schema edited, migration forgotten → CI red, names the folder generate created                  |

### Applying migrations

| ID        | Rule                                                                                                                                                                                                                                  | Example (given → then)                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| BR-MIG-13 | `db:migrate` prints the target (`host:port/db`, password hidden) and the pending list, then applies them in order in one transaction; any error rolls all of them back and exits non-zero.                                        | 2 pending, the 2nd fails → DB still as before the run, exit 1, error names the migration                                         |
| BR-MIG-14 | `db:migrate` refuses, changing nothing, when the journal has a migration the repo doesn't have or whose file content changed.                                                                                                       | Old code run against a DB migrated by a newer branch → refused, names the unknown migration                                      |
| BR-MIG-15 | Nothing pending → prints "up to date", writes nothing, exit 0.                                                                                                                                                                       | Run twice → second run makes no writes                                                                                           |
| BR-MIG-16 | Before applying anything to a DB that is not the usual local dev/test DB (same test as`db:reset`, BR-KD-30), `db:migrate` writes a `pg_dump` file to `backend/backups/` (gitignored) and stops if the dump fails or is empty. | UAT DB →`backups/diecast_uat-20261001-1030.dump` printed, then migrations run; `pg_dump` missing → refused, nothing applied |
| BR-MIG-17 | On such a DB`db:migrate` also needs `MIGRATE_CONFIRM=<db name>`; without it, it refuses before the backup.                                                                                                                        | `DATABASE_URL` = factory DB, no confirm → refused, exit 2                                                                      |

### Adopting a DB built by push (dev, UAT)

| ID        | Rule                                                                                                                                                                                                                                  | Example (given → then)                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| BR-MIG-18 | `db:adopt` runs only on a DB that has tables in `public` and no journal; otherwise it refuses and says which command to use.                                                                                                      | Empty DB → "use db:migrate"; DB with journal → "already on migrations"                                     |
| BR-MIG-19 | `db:adopt` takes the backup (BR-MIG-16, 17), then compares the DB's tables, columns, types, indexes and constraints with the baseline, ignoring `pages` / `role_pages`; any difference stops it with the list, nothing changed. | UAT DB lacks`machines.code` → refused, lists `machines.code`                                            |
| BR-MIG-20 | On a match,`db:adopt` records the baseline as applied without running its SQL, then runs `db:migrate`.                                                                                                                            | UAT DB → journal 2 rows,`pages` / `role_pages` gone, every other table has the same row count as before |
| BR-MIG-21 | A local dev DB with no data to keep is not adopted; it is rebuilt with`db:reset`.                                                                                                                                                   | Old dev DB →`db:reset`                                                                                    |
| BR-MIG-22 | The app never applies migrations when it starts; migrating is always an explicit step.                                                                                                                                                | Server started with 1 pending → starts, no schema change                                                    |

## Not now

- Down / rollback scripts (restore the backup instead).
- App refusing to start while migrations are pending.
- Seed data (roles, permission catalog, policies) inside migrations — stays in scripts.
- Zero-downtime tricks (`CREATE INDEX CONCURRENTLY`), squashing old migrations, scheduled backups.
- One DB per customer factory (multi-tenant upgrades).

## Questions for you

Max 7. Each answerable with a letter. Recommended option first.

| #  | Question                                                                  | Options                                                                                                           | Answer |
| -- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------ |
| Q1 | Does any DB built by push hold data you must keep (UAT box, demo laptop)? | **A** Yes or not sure — build `db:adopt` now / B No — UAT starts empty; BR-MIG-18..20 move to "Not now" | B      |
| Q2 | Who takes the backup before migrating a real-data DB?                     | **A** `db:migrate` runs `pg_dump` itself (BR-MIG-16) / B a manual runbook step                          | A      |
| Q3 | Keep a local-only push for quick experiments?                             | **A** No, remove `db:push` (BR-MIG-07) / B keep `db:push:sandbox`, refused on anything but local dev    | A      |

## Changelog

- 2026-10-01 v1 — draft from BL-011 (#16), BL-056 (#44), D-004
- 2026-10-01 v1 frozen (Arun): Q1 B (UAT starts empty; BR-MIG-18..20 deferred), Q2 A (`db:migrate` runs `pg_dump`), Q3 A (`db:push` removed).
- 2026-10-01 v1 clarified during build: BR-MIG-07 'docs' means the repo docs, scripts, CI and package.json; the `.claude/` agent and skill files are the owner's to update (they still say `db:push`). BR-MIG-16's 'usual local dev/test DB' is BR-KD-30 as in known-defects v5: a local `*_test` DB on 5432/5433.
- 2026-10-01 v1 clarified during build (review): (1) the local dev DB `diecast` is not 'usual' — `db:migrate` on it needs `MIGRATE_CONFIRM=diecast` and a working `pg_dump` (install with `brew install libpq`); a dev who wants a clean DB uses `db:reset`. (2) BR-MIG-09/10/11 say how the schema is applied for `db:reset` and `db:test:prepare` (migrate, then seed; rebuild a push-built or mismatched test DB); they replace the 'push schema' wording in known-defects BR-KD-35 and the 'db:test:prepare = db:reset --no-fixtures' wording in BR-KD-52 (the guard rules of KD-30/53 still apply). (3) Also in force: a pending migration older than one already applied is refused (a 'journal mismatch', rebuild for test DBs); migrations run under one advisory lock; a dump file name that already exists in the same minute is refused; a URL with several hosts or no database name is refused (exit 2); a journal problem exits 3. (4) A push-built dev DB gives 'already exists' on the baseline — use `db:reset` (BR-MIG-21).
- 2026-10-01 v1 clarified during build (security review): (1) the backup folder is mode 0700 and each dump file 0600 (a dump holds password hashes and business data); (2) the dump file name uses only a safe form of the database name; (3) `db:migrate` and `db:test:prepare` judge the host, port and database the driver will really use, the same way as known-defects BR-KD-53, so a URL with several hosts or an encoded host is refused (exit 2); (4) a push-built dev DB run through `db:migrate` is refused with the message 'built by push? use db:reset' (BR-MIG-21); (5) `db:test:prepare` rebuilds only on a journal mismatch, never on any other error.
