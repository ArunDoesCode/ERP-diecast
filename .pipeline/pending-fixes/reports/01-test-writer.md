# Report 01 — test-writer — manual checklist (pending-fixes)
Written from the three frozen specs only. Not run. No test files changed.

Shell items: use scratch databases only (e.g. `diecast_scratch_test`, `diecast_scratch`), never the real dev or test DB. Set `SEED_USER_PASSWORD` and `DATABASE_URL` per item. Check the exit code with `echo $?`.

## A. Subcontracting date pickers (docs/specs/subcontracting.md v4)

Setup: log in as a role that can create SCOs and issue material; have one open SCO with a vendor and raw item (item has `hsn_code`, company settings filled). To test the day boundary, set the computer clock between 00:00 and 05:30 IST, or use a browser set to a timezone like US Pacific so the browser day differs from the IST day.

### BR-SCO-03 Expected return date (`/subcontracting/new`, `/subcontracting/[scoId]/edit`)
- [ ] Open the form. Pick a date before today (IST) in the Expected return date. Expected: refused, picker/min blocks it.
- [ ] Pick today (IST day). Expected: accepted. Save works.
- [ ] Pick exactly 365 days after today (IST). Expected: accepted.
- [ ] Pick 400 days away. Expected: refused (400) when saved.
- [ ] Clear the date. Expected: required, cannot save.
- [ ] Early-morning check (02:00 IST, browser in a timezone still on the previous day): the earliest selectable date equals the IST date, not the browser date.

### BR-SCO-09 Challan date (`/subcontracting/[scoId]` → Issue material)
- [ ] Open the Issue material dialog. Expected: Challan date defaults to today (IST).
- [ ] Early-morning check (02:00 IST on 1 Oct): default shows 1 Oct, even if the browser day is 30 Sep.
- [ ] Pick tomorrow (IST) as the challan date. Expected: blocked in the picker; if forced through the API, 400.
- [ ] Issue with today's date. Expected: challan created, number `JWC/<FY>/<seq>`, date shown is the day you picked (not one day earlier).
- [ ] Pick a date on or after 1 Apr of a new FY (use a past date in that FY if allowed). Expected: number carries that FY (e.g. `JWC/27-28/1`).
- [ ] Wrong role (no issue permission). Expected: no Issue button, or 403 on submit.

### BR-SCO-11 Days left and deemed supply (`/subcontracting/challans`, `/subcontracting/challans/[challanId]`)
- [ ] Open challan list. Open challans show "days left" as whole days, counted from the IST day. Spot check one: due date minus today (IST) equals the number shown.
- [ ] Early-morning check (02:00 IST): the count does not drop by one compared to a daytime view.
- [ ] Challan with 60 days or fewer left. Expected: warning shown.
- [ ] Challan past due. Expected: "overdue: deemed supply, tell accounts" shown.
- [ ] Create a new challan to the same vendor as an overdue challan. Expected: allowed, nothing blocked.

(Note: the frontend report lists only the issue dialog, receipt dialog and SCO form as touched. The challan list/detail days-left screens are not on that list; check them anyway, since BR-SCO-11 says "on screen".)

### Receipt date (same IST fix, no BR in this brief)
- [ ] `/subcontracting/[scoId]` → Enter receipt: Received date defaults to today (IST). At 02:00 IST it shows the IST date, not the UTC date.

## B. DB reset guard (docs/specs/known-defects.md v5)

Create two scratch DBs first: `createdb diecast_scratch_test` and `createdb diecast_scratch`.
Each line: run, then check exit code and that existing data is untouched (add one marker row before, check after).

### BR-KD-30 Guard
- [ ] `DATABASE_URL=postgres://…@localhost:5432/diecast_scratch` (not `_test`), no confirm: `bun run db:reset --no-fixtures`. Expected: exit 2, data untouched.
- [ ] Same, with `DB_RESET_CONFIRM=diecast_scratch_test` (wrong name). Expected: exit 2.
- [ ] Same, with `DB_RESET_CONFIRM=diecast_scratch`. Expected: runs, DB rebuilt.
- [ ] `…@localhost:5432/diecast_scratch_test`, no confirm. Expected: runs.
- [ ] `_test` DB on port 6543 (or any port other than 5432/5433), no confirm. Expected: exit 2.
- [ ] Non-local host (e.g. `db.example.com`) with a matching confirm, no `--allow-remote`. Expected: exit 2 before connecting.
- [ ] `NODE_ENV=production` on localhost, with a correct confirm. Expected: exit 2, no override.
- [ ] Local `diecast` (the real dev DB name) with no confirm. Expected: exit 2. (Do not give it the confirm.)

### BR-KD-53 Guard reads the DB the driver really uses
- [ ] URL with no database name (`postgres://u:p@localhost:5432`). Expected: exit 2.
- [ ] URL with two hosts (`postgres://a@b,prod.example.com:p@localhost:5433/x_test`). Expected: exit 2.
- [ ] `_test` DB URL with no port plus `PGPORT=6543`. Expected: exit 2.
- [ ] Local `diecast_scratch` with `DB_RESET_CONFIRM=` (empty). Expected: exit 2.
- [ ] `NODE_ENV=Production` (mixed case). Expected: exit 2.
- [ ] A URL with a query string (`…/diecast_scratch_test?database=other`). Expected: exit 2, before connecting.

### BR-KD-52 `db:test:prepare` guard
- [ ] `DATABASE_URL_TEST` unset. Expected: exit 2, nothing changed.
- [ ] `DATABASE_URL_TEST` not a valid URL. Expected: exit 2.
- [ ] `DATABASE_URL_TEST` naming a DB not ending `_test` (e.g. `…/diecast`). Expected: exit 2, that DB untouched.
- [ ] `DATABASE_URL_TEST` equal to `DATABASE_URL`. Expected: exit 2.
- [ ] `SEED_USER_PASSWORD` unset with a good test URL. Expected: exit 4.
- [ ] Good run on a scratch `_test` DB. Expected: same roles, permission keys, approval policies and employee count (1) as `db:reset --no-fixtures`; 0 PRs. (Note: db-migrations v1 changes how the schema is applied here, see BR-MIG-10; the guard rules stay.)

## C. Migrations (docs/specs/db-migrations.md v1)

### BR-MIG-09 `db:reset` applies migrations
- [ ] On `diecast_scratch_test`: `bun run db:reset` (with fixtures). Expected: summary printed; `select count(*) from drizzle.__drizzle_migrations` = 2; roles, admin, policies and fixtures present.
- [ ] Run it again. Expected: same row counts and document numbers.
- [ ] Put a stray table in `public` first, then reset. Expected: it is gone (public and drizzle dropped, rebuilt), the DB itself is not dropped.

### BR-MIG-10 `db:test:prepare` applies pending migrations, then seed
- [ ] On an empty scratch `_test` DB: run `bun run db:test:prepare`. Expected: migrations applied, seed done, journal has 2 rows.
- [ ] Run it again. Expected: "up to date", no schema change, seed re-applied without duplicates (same counts).
- [ ] Related (BR-MIG-11): scratch `_test` DB with tables but no journal. Expected: message says it was built by push and is rebuilding, then ends green.

### BR-MIG-16 `db:migrate` backup on a non-usual DB
Needs `pg_dump` on the PATH (`brew install libpq`).
- [ ] `DATABASE_URL` = local scratch `_test` DB on 5432/5433. Expected: runs with no backup file written.
- [ ] `DATABASE_URL` = `diecast_scratch` (not `_test`), no `MIGRATE_CONFIRM`. Expected: refused with exit 2 before any backup (BR-MIG-17).
- [ ] Same with `MIGRATE_CONFIRM=diecast_scratch`. Expected: a dump file path printed, file in `backend/backups/` (non-empty), then the migrations run.
- [ ] Check folder mode 0700 and the dump file mode 0600; `git status` shows `backups/` is ignored.
- [ ] Hide `pg_dump` (`PATH` without it) and repeat. Expected: refused, nothing applied (journal and tables unchanged).
- [ ] Make `pg_dump` fail (fake `pg_dump` script that exits 1), then one that writes an empty file. Expected: both stop, nothing applied.
- [ ] Run twice within the same minute on the same DB name. Expected: second run refused because the dump file name already exists.
- [ ] Re-run with nothing pending. Expected: "up to date", exit 0, no new writes.

Cleanup: `dropdb diecast_scratch_test; dropdb diecast_scratch`; delete test dumps in `backend/backups/`.
