# Report 07 — test-writer — tests for SEC-1, SEC-2, SEC-4, SEC-6, CR-2 (BR-MIG-11, 16, 17, 21)

File: `backend/tests/scripts/db-migrations.test.ts` (tests added at the end; two small changes to the
`assertScratchOnly` safety helper so it accepts the new scratch cases; no test deleted or weakened).
Run: `bun test tests/scripts/db-migrations.test.ts` -> 58 pass, 7 fail. Typecheck and biome clean.

## FAIL-BUG (code exists, spec rule violated)
| id | test | result | suspect |
|---|---|---|---|
| SEC-1 | BR-MIG-16 the backup folder is mode 0700 | folder is 0755 | scripts/db-migrate.ts (backup step, mkdir) |
| SEC-1 | BR-MIG-16 the dump file is mode 0600 | file is 0644 | same |
| SEC-6 | BR-MIG-16 a database name with an encoded '../' never makes the dump leave backend/backups/ | `backend/diecast_mig_guard_trav-<date>.dump` written outside backups/ (reproduced) | dump file name built from the decoded db name |
| SEC-2/4 | BR-MIG-11 db:test:prepare, test URL with an encoded host (`%6Cocalhost`) -> refused before connecting | not refused: it tries a DNS lookup (`getaddrinfo ENOTFOUND`) | scripts/prepare-test-db.ts / lib/test-db-url.ts (host judged from the raw URL) |
| CR-2 | BR-MIG-21 full push-built dev DB (every table, no journal) -> 'built by push? use db:reset' | exit 1 but the message is `type "approval_action" already exists`; no 'built by push' | scripts/db-migrate.ts (no journal + tables check) |
| CR-2 | BR-MIG-21 tables but no journal (small fixture) -> refused | exit 0: the baseline is applied on top of the existing tables | same |

Also red, not from this brief: `BR-MIG-07 agent and skill instructions do not tell anyone to run db:push`
(existing test). Findings TEST-B says remove it (spec changelog: `.claude/` files are the owner's). The
brief said do not delete, so I left it. Coordinator: ask for the removal in a brief that cites TEST-B.

## PASS (rule already holds)
- BR-MIG-17 db:migrate refuses (exit 2, no dump, nothing applied): several hosts; a/b-hidden second host
  (`a@b,prod.example.com:p@localhost`); encoded host; no database name; `PGPORT=6543` with a URL that has
  no port; empty `MIGRATE_CONFIRM`.
- BR-MIG-11 db:test:prepare: several hosts and no database name are refused before connecting and nothing
  is built; a pending migration older than an applied one is a journal mismatch and is rebuilt (says why);
  a failing migration that is not a journal mismatch does NOT drop the schemas (sentinel row kept).
- BR-MIG-21 `db:reset` rebuilds a push-built DB.

## Not covered / notes
- SEC-6 test: the driver does not percent-decode the URL path, so the unsafe name is created literally as
  `..%2Fdiecast_mig_guard_trav` (a script that decodes it sees `../diecast_mig_guard_trav`); the test runs
  with both names as `MIGRATE_CONFIRM`. A refusal would also pass; only an escape fails. The spec does not
  say how the name is made "safe", so no exact file name is asserted.
- SEC-1 test removes an empty `backend/backups/` first so the script creates it. It does not test a
  folder that already exists with looser permissions (spec silent). `backend/backups/` now exists, 0755,
  empty, gitignored.
- No `db:adopt` test (BR-MIG-18..20 deferred, Q1 = B). "No db:adopt script" is not asserted either.
- SEC-5, SEC-3 not in scope.

## QUESTIONS
1. Changelog 3 says several hosts or an encoded host are refused "(exit 2)" for both `db:migrate` and
   `db:test:prepare`. `db:test:prepare` refuses several hosts / no database name with exit 1 today (via
   the `*_test` name check). I assert "refused, non-zero, before connecting" for prepare and exact exit 2
   for migrate. Should prepare also be exit 2? If yes, tell me and I tighten those three tests.
2. Does "built by push" (BR-MIG-21 / changelog 4) apply to every non-test DB with tables and no journal,
   or only when the baseline would clash? The tests assume the first (BR-MIG-18's definition of push-built).
