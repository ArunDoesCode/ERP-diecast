# Report 11 — backend-dev — SEC-7
Fix: `parseTarget` (backend/scripts/lib/migrate.ts, before the host/port parse) throws when the raw URL contains `?`. Any query string is refused, including encoded keys and mixed keys. `db:migrate` (parse runs before connect/backup) and `db:test:prepare` (parse runs before the first query; building the client does not connect) turn it into exit 2 "Refused: ...". The two scripts needed no edits.
Checks: `bun test tests/scripts/db-migrations.test.ts` 81 pass / 1 fail (the .claude db:push scan, red by design). typecheck exit 0, lint exit 0 (warnings only, pre-existing).

## Map updates
- Gotcha for the db-migrations map: DATABASE_URL and DATABASE_URL_TEST may not carry a query string. postgres.js applies `?database=`, `?host=`, `?user=` etc. at connect time, after the path-based guard; `parseTarget` refuses any `?`. Any future script that calls `parseTarget` inherits this.
