# Resume after a crash

## Symptom
The session ended in the middle of a run (terminal closed, machine slept, context ran out). There is a
`feature/<id>` or `epic/<name>` branch with a `.pipeline/<id>/` folder and no hand-over.

## Check — read, do not change
```bash
git worktree list                                  # find the run's worktree (branch feature/<id>)
cd <worktree path>                                 # coordinator: EnterWorktree path=<worktree path>
cat .pipeline/<id>/state.json                      # phase, currentSlice, fixRounds, lastGreen, pr, envFile
git status --short                                 # work a dead agent left uncommitted?
git log --format='%h %s' <base>..HEAD | head -20   # last thing that was committed
ls .pipeline/<id>/briefs .pipeline/<id>/reports    # a brief NN with no report NN = the agent that died
gh pr list --head <branch> --state all --json number,state,url
```
If the worktree folder is gone but the branch exists:
`git worktree add .claude/worktrees/<id> feature/<id>` (from the main checkout, no new branch).

**Last green** = `state.json` → `lastGreen`. If it is `null`: the newest
commit for which a test-runner report in `.pipeline/<id>/reports/` shows every check passing.

## Fix
1. Bring the environment up again: `cd backend && docker compose up -d && bun run db:test:prepare`
   (the test DB is in memory, a restart empties it). Then `codegraph sync` at the worktree root.
2. **Uncommitted changes** (from `git status --short`):
   - Save them first: `git diff > .pipeline/<id>/crash-wip.patch` (new files: list them in the same folder).
   - Run the checks. Green → commit, tests and code in separate commits (`test(<id>): …` / `feat(<id>): …`).
   - Red → leave the files in place and re-brief the **same** agent type with the brief that had no report,
     adding one input line: "work in progress is in the working tree; finish it or undo your own files".
3. Compare `state.json` with the log. If commits exist that are newer than the state says, trust the
   commits: move `phase` / `currentSlice` forward to match (`.claude/pipeline/state.sh phase <name>`) and add
   a `failures[]` entry of kind `crash`. No commit — the run folder is not in git.
4. Resume with `/feature <module> --resume` (epic: `/epic <module> --resume`). It continues from
   `state.json.phase`. Do not re-plan and do not re-explore.
5. Resuming phase by phase:

   | `phase` | Start again at |
   |---|---|
   | preflight / plan | redo the phase; cheap |
   | build | current slice: contract committed? → tests committed? → then the developers |
   | review / fix | step A (reviewers + test-runner) of the current round; keep `fixRounds` as it is |
   | handover | docs commit done? → `HANDOVER.md` written? → `git push` if ahead, then `gh pr checks <n>` |
6. If a PR exists, post nothing new until the loop is green again.

## If it fails twice
The run crashes a second time in the same phase, or the checks are red on a tree you did not change →
[park-a-slice.md](park-a-slice.md) for `currentSlice` (revert to last green), then go on with the next
slice. No `state.json` at all and no way to tell the phase → hard stop: leave the branch, write what you
found to `.pipeline/<id>/HANDOVER.md`.

## Never
- Never start `/feature <module>` without `--resume` on a run that has a state file.
- Never throw away uncommitted work (`git checkout -- .`, `git restore .`, `git clean`, `git reset --hard`).
- Never create a second branch or worktree for the same `<id>`.
- Never use `git stash`: the stash is shared with every other worktree and session.
- Never lower `fixRounds` to win more fix rounds.
