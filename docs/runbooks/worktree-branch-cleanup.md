# Worktree and branch cleanup

Deleting is a destructive action. In an unattended run: **list only, then stop** and put the list in the
hand-over. Delete only after the owner has seen the list and said yes (plan item 0.9), or when
`/watch-prs` cleans up the one branch whose PR it just saw merged.

## Symptom
- `git worktree list` shows worktrees of finished runs (baseline 2026-11-18: 5 worktrees, 20 local branches).
- A new run fails with "branch is already checked out" or "worktree already exists".

## Check — list first, change nothing
Run from the run's worktree; all of these only read.
```bash
git fetch origin --prune
git worktree list                              # the FIRST line is the main checkout — never touch it
git branch --merged origin/main                # candidates. "*" or "+" in front = checked out somewhere
git branch --no-merged origin/main             # NOT candidates
gh pr list --state merged --limit 30 --json number,headRefName,mergedAt
gh pr list --state open --json number,headRefName
```
A branch may be deleted only if **all** are true:
- it is in `git branch --merged origin/main` (for an epic sub-feature: `--merged origin/epic/<name>`),
- it has a merged PR, and no open PR,
- it is not `main`, not an `epic/*` that still has open sub-features, not the branch you are on,
- its worktree (if any) has a clean `git -C <path> status --short`,
- no `.pipeline/<id>/state.json` on it has a phase other than `merged` / `done`.

## Fix (after the owner's yes)
1. Write the list to the hand-over: branch · PR number · worktree path · "merged yes/no".
2. For each branch that has a worktree, remove the worktree first (no `--force`):
   ```bash
   git worktree remove <path>
   ```
   It refuses if the worktree has changes. That is correct: leave it and report it.
3. Delete the local branch with the safe flag:
   ```bash
   git branch -d <branch>
   ```
   It refuses if the branch is not fully merged. That is correct: leave it and report it.
4. `git worktree prune` to drop records of folders that are already gone.
5. Remote branches: GitHub deletes merged PR branches by itself (repo setting). Do not delete remote
   branches from here.
6. Run the Check block again and paste the result in the report.

## If it fails twice
`git worktree remove` or `git branch -d` refuses → do not retry with force. Leave it, write
"<branch>: not removed — <git's message>" in the hand-over and continue. Nothing here is worth a park.

## Never
- Never touch the main checkout (first line of `git worktree list`) or the `main` branch.
- Never `git branch -D`, never `git worktree remove --force`, never `rm -rf` a worktree folder.
- Never delete a branch because its name looks old; only because the checks above pass.
- Never delete a branch with an open PR or unpushed commits (`git log origin/<branch>..<branch>`).
- Never `git push origin --delete …` and never `git stash drop` / `clear` (stashes are shared by all worktrees).
- Never clean up the worktree you are running in.
