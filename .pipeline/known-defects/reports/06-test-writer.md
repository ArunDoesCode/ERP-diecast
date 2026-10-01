# Report 06 — test-writer — BR-KD-53 tests

File: `backend/tests/scripts/db-guard-target.test.ts` (new, 22 tests, ~15 s). Run: `cd backend && bun test tests/scripts/db-guard-target.test.ts`.
Result: 12 pass, 10 FAIL-BUG (code predates BR-KD-53). No production code touched. Typecheck + biome clean.

Safety: scratch DB `diecast_kd_target_test` (created/dropped by the file); `diecast`-style names only on a dead port; other targets are the scratch DB or a name that exists nowhere. Shared test DB never touched.

## FAIL-BUG (code violates the rule) — in `backend/scripts/db-reset.ts` / `prepare-test-db.ts` guard
I confirmed by hand that each is a real miss, not a test slip.
| test | spec example | actual |
|---|---|---|
| URL with no DB name (also trailing `/`) | `postgres://u:p@localhost:5432` → exit 2 | passes the guard, connects, exit 1 at "drop schema" |
| no DB name + `PGDATABASE=diecast`, no confirm | refused | exit 1 (guard passed) |
| `a@b,prod.example.com:p@localhost:port/<db>_test` | exit 2 | guard passes, **full reset ran** on the scratch DB |
| same hidden second host through `db:test:prepare` | exit 2 | guard passes, full build ran |
| URL without port + `PGPORT=6543`, `_test` DB | exit 2 | PGPORT ignored (judged as 5432), connects, exit 1 |
| `NODE_ENV=Production` / `PRODUCTION` / `pRoDuCtIoN` | exit 2 | not refused, reset runs |
| `NODE_ENV=Production` + `--allow-remote` + matching confirm | exit 2 | not refused |

## PASS (already correct)
- Two hosts in the URL (`h1,h2/db`) refused: db:reset (x2) and db:test:prepare. (Standard multi-host form is an invalid URL for `new URL`, so it passes through the "not a valid URL" refusal.)
- `PGHOST=remote` with a URL that has no host → exit 2.
- Empty `DB_RESET_CONFIRM` on local `diecast` → exit 2; with `--allow-remote` on a remote host → exit 2; empty confirm on a local `_test` DB on a usual port still passes the guard.
- Port in the URL beats `PGPORT`; `PGPORT=5432/5433` with no URL port makes the `_test` shortcut apply; a local URL host beats a remote `PGHOST`.
- `db:test:prepare` with no DB name → exit 2.

## Not covered (spec silent — would be a guess)
- URL with no DB name but `PGDATABASE` set to a harmless name: refused ("no database name") or judged on PGDATABASE? Only the `PGDATABASE=diecast` case is tested, which is exit 2 either way.
- "Name can't be read exactly" beyond the multi-host forms (e.g. percent-encoded or query-string names): spec gives no example. Suggest adding one to BR-KD-53.
- NODE_ENV is only tested through `db:reset`, not `db:test:prepare`.

## QUESTIONS
none

STATUS: DONE
