# Report 08 — security-auditor — re-audit of edbc52b (BR-KD-53)
Scope: `git show HEAD~1` (backend/scripts/db-reset.ts) vs SEC-1, SEC-2, SEC-4 (report 04) and BR-KD-53 (spec v5).
Method: driver parsing checked offline (`postgres(url).options`, no connect). Guard run only with SEED_USER_PASSWORD unset (any pass through the guard stops at exit 4, no write) and only against refusal cases. Three runs were blocked by the permission classifier (see "Not run"); they were verified by reading the code and the offline parse instead.

## Result: SEC-1, SEC-2, SEC-4 closed. No new findings.

| id | status | evidence |
|---|---|---|
| SEC-1 empty DB name / empty confirm | closed | `postgres://u:p@localhost:5432` run: exit 2 "has no database name". The check reads the URL path (not the driver name), so `PGDATABASE=diecast` + empty path (`.../` or none) is refused too (pathname "" or "/" parses to empty; driver would have used PGDATABASE: confirmed offline as `zz`). Empty `DB_RESET_CONFIRM` is `confirm === ""`: local non-test `diecast` hits `confirm !== dbName` (refused); `--allow-remote` with empty confirm: run, exit 2 "must equal the database name". |
| SEC-2a PGPORT / no port | closed | Port comes from `o.port[0]` (driver). Offline: `localhost/x_test` + `PGPORT=6543` gives 6543, not in {5432,5433}, so confirm is required. `PGPORT=abc` gives NaN, "NaN" not in set, fails closed. |
| SEC-2b multi-host / `@` and `,` in userinfo | closed | `postgres://a@b,prod.example.com:p@localhost:5433/x_test`: driver hosts `["b","prod.example.com"]`; run exit 2 "more than one host". `localhost,prod.example.com:5433` also gives 2 hosts. |
| SEC-2c percent-encoded / odd names | closed | `/%78_test` run: exit 2 "cannot be read exactly". `//x_test` gives driver name `/x_test`, rejected by the `^[A-Za-z0-9_.$-]+$` check. `/x_test/../diecast` normalises to `diecast` in both URL and driver, so guard judges `diecast` (confirm needed). `#frag`, `?host=`, `?port=`, `?database=`, `?user=` are ignored by the driver, so they cannot move the target. |
| SEC-2 residual: guard vs child processes | closed | After judging, `DATABASE_URL` is rebuilt from the driver's host/port/db/user/pass (userinfo percent-encoded) and `PG*` env is deleted, so drizzle-kit, bootstrap, policies and the in-process client connect to exactly the judged target. Round-trip tested offline with `us%40er:p%40ss%3Aw%2Fd%25@` and mixed-case host: user, pass, host, port, db identical. Only `postgres` (no `pg`) is installed, so drizzle-kit uses the same URL parser. |
| SEC-4 NODE_ENV case | closed | `NODE_ENV=Production` run: exit 2 "NODE_ENV=production". `.toLowerCase()` in the code. |

Other cases run (all as expected): `--allow-remote` on a remote host with empty confirm: exit 2; `localhost:5433/x_test`, no confirm, no seed password: guard passes (allowed by BR-KD-30), stops at exit 4 before any write.

## Residual, not findings
- SEC-3 (minor, unchanged): `[::1]` is accepted by the guard and the host is rebuilt as `[::1]`, but the driver reads host as `[` and cannot connect. Fails closed.
- Process note: an exported `DB_RESET_CONFIRM=diecast` in a shell profile still disables the dev-DB guard for that name. Pass it inline only (docs wording, not code).
- A `localhost` SSH tunnel to a real DB on a `*_test` name on 5432/5433 passes without confirm. This is the accepted BR-KD-30 v5 design.

## Not run
Classifier blocked three guard runs (`PGDATABASE=diecast` + empty path; `PGPORT=6543` + `localhost/x_test`; `DB_RESET_CONFIRM=` + local `diecast`). I did not retry them or work around this. Their outcome follows from the code and the offline parse above; a human can run them with SEED_USER_PASSWORD unset if they want first-hand proof (expected exit 2 for all three).

STATUS: PASS (0 blocker, 0 major, 0 minor new)
