# Report 08 — backend-dev — security/code-review fixes (db-migrations)

Result: DONE. `bun test` 1410 pass, 1 fail (the `.claude` db:push scan, red by design). typecheck clean, lint 0 errors (259 pre-existing warnings). No routes changed, so no contract regen.

## Fixes
| id | what | where |
|---|---|---|
| SEC-1 | backup folder `mkdir` mode 0700 + `chmod` 0700; `process.umask(0o077)` around the `pg_dump` spawn (file born 0600); `chmod` 0600 after | backend/scripts/db-migrate.ts (backup()) |
| SEC-6 | dump file name = `safeFileName(dbName)` (only `A-Za-z0-9_-`, so no `/`, no `..`) | backend/scripts/lib/migrate.ts (safeFileName), db-migrate.ts |
| SEC-2/4 | new `assertDriverMatches(sql, target)`: compares the built client's `options` (one host, one port, database, no socket path) with the parsed target; no connect. Called in `db:migrate` (exit 2, before backup) and `db:test:prepare` (exit 2, before connect). `parseTarget` now keeps the db name as written (the driver does not decode it) and has a `local` flag; prepare also refuses a non-local host (rebuild drops schemas) | migrate.ts, db-migrate.ts, prepare-test-db.ts |
| CR-4 | prepare rebuilds only on `JournalMismatchError`; any other error is rethrown, nothing dropped | prepare-test-db.ts |
| CR-2 / BR-MIG-21 | `db:migrate`: empty journal + tables in `public` → "built by push? use db:reset", exit 2, before plan/backup/apply | db-migrate.ts |
| docs | handbook command table, glossary (Migration, Schema push), "Migrations vs push"; one line each in subcontracting, grn, auth-setup, suppliers maps | docs/ |

## Map updates
- migrate.ts exports: `assertDriverMatches`, `safeFileName`; `Target.local`.
- Trap: postgres.js does NOT decode an encoded host in some URLs (`%6Cocalhost` is sent to DNS as-is), and sends the db name undecoded. So the guard must read the same raw values; parse-and-decode in the guard is the bug class behind SEC-2.
- Trap: `Bun.spawn` takes the umask at spawn time; set it just before, restore right after.
- Not done: CR-4(b) (journal table from an older drizzle without `name` column makes `readJournal` throw in prepare instead of rebuilding), CR-1/3/5/6, SEC-3 (db-reset parser), SEC-5 (pg_dump env scrub). Not in brief.

## QUESTIONS
none
