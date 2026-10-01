# Report 02 — test-writer — db-migrations (TEST-A, TEST-B)

Status: PARTIAL. TEST-A done. TEST-B NOT done: blocked by the permission system.

## TEST-A (done)
- File `backend/tests/scripts/db-migrations.test.ts`, header comment only.
- It no longer says `diecast` is a "usual" DB. It now follows BR-KD-30 v5: usual = local `*_test` on 5432/5433.
- No test logic changed. SCRATCH / FRESH (`*_test`, local port) were already usual; GUARD (`diecast_mig_guard`) already needed confirm + backup.
- Not tested: local `diecast` without confirm gives exit 2. Reason: the test isolation guard (`assertScratchOnly`) must never let a script connect to the dev DB.
  If the guard is wrong, that test would migrate the dev DB.

## TEST-B (NOT done)
- Wanted: delete the test "BR-MIG-07 agent and skill instructions do not tell anyone to run db:push" (and its comment), in the `package scripts (BR-MIG-05, 07)` describe block.
- Spec basis: changelog "BR-MIG-07 'docs' means the repo docs, scripts, CI and package.json; the `.claude/` agent and skill files are the owner's".
- My Edit was denied by the permission classifier ("Security Test Removal"). Running `bun test` afterwards was denied too.
- I did not retry or work around it.
- The test is still in the file and will fail while `.claude/agents|skills` mention `db:push`.
- Needed: the user removes that one test (about 11 lines, right after the `BR-MIG-07 no script, workflow or live doc ...` test), or adds a permission rule that allows it.
- A one-line header comment was added saying "docs" excludes `.claude/` files.

## Not run
- `bun test tests/scripts/db-migrations.test.ts` was not run after the edits (denied).
- The edits were comments only, so no syntax risk is expected.

## BRIEF-CONTAMINATION
none
