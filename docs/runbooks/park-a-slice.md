# Park a slice

Coordinator only. Park = take one slice out of this run, keep the evidence, go on with the rest.

## Symptom
Another runbook sent you here: loop limit, same failure twice, unsolvable gap, or a denied action.

## Check
```bash
git status --short                                   # must be clean; commit or hand back open edits first
git log --format='%h %s' <base>..HEAD                # find the slice's commits
cat .pipeline/<id>/plan.md                           # does a later slice depend on this one?
```
- **Last green** = `state.json` → `lastGreen` (**missing — to be added**, plan 4.1). Until then: the last
  commit before the slice's first commit (`feat(<id>): <slice> contract`).
- Sort the slice's commits into **code** (`feat(`, `fix(`) and **tests** (`test(`).
- A later slice depends on it → park that one too, in the same issue.

## Fix
1. Revert the code commits, newest first, as one commit (no test files in it):
   ```bash
   git revert --no-commit <newest-code-sha> … <oldest-code-sha>
   git commit -m "fix(<id>): park slice <S> — revert code (see issue)"
   ```
2. Revert the test commits the same way, in their own commit:
   ```bash
   git revert --no-commit <newest-test-sha> … <oldest-test-sha>
   git commit -m "test(<id>): park slice <S> — revert tests (see issue)"
   ```
3. If the slice added a migration: `cd backend && bun run db:test:prepare` (it rebuilds the test DB when
   the journal no longer matches). Then `bun run contract:generate` and commit the manifest if it changed.
4. Prove it is green again: `cd backend && bun run typecheck && bun run lint && bun test && bun run contract:check`
   and `cd frontend && bunx tsc --noEmit && bun run lint`.
5. Write the evidence to `.pipeline/<id>/parked-<S>.md`, then open the issue:
   ```bash
   gh issue create --title "Parked: <id> slice <S> — <one line>" \
     --label P2 --label feature --label "mod:<module>" --body-file .pipeline/<id>/parked-<S>.md
   ```
   Body, in this order: **Why parked** (1 line) · **BR ids not built** · **Evidence** (finding ids, failing
   test names, error lines) · **Tried** (fix commit shas) · **To restore** (`git revert <the two revert
   shas>` on branch `<branch>`) · **Needs from owner** (yes/no question, or "nothing").
   Labels: priority `P1` blocks the milestone / `P2` default / `P3` cosmetic · one type `feature` (rules not
   built), `defect` (bug in code already on base), `change` (needs a spec decision) · `mod:<module>`.
6. `state.json`: add to `parked` (**missing — to be added**):
   `{ "slice": "<S>", "brs": ["BR-…"], "issue": <n>, "reverts": ["<sha>", "<sha>"], "reason": "<one line>" }`,
   set `iteration` to 0 and `currentSlice` to the next slice. In `findings.md` mark the slice's open
   findings `parked #<n>`. Commit `chore(<id>): park slice <S> (#<n>)`.
7. Continue with the next slice. List the parked slice with its issue link in `HANDOVER.md` and the PR body.

## If it fails twice
Step 4 is still red after the reverts, twice → the branch itself is broken. Hard stop: write the failing
check and output to `HANDOVER.md`, set phase `handover`, leave the branch as it is for the owner.
Every slice parked → still open the PR with the docs commits and the issue list; that is a valid hand-over.

## Never
- Never `git reset --hard`, never force-push, never delete the branch to "start clean".
- Never mix test files and code in one revert commit (test-runner flags it as `TEST-INTEGRITY`).
- Never park by skipping or deleting the failing tests and keeping the code.
- Never revert a commit that is already on the base branch.
- Never park without an issue number in `state.json` and the hand-over.
