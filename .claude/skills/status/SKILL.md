---
name: status
description: >
  Pick-up point for any session: reads docs/STATUS.md, active pipeline runs (state.json in each run's
  worktree), open agent PRs, P1 backlog items and stale module maps, then reports where the project is, a
  small run-metrics table and the single best next action — and refreshes docs/STATUS.md. Use when: /status,
  "where are we", "what's next", "continue", "pick up where I left off", start of day, new session.
model: sonnet
---

# /status

Read-only except for `docs/STATUS.md`.

1. Read `docs/STATUS.md`, then `gh issue list --label P1 --state open` and
   `gh issue list --label uat-bug --state open`.
2. Specs: for each `docs/specs/*.md` and `docs/specs/*/spec.md` (not `_template`), read the frontmatter
   `status` / `version`.
3. Runs: `.claude/pipeline/state.sh metrics` — one row per run in every worktree (run state is local to
   the worktree, not in git; fields: `.claude/pipeline/PROTOCOL.md` → Run state). Script not allowed → read
   each `.claude/worktrees/*/.pipeline/*/state.json` with `"schema": 2` and build the same table by hand.
   PRs: `gh pr list --label agent-pipeline --state open --json number,title,headRefName,baseRefName,reviewDecision,statusCheckRollup`.
   Flag: a run not in `handover` / `done` with no open session (stalled →
   [resume-after-crash](../../../docs/runbooks/resume-after-crash.md)); a worktree whose PR is merged
   ([worktree-branch-cleanup](../../../docs/runbooks/worktree-branch-cleanup.md)).
4. Maps: for each `docs/modules/*.md`, compare `last_verified_commit` with
   `git log -1 --format=%h <sha>..HEAD -- <paths in its Code locations table>`; changed → stale.
5. Update `docs/STATUS.md`: modules table (spec status, open PR, next step), Active pipelines, Waiting on
   you, Recently done, `Updated:` date, **Next action**. A dashboard, not a log.
6. Reply, in this order:
   - **Waiting on you** — PRs to try and merge, each with its count of `confirm` questions and parked slices.
   - **Runs** — the metrics table from step 3, as printed:
     `| Run | Mode | Phase | Min | Agent calls | Tokens | Fix rounds | Findings (open) | Parked | PR |`
   - Stale maps (suggest `/map --stale`).
   - **Next action** — one concrete command (e.g. `/build grn`, `/feature grn --resume`, `/spec bom`).

Commit `docs/STATUS.md` only when you are in a run's worktree (`feature/<id>` or `epic/<name>`) — it rides
with that run's one docs commit. Never push or open a PR just for STATUS. On `main`, leave it uncommitted
and say so.
