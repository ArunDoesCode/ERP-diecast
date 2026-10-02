# Report 05 — spec-reviewer — known-defects (BR-KD-30, 35, 52)

Verdict: READY (0 blockers, 0 major, 2 minor). Spec `docs/specs/known-defects.md` v5, frozen. `bun test tests/scripts/` 90 pass / 0 fail.

## Rule coverage
| BR | Enforced | Tests (named) |
|---|---|---|
| BR-KD-30 | `backend/scripts/db-reset.ts:62-103` (production refuse; wrong confirm refuse; non-local needs --allow-remote + confirm; local: only `*_test` on 5432/5433 confirm-free; all exit 2 before connect) | `backend/tests/scripts/db-reset.test.ts` l.205-247, 274-302, 335-458 (all spec examples: local diecast no/wrong/right confirm; `_test` on 5433 runs; `_test` on 6543 refused; remote + confirm no flag; production) |
| BR-KD-35 | `db-reset.ts` steps unchanged; one test-DB build via `prepare-test-db.ts` and CI `.github/workflows/ci.yml:43-46` | `db-reset.test.ts` l.515-621 (public + drizzle dropped, never DB; 1 employee, 0 PRs; policies present; two runs same counts/numbers; failing step exit 1); `prepare-test-db.test.ts` l.301, 318 |
| BR-KD-52 | `backend/scripts/prepare-test-db.ts:14-36` (`resolveTestDatabaseUrl` -> exit 2; spawns `db-reset.ts --no-fixtures` with `DATABASE_URL=DATABASE_URL_TEST`; exit 4 passes through) | `backend/tests/scripts/prepare-test-db.test.ts` l.207-331 (missing, invalid, non-`_test`, `_test` not at end, `.../diecast`, equals DATABASE_URL, password missing/short -> 4, good run, dev DB untouched, parity with db:reset --no-fixtures) |

Test independence: tests in `cb0b574 test(...)`, code in `2a14b35 feat(...)`; no cross-touch. Tests assert only spec-stated outcomes. Test-writer flagged a minor brief deviation (extra line, no rule paraphrase) and a read of the old prepare script; neither shaped assertions. Not a finding.

## Findings
| id | severity | area | file:line | finding | suggested fix |
|---|---|---|---|---|---|
| SPEC-1 | minor | docs | `backend/CLAUDE.md:94` | Still says `db:test:prepare` = "push schema + page-access seed"; it is now `db:reset --no-fixtures` on the test URL and needs `SEED_USER_PASSWORD` (exit 4) | Update this line and `docs/modules/auth-setup.md:29` in the map/wrap step |
| SPEC-2 | minor | backend | `backend/src/db/seed_roles.sql` | Now unused by prepare-test-db (backend-dev noted). Dead file, no behaviour | Delete in a follow-up; not in this spec's scope |

## Unspecced behaviour
None. New messages are output text only; child exit codes pass through (consistent with BR-KD-52 exit 4).

## Gaps (accepted by spec)
- BR-KD-35 "fixtures step fails -> step name printed": no test; spec v2 changelog excludes it (no test hooks).
- `DATABASE_URL_TEST` on a `*_test` DB with port other than 5432/5433 gets exit 2 from db:reset (BR-KD-30), so prepare inherits that. Consistent with spec; untested.
