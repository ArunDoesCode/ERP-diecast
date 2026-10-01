# Report 09 — security-auditor — db-migrations re-audit of fix commit 06e623a (HEAD~1)

Result: SEC-1 and SEC-6 fixed. SEC-4 fixed for the host and the wipe-on-error part, but it shares the open
hole below. SEC-2 is only half fixed: the multi-host / encoded-host cases are closed, but a query-string
`?database=` still makes the driver connect somewhere else than the guard checked (new id SEC-7, major).
Offline only: parse + driver `options` reads. One live probe against scratch `diecast_test` on 5433 for a
database that does not exist (server answered "does not exist"; nothing read or written). No pg_dump here.
Probe script was run via `bun -e`; nothing written to the repo.

## Status of earlier findings
| id | result | evidence |
|---|---|---|
| SEC-1 | fixed | `mkdirSync(..,{mode:0o700})` + `chmodSync(dir,0o700)`; umask 0077 set before `Bun.spawn`, restored after; `chmodSync(file,0o600)` after exit. Checked: Bun child inherits the umask (`sh -c umask` -> 0077, file created -rw-------), parent umask restored (022). Old 0644 dumps are shielded by the 0700 dir. |
| SEC-2 | partly fixed -> SEC-7 | `x@prod.example.com%2Cy@localhost/x_test`: guard says localhost usual=true, driver hosts `[prod.example.com, y@localhost]`, `assertDriverMatches` refuses. Encoded host `%6Cocalhost` / `loc%61lhost`: guard and driver both see the encoded text, usual=false (needs MIGRATE_CONFIRM + backup), consistent. `x%5Ftest`: both use raw, consistent. Port, `[::1]` (refused, fail safe, ::1 can never work), `localhost.`, upper case: fine. Only host/port/database *options* are compared; startup parameters are not (SEC-7). |
| SEC-3 | out of scope here | db-reset parser comes from work/known-defects (BR-KD-53). That branch must also cover SEC-7 (see below). |
| SEC-4 | fixed (host + CR-4) | prepare now refuses non-local host (exit 2) and rebuilds only on `JournalMismatchError`. Still reachable through SEC-7. |
| SEC-5 | open, accepted | backlog (pg_dump inherits PGHOSTADDR, no sslmode forwarded). Unchanged. |
| SEC-6 | fixed | `safeFileName` keeps `A-Za-z0-9_-`; `../x`, `a/b` cannot leave backups/. |

## Findings
| id | severity | area | file:line | finding | suggested fix |
|---|---|---|---|---|---|
| SEC-7 | major | backend | backend/scripts/lib/migrate.ts:200-221 (assertDriverMatches); used at db-migrate.ts:120, prepare-test-db.ts:25 | postgres.js copies every URL query key that is not one of its own option names into `options.connection`, and the startup message is built as `{user, database, ...options.connection}` (node_modules/postgres/src/connection.js:996-1004), so `?database=X` (also `?user=`) wins over the path. `assertDriverMatches` compares only `options.database` (still the path name), so it passes. Reproduced: `postgres://postgres:postgres@localhost:5433/diecast_test?database=sec_probe_nonexistent_test` -> `options.database=diecast_test`, `options.connection={application_name, database:"sec_probe_nonexistent_test"}`, `assertDriverMatches` PASS, server replies `database "sec_probe_nonexistent_test" does not exist` (so the client did ask for the other DB). Scenario A (prepare): a pasted/tampered `DATABASE_URL_TEST=postgres://..@localhost:5433/diecast_test?database=diecast` passes `resolveTestDatabaseUrl` (path ends `_test`), the host check and the driver check; `db:test:prepare` then sees the push-built/old dev DB `diecast`, runs `DROP SCHEMA public CASCADE` and `drizzle CASCADE` on it, and the "test-only" guarantee is gone. Scenario B (migrate): `DATABASE_URL=postgres://..@localhost:5433/x_test?database=real` skips MIGRATE_CONFIRM and the pg_dump (usual=true) and migrates `real`; with a real-looking URL + MIGRATE_CONFIRM, the pg_dump backs up the path name but the migration runs on the `?database=` one. Needs a tampered or mis-pasted env value, same threat model as SEC-2. | In `assertDriverMatches` also require that `Object.keys(sql.options.connection)` has no `database`, `user`, `host`, `port`, `hostaddr`, `dbname` (simplest: only `application_name` allowed, or reject any query string except `sslmode`). Add a test for `?database=other_test` expecting exit 2 on both scripts. Make sure known-defects db-reset (BR-KD-53) gets the same check before merge. |

## Checked, no issue
- `[::1]` always refused (driver parses host `[`): usability only, remove `::1` from LOCAL_HOSTS or document.
- `host/x_test` style names (`real/x_test` ends `_test`, path has a slash): driver asks for a DB with that literal name, fails; file name safe.
- Order in db-migrate: URL parse, confirm check, driver check, push-built check, plan, backup, apply. Nothing written before the driver check. Push-built refusal (BR-MIG-21) is before plan/backup, exit 2.
- `?host=`, `?port=`, `?path=`, `?hostaddr=` in the query do not change `options.host/port/path` (only `connection` startup keys, which Postgres rejects as unknown parameters).
- Spec v1 "security review" changelog line items (1)-(5) are all implemented; item (3) says "the same way as BR-KD-53", which is satisfied only once SEC-7 is closed.
