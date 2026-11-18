# Fix loop does not end

## Symptom
- `state.json` → `fixRounds` is 3, or
- the same finding id is still open in `.pipeline/<id>/findings.md` after 2 fix commits, or
- each fix round brings new findings of the same kind.

## Check
```bash
cat .pipeline/<id>/state.json                       # fixRounds, currentSlice, lastGreen
grep -c "fix now" .pipeline/<id>/findings.md        # how many are still to fix
git log --oneline <base>..HEAD | grep -E "fix\(|test\(" | head -20   # what the rounds changed
```
Then put every open blocker / major in one of these boxes (seen in past runs):

| Box | How to tell | Seen as |
|---|---|---|
| A. Spec gap | no BR decides it; reviewers and code both "reasonable" | SPEC-26, SPEC-6 (m1-stock) |
| B. Test contradicts the spec | failure message disagrees with a quoted BR | F-TEST-5, F-TEST-11, TEST-3 (subcontracting) |
| C. Reviewer is wrong or repeats a rejected finding | same text as an id already `rejected` | TEST-1/2/4/5 (m1-stock) |
| D. The fix broke something else | new lint / typecheck / other test red after the fix commit | CR-8-L, F-TEST-9 (m1) |
| E. Code is really wrong and hard | none of the above | CRP-2 lock order (m1) |

## Fix
1. Box A → [spec-gap-mid-build.md](spec-gap-mid-build.md). Do not send it to a developer again.
2. Box B → brief **test-writer** with `Test change request: findings.md#<id>`; the finding must quote the
   spec rule. Commit as `test(<id>): <ids>`. Never route it to a developer.
3. Box C → set status `rejected` + one-line reason in `findings.md`. In the next reviewer brief add under
   Inputs: "skip ids marked rejected in findings.md".
4. Box D → run the checks yourself before the next review round, not after:
   `cd backend && bun run typecheck && bun run lint && bun test`
   `cd frontend && bunx tsc --noEmit && bun run lint`
5. Box E → one more round only if `fixRounds` < 3. Give the developer the failing test name, the BR text
   and the two earlier fix commits (`git show <sha>`), and ask for a different approach.
6. Minor findings never keep the loop open: one GitHub issue each (labels in
   [park-a-slice.md](park-a-slice.md)), status `backlog #NN`.
7. Each round: `.claude/pipeline/state.sh phase fix` (it adds 1 to `fixRounds`). No commit — the run folder is not in git.

## If it fails twice
`fixRounds` is 3 and still not green, or one finding id survived 2 fixes → **park the slice that owns the finding**:
[park-a-slice.md](park-a-slice.md). Record in the issue: finding ids, the fix commits tried, the last
test-runner report path. Then continue with the next slice. Do not ask the owner.

Hard stop instead of park only when the open finding says a domain invariant breaks **in code that is
already on the base branch** (money not in paise, stock changed outside `inventory_ledger`, state change
without audit). Write it at the top of `HANDOVER.md` and stop.

## Never
- Never run a 4th round "just once more".
- Never let a developer edit, skip or delete a test to get green. Never add `test.skip` / `.todo`.
- Never mark a finding `fixed` without a commit sha.
- Never reject a blocker without a reason line in `findings.md`.
- Never widen the slice ("also refactor X") to make a finding go away.
