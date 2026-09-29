---
name: epic
description: >
  Run a really large feature (e.g. Sale Order + BOM explosion) as an epic: split a frozen spec into ordered
  sub-features, create epic/<name> branch, run /feature for each sub-feature on its own branch with a PR into
  the epic, then a final scenario test and an epic PR into main. Use when: /epic <module>, "large feature",
  "break this into parts", a spec with more than ~15 BRs or several screens/modules.
model: opus
---

# /epic <module> [--resume]

You are the coordinator (see `/feature` and `.claude/pipeline/PROTOCOL.md`).

## 1. Decompose (once)
1. Spec gate: `docs/specs/<module>.md` frozen (plus every spec in `depends_on`).
2. Spawn **explorer** for the whole area. Then write `.pipeline/epic-<module>/epic.md`:
   | # | sub-feature | BR ids | depends on | backend/frontend | demo-able outcome |
   Rules: each sub-feature 5–15 BRs, independently testable, merges without breaking the app (hidden page or
   not linked in sidebar until the last one if needed), ordered by dependency (data model/master data →
   core transaction → integrations → reports).
   Example for BOM: `bom-master` → `bom-explosion-engine` → `sale-order` → `so-explosion-to-pr` → `reports`.
3. Show the decomposition to the user **once** (AskUserQuestion: approve / adjust). This is the only extra
   approval an epic needs.
4. `git switch -c epic/<module> main && git push -u origin epic/<module>`; commit `epic.md` there.
5. Scenario test for the whole epic: spawn **test-writer** (`subagent_type: test-writer`, never a fork)
   with the zero-context brief template (spec path + all BR ids of the epic — not `epic.md` or your
   decomposition notes) to write the end-to-end scenario (e.g. SO → explosion → net requirement vs stock →
   draft PRs/SCOs) up front in `backend/src/scenarios/`; commit it alone as `test(epic-<module>): …`. It
   stays red until the last sub-feature — each sub-feature PR shows how much of it passes.

## 2. Run sub-features
For each sub-feature in order whose dependencies are merged into `epic/<module>`:
`/feature <module> --sub <sub> --base epic/<module>` (full pipeline, its own branch + PR into the epic).
Independent sub-features (no dependency between them) may run in parallel in separate worktrees (run `codegraph init -i` in each new one); never
two that touch the same tables/screens.
Wait for the user to merge each sub-PR (watcher reports merges), then `git pull` the epic branch and continue.

## 3. Close the epic
When all sub-features are merged: in a worktree of `epic/<module>`, run the Phase 3 verify loop from
`/feature` on `git diff main...epic/<module>` (full reviews + test-runner, scenario must be green), then
open the epic PR into `main` with: sub-PR links, BR coverage for the whole spec, audit summary, full manual
UAT script. Label `agent-pipeline`. The user merges; then update the spec's Implementation status.

Keep `epic.md` status current (todo / in-progress #PR / merged) so `--resume` in a new session knows where
it is.
