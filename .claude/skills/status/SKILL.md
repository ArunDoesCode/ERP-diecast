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

1. Read `docs/STATUS.md`, then `gh issue list --label P1 --state open` (P1 items only) and `gh issue list --label uat-bug --state open`.
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

Commit `docs/STATUS.md` on the working branch (`work/<theme>`, root `CLAUDE.md` → Git). Never push or open a
PR just for STATUS — it rides with the next batch PR. If you're on `main`, leave it uncommitted and say so.
