---
name: epic
description: >
  Run a really large feature (e.g. Sale Order + BOM explosion) as an epic: split a frozen spec into ordered
  sub-features, create epic/<name> branch, run /feature for each sub-feature on its own branch with a PR into
  the epic (merged automatically when every gate is green), then a final scenario test and an epic PR into
  main for the owner. Never waits for the owner. Use when: /epic <module>, "large feature", "break this into
  parts", a spec with more than ~15 BRs or several screens/modules.
model: opus
---

# /epic <module> [--resume]

You are the coordinator. `/feature` and `.claude/pipeline/PROTOCOL.md` apply in full: never-wait policy,
hard stops, run state, test independence. **Every turn ends with the gate table** (`.claude/pipeline/state.sh
gates`) of the epic run, plus one line per sub-feature: `<sub> · phase · PR · merged / waiting / parked`.
(Inside a sub-feature worktree: `STATE=<epic worktree>/.pipeline/epic-<module>/state.json .claude/pipeline/state.sh gates`.)

## 1. Decompose (once)
1. Spec gate: the spec is frozen (plus every spec in `depends_on`). Not frozen → say so and end.
2. `git fetch origin && git worktree add .claude/worktrees/epic-<module> -b epic/<module> origin/main`,
   enter it, `git push -u origin epic/<module>`. `state.sh init epic-<module> <module> epic epic/<module> main`.
3. **explorer** for the whole area, then write `.pipeline/epic-<module>/epic.md`:
   `| # | sub-feature | BR ids | depends on | backend/frontend | demo-able outcome | status |`
   Each sub-feature 5–15 BRs, testable alone, merges without breaking the app (page hidden or unlinked
   until the last one), ordered by dependency (master data → core transaction → integrations → reports).
4. No approval step: the split is build order, not behaviour, so it is yours. Log it as an assumption
   tagged `info`. The owner sees it once, in the epic hand-over: the "Built" list of `HANDOVER.md` is the
   split — one line per sub-feature (what the user can now do · merged / waiting / parked · PR).

## 2. Run sub-features
For each sub-feature whose dependencies are merged into `epic/<module>`:
`/feature <module> --sub <sub> --base epic/<module>` — full pipeline, own branch + worktree, PR into the epic.
Independent sub-features may run in parallel in separate worktrees; never two that touch the same tables
or screens, and never two test runs at once (one shared test DB).

**Merge of a sub-feature PR** (after its `/feature` reached `handover` with every gate green, nothing
parked, CI green):
1. `.claude/pipeline/merge-sub-pr.sh <n>` — it refuses any PR whose base is not `epic/*`.
2. Merged → `pr.merge = "merged"`, `git pull` in the epic worktree, sub-feature status `merged`, go on.
3. Script denied, refused, or the sub-feature has parked slices → `pr.merge = "owner"`, status `waiting`.
   Do **not** stop: run every sub-feature that does not depend on it. When nothing else can run, go to §3
   with what is merged, and list the waiting PRs first in the hand-over ("merge these, then
   `/epic <module> --resume`"). `/watch-prs` picks up the merge.
Never `gh pr merge` on a PR into `main`.

A sub-feature that fails as a whole (hard stop, or all slices parked) → its issue links go in `epic.md`;
sub-features that depend on it get status `parked` with the same issue; continue with the rest.

## 3. Close the epic
When every sub-feature is merged, waiting or parked, in the epic worktree:
1. Scenario test for the whole epic: **test-writer** (`subagent_type: test-writer`, never a fork),
   zero-context brief (spec path + all BR ids — not `epic.md`), in `backend/tests/scenarios/`. Commit it
   alone, `test(epic-<module>): …`. (Not earlier: a red scenario test on the epic branch turns the CI of
   every sub-feature PR red, and `merge-sub-pr.sh` then refuses them all.)
2. `/feature` Phase 3 (review loop) on `git diff main...epic/<module>` — full reviewers + test-runner; the
   scenario test must be green unless a parked sub-feature explains the red part (then the failing part
   is listed under Parked with that issue).
3. `/feature` Phase 4: docs commit, `HANDOVER.md` ("Built" = the split, see §1.4), push, epic PR into
   `main` (templates as in `/feature`; body adds the sub-PR links and the full manual UAT script). Label
   `agent-pipeline`. The owner merges; never push to `main`.

Keep `epic.md` status current (todo / in-progress #PR / merged / waiting / parked #issue) so `--resume`
knows where it is: [resume-after-crash](../../../docs/runbooks/resume-after-crash.md).
