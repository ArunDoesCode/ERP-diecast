# Report 01 — test-writer — known-defects (BR-KD-30, 35, 52)

Spec v5 frozen. Files: `backend/tests/scripts/db-reset.test.ts` (extended), `backend/tests/scripts/prepare-test-db.test.ts` (new). Biome + tsc clean.

## Results

db-reset.test.ts: 57 pass, 4 fail. prepare-test-db.test.ts: 2 pass, 11 fail (script is still the old pre-v5 one).

| Test | Result | Why |
|---|---|---|
| BR-KD-30 local `diecast`, no confirm -> exit 2 | FAIL-BUG | exit 1 (guard passed, died on connect). Guard lets `diecast` through |
| BR-KD-30 local `diecast`, no confirm + `--allow-remote` -> exit 2 | FAIL-BUG | same, exit 1 |
| BR-KD-30 local `diecast`, `DB_RESET_CONFIRM=diecast` -> guard passes | FAIL-BUG | exit 2; current guard refuses a confirm without `--allow-remote` (v3 rule, replaced by v5) |
| BR-KD-30 wrong confirm + `--allow-remote` on local `*_test` -> exit 2 | FAIL-BUG | exit 0, DB was wiped. A set-but-wrong confirm must always be refused |
| BR-KD-52 (all 11 prepare tests: refusals exit 2 / exit 4, good run, same build as `db:reset --no-fixtures`) | FAIL-EXPECTED | `scripts/prepare-test-db.ts` is not the v5 wrapper yet (exits 1/2 for the wrong reasons, does not call `db:reset --no-fixtures`) |

Suspect location for the FAIL-BUGs: `backend/scripts/db-reset.ts` guard (BR-KD-30), `backend/scripts/prepare-test-db.ts` (BR-KD-52).

All other BR-KD-30/33/35/40/44/46 tests in db-reset.test.ts still pass (incl. new: drizzle schema dropped, `[::1]` is local, `*_test` on port 6543 refused, `_test` gives no shortcut on a remote host, local non-`_test` with confirm alone runs, `*_test` on the test-server port runs without confirm).

## Safety notes
- Targets named `diecast` / `diecast_test` are only aimed at a port that is verified dead at run time (whichever of 5432/5433 the test server does not use, plus 6543). If a dead port is not available those tests return early (skip). A guard bug therefore ends in a connect error, never a wiped dev DB. A helper throws if a local target is not a scratch DB or a dead port.
- All real runs use scratch DBs on the test server (`diecast_kd_reset_test`, `diecast_kd_reset_guard`, `diecast_kd_prep_*`), dropped in `afterAll`. The shared test DB is not touched.
- "Missing" env in prepare tests is passed as `""`, not unset, so Bun's auto-loaded `backend/.env` cannot fill it in. If the spec means truly-unset to behave differently, it is not tested.

## Not covered
- BR-KD-35 "any step fails -> step name printed, exit 1": the spec gives no step names beyond "fixtures", and v2 says failure hooks are out of scope. Only the unreachable-DB exit 1 is tested.
- Real run against a local DB literally named `diecast` (unsafe). Guard-pass is proven by "not exit 2, not exit 0" on a dead port.

## Flags
- BRIEF-CONTAMINATION (minor): the brief carried an extra line ("env in backend/.env, test DB already prepared") and omitted the template's Contract/Test-change lines. No rule paraphrase. Ignored.
- Independence: while checking the entry point I read the top of `backend/scripts/prepare-test-db.ts` (old, pre-v5 version, ~50 lines). It did not shape the assertions; they come from BR-KD-52.
