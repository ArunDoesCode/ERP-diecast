---
name: watch-prs
description: >
  Local PR watcher for the agent pipeline. One pass: finds open PRs labelled agent-pipeline, detects new
  human review comments since the last run, and resumes /feature for each; detects merged PRs and runs
  after-merge steps (incl. continuing an /epic). Designed to run on a timer: `/loop 10m /watch-prs`.
  Use when: /watch-prs, "check my PRs", "pick up my PR comments".
model: opus
---

# /watch-prs

Run from the repo root (main checkout, not a feature worktree). Requires `gh auth status` OK.

## One pass
1. `gh pr list --label agent-pipeline --state open --json number,headRefName,baseRefName,updatedAt`
   and `gh pr list --label agent-pipeline --state merged --limit 20 --json number,headRefName,mergedAt`.
2. For each PR, map it to its feature id via the `<!-- pipeline:<id> -->` marker in the body (or the
   branch name `feature/<id>`), and read `.pipeline/<id>/state.json` from that branch
   (`git fetch origin && git show origin/feature/<id>:.pipeline/<id>/state.json`).
3. **Open PR with new human feedback** — any review, review comment or issue comment created after
   `lastProcessedCommentAt` whose body does not start with `🤖`, or a review with state
   `CHANGES_REQUESTED`:
   → run `/feature <module> [--sub <sub> --base <base>] --resume --from-pr <n>` (full re-run loop).
   Handle PRs one at a time, in the shared working worktree (`.claude/worktrees/bl-006-test-db`) — never a new one.
4. **Merged PR whose state isn't `merged` yet** → run the "After merge" steps of `/feature`; if it belonged
   to an epic, `/epic <module> --resume` to start the next ready sub-feature.
5. **Nothing new** → reply with one line: `No new PR activity (<n> open agent PRs).` and stop.

## Notes
- Never act on comments that start with `🤖` (the pipeline's own replies — same GitHub account as you).
- If a comment is ambiguous, reply on the PR with `🤖 Question: …` and also ask in the session; don't guess.
- Loop suggestion: `/loop 10m /watch-prs` while you're working; stop it when you're done for the day.
