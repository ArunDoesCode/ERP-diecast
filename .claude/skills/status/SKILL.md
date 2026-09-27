---
name: status
description: >
  Pick-up point for any session: reads docs/STATUS.md, active pipeline state (.pipeline/*/state.json on open
  feature branches), open agent PRs, P1 backlog items and stale module maps, then reports where the project
  is and the single best next action — and refreshes docs/STATUS.md. Use when: /status, "where are we",
  "what's next", "continue", "pick up where I left off", start of day, new session.
model: sonnet
---

# /status

Read-only except for `docs/STATUS.md`.

1. Read `docs/STATUS.md` and `docs/backlog.md` (P1 items only).
2. Specs: for each `docs/specs/*.md` (not `_template`), read the frontmatter `status`/`version`.
3. Pipelines: `gh pr list --label agent-pipeline --state open --json number,title,headRefName,reviewDecision,statusCheckRollup`
   and for each, `git show origin/<headRefName>:.pipeline/<id>/state.json` (after `git fetch origin`) →
   phase, iteration, waiting on whom. Also list local `.claude/worktrees/*` without an open PR (stalled runs).
4. Maps: for each `docs/modules/*.md`, compare `last_verified_commit` with
   `git log -1 --format=%h <sha>..HEAD -- <paths in its Code locations table>`; changed → stale.
5. Update `docs/STATUS.md`: modules table (spec status, open PR, next step), Active pipelines, Waiting on you,
   Recently done (merged agent PRs since last update), `Updated:` date, **Next action**. Keep it short —
   it's a dashboard, not a log.
6. Reply with:
   - **Waiting on you** (PRs to test/merge, questions) — first, since that unblocks the most.
   - Active pipelines and their phase.
   - Stale maps (suggest `/map --stale`).
   - **Next action** — one concrete command (e.g. `/feature grn --resume`, `/spec purchase-order`).

If `docs/STATUS.md` changed and you're on `main`, don't commit; tell the user it'll go into the next PR
(or commit it on the current feature branch if a pipeline is active in this worktree).
