---
name: feature
description: >
  Autonomous feature pipeline, run by the main session as the Opus coordinator. Takes a FROZEN spec (or a
  sub-feature of an epic) and, without the user, plans → branches → builds with backend-dev/frontend-dev
  (Sonnet) and test-writer → reviews with code-reviewer, security-auditor, performance-auditor, spec-reviewer,
  design-reviewer and test-runner in parallel → loops fixes, parks what will not go green → opens a GitHub PR
  with a hand-over. Never waits for the owner. Resumes from PR feedback. Use when: /feature <module>,
  /feature <module> --resume, "build this feature", "run the pipeline".
model: opus
---

# /feature <module> [--sub <sub-feature>] [--base <branch>] [--resume] [--from-pr <n>]

You are the **coordinator**. Read `.claude/pipeline/PROTOCOL.md` now; it holds the rules this file only
points to (run state, never-wait policy, brief format, test independence, efficiency).

**You never stop to ask the owner.** Events and what to do: PROTOCOL → Never-wait build policy. The only
stops are the four hard stops listed there. Everything you decide alone is logged and shown once, in the
hand-over.

**Every turn ends with the gate table:** run `.claude/pipeline/state.sh gates` and print its output as the
last thing in your reply (script not allowed → print the same table by hand from `state.json`).

**State:** `state.sh phase <name>` at every phase change; `state.sh call …` after every agent call; set
gates, findings counts, `lastGreen`, `parked`, `failures` in `state.json` the moment they change.

## Phase 0 — Preflight (`phase: preflight`)
1. Spec gate: the spec (PROTOCOL → Spec paths) has `status: frozen`. If not → say "run `/spec` then
   `/freeze`" and end. (The `spec-gate.sh` hook enforces the same on every edit.)
2. `gh auth status` works. Base = `--base` or `main`. Run id = `<module>` or `<module>-<sub>`.
3. Branch + worktree, one per run: `git fetch origin`, then
   `git worktree add .claude/worktrees/<id> -b feature/<id> origin/<base>` and EnterWorktree. Session already
   sits in its own fresh worktree → stay there, `git switch -c feature/<id> origin/<base>`. `--resume`:
   re-enter the existing one — [resume-after-crash](../../../docs/runbooks/resume-after-crash.md). Never `main`.
4. State: `.claude/pipeline/state.sh init <id> <module> <feature|sub> feature/<id> <base>`, then fill `spec`
   (+ `epic`, `envFile`). On `--resume` read it and continue from `phase` — never re-plan or re-explore.
5. Infra: `cd backend && docker compose up -d && bun run db:test:prepare`. Trouble →
   [docker-or-port-problem](../../../docs/runbooks/docker-or-port-problem.md),
   [test-db-reset](../../../docs/runbooks/test-db-reset.md). Code index:
   `[ -d .codegraph ] && codegraph sync || codegraph init -i`; sync again after each slice commit.
6. Design gate: no `frontend/e2e/` or no `.claude/skills/design-system/` → set gates `design` and
   `screenshots` to `skipped`, note "design-reviewer not active yet".
7. Baseline: **test-runner** `mode: baseline` → `reports/00-test-runner-baseline.md`. Red on the base is
   not this run's work: note it for the hand-over ("red before this run").

## Phase 1 — Plan (`phase: plan`)
Load yourself (no exploring): `docs/STATUS.md`, the spec (new layout: `spec.md` + `design/*.md`),
`docs/modules/<module>.md` (+ maps of `depends_on`), `gh issue list --label mod:<module>`, `docs/decisions.md`.
1. **explorer**, map-first and diff-only: the map's `last_verified_commit` and paths, plus the questions
   the map does not answer. No map yet → `/map <module>` first.
2. Write `plan.md`: slices in order (2–6 BRs each, demo-able, independent enough to park one), per slice
   backend/frontend work, files, tests. Copy the slices into `state.json.slices`.
3. Anything the spec leaves open → [spec-gap-mid-build](../../../docs/runbooks/spec-gap-mid-build.md):
   spawn **researcher** (brief: the question, the module, "how do ERPNext / Odoo / SAP B1 handle it";
   it writes `docs/research/<id>-gaps.md`), follow the benchmark, append the row to the assumptions file,
   add the rule to the spec changelog, go on. No question to the owner.

## Phase 2 — Build (`phase: build`, per slice in plan order)
Test independence (PROTOCOL) holds: you write neither tests nor production code.
1. **backend-dev**, contract step: descriptors + `contract.md` + manifest, no logic.
   Commit `feat(<id>): <slice> contract`.
2. **test-writer** (`subagent_type: test-writer`, never a fork) with the **zero-context brief template**
   — pointers only. Expect red. FAIL-BUG on in-scope BRs is work for step 3; out of scope → note for an issue.
   Commit the tests alone: `test(<id>): BR-… tests (red)`.
3. In parallel (one message): **backend-dev** (implement until the slice's test files pass) and
   **frontend-dev** (screens against `contract.md`). Briefs name the slice's test files under "Done when";
   developers run only those plus their package's typecheck and lint.
4. Agent returns BLOCKED:
   - answer is in the spec or `docs/decisions.md` → quote the place in `questions.md`, re-brief;
   - spec gap → as Phase 1 step 3, then test-writer (new spec version) → developer;
   - "the test is wrong" → the developer must quote the contradicting spec rule; you decide against the
     spec, record it in `findings.md`; if the test is wrong re-brief **test-writer**, commit `test(<id>): …`;
   - permission denied → [permission-blocked](../../../docs/runbooks/permission-blocked.md).
5. Agent returns FAILED, or the same slice fails twice for the same kind of reason → add to `failures[]`,
   then [park-a-slice](../../../docs/runbooks/park-a-slice.md) and take the next slice.
6. Commit per slice: `feat(<id>): <slice> (BR-…)` — production code only. Slice status → `green`.

## Phase 3 — Review loop (`phase: review` ⇄ `fix`, whole diff vs base)
```
A. Review (phase review) — `codegraph sync`, then ONE message with all of:
     code-reviewer · security-auditor · performance-auditor · spec-reviewer · design-reviewer (if active)
     · test-runner (compare with baseline; includes test integrity and standards:check)
   Round 2+: reviewers get the fix diff only (spec-reviewer the full diff); test-runner always full.
B. Triage — merge into findings.md (dedupe by file:line + issue), update state.json findings + gates.
     fix now: every blocker, majors in scope · backlog: minors, out of scope (issue at hand-over)
     reject: with a reason line — reviewers can be wrong; check the code yourself
     spec gap: Phase 1 step 3, never back to a developer
     new test failure: the code is wrong by default → developer; test-writer only if the failure
       contradicts a quoted spec rule
   test-runner all green → lastGreen = HEAD.
C. Nothing to fix and gates green (or skipped / parked with a note) → Phase 4.
D. Fix (phase fix, fixRounds += 1) — route by area in parallel: backend-dev, frontend-dev,
   test-writer. Commit "fix(<id>): <ids>" and "test(<id>): <ids>" separately → back to A.
E. Round 3 not green, or one finding id open after 2 fixes → do NOT ask:
   docs/runbooks/fix-loop-does-not-end.md → park the owning slice → fixRounds = 0 → back to A.
```
`standards:check` is in report mode: its findings never block; note the count in the `standards` gate.

## Phase 4 — Hand-over (`phase: handover`)
1. **test-writer**, checklist mode → manual UI test checklist (from the spec + "Screens touched").
2. One docs commit, `docs(<id>): map, spec status, assumptions, run summary`:
   - `docs/modules/<module>.md`: dev agents' "Map updates", gotchas from the fix loop, History row,
     `last_verified_commit`.
   - the spec: Implementation status (BR → done / parked #n + test file), changelog lines for assumptions.
   - assumptions file, `docs/decisions.md`, `docs/research/<id>-gaps.md` if written.
   - a cross-cutting convention that would have prevented a finding → one line in the package
     `CLAUDE.md` or matching skill (budgets: `docs/KNOWLEDGE.md`).
   - `docs/STATUS.md` (module row, Active pipelines) — the only STATUS edit of the run.
   - `.pipeline/<id>/summary.md` from `.claude/pipeline/templates/RUN_RECORD.md`.
3. Issues, once: one per backlog finding (`gh issue create`, labels `P1–P3` + type + `mod:<module>`);
   set the numbers in `findings.md`.
4. `.pipeline/<id>/HANDOVER.md` from `.claude/pipeline/templates/HANDOVER.md` (≤ 40 lines).
5. `git push -u origin feature/<id>`, then
   `gh pr create --base <base> --head feature/<id> --label agent-pipeline --title "<id>: <summary>"`
   with the body from `.claude/pipeline/templates/PR_BODY.md`. No question first. Save `pr` in `state.json`.
6. CI: `gh pr checks <n> --watch`. Red → [ci-red](../../../docs/runbooks/ci-red.md) (findings `TEST-`,
   Phase 3 loop, push). Green → gate `ci` green. Same job red after 2 fix pushes → park, per the runbook.
7. Merge: base `main` → `pr.merge = "owner"`. Base `epic/*` → `/epic` §2 merges it.
8. Final reply: 3 lines (what is ready, PR link, how many `confirm` questions and parked slices) + the
   gate table. Phase stays `handover` until the PR is merged.

A run where every slice is parked still ends here, with a PR that carries the docs and the issue list.

## Resume from PR feedback (`--resume --from-pr <n>`, started by /watch-prs)
1. Load state; fetch feedback newer than `pr.lastProcessedCommentAt`:
   `gh pr view <n> --json reviews,comments` and `gh api repos/{owner}/{repo}/pulls/<n>/comments`.
   Ignore anything starting with `🤖`.
2. Classify each item: bug (behaviour ≠ spec) · spec change (behaviour = spec, owner wants different) ·
   answer to a `confirm` question · question · nit.
   - `confirm` answered **yes** → mark the assumption confirmed. **No** → a normal change request for
     that rule only (`/freeze` change-request path, spec version bump); never a re-run of the feature.
   - spec change not needed for this milestone → issue, reply saying so.
3. Record as `PR-` findings. Bug: regression test first by **test-writer** (zero-context brief: spec
   path + BR id + the PR comment URL), `test(<id>): …`; then the developer, `fix(<id>): …`. Spec change:
   spec first, then test-writer, then the developer. Then the full Phase 3 loop and Phase 4 steps 2–6
   (docs amend as a new `docs(<id>)` commit only if something changed).
4. Reply to each comment `🤖 Addressed in <sha>: <one line>` (or backlogged / answered), then one comment
   `🤖 Pipeline re-run complete — ready for another manual test.` Update `pr.lastProcessedCommentAt`.

## After merge (detected by /watch-prs)
`state.sh phase done`. From the main checkout: `git worktree remove .claude/worktrees/<id>` and
`git branch -d feature/<id>` (rules: [worktree-branch-cleanup](../../../docs/runbooks/worktree-branch-cleanup.md)).
Part of an epic → hand back to `/epic`. The merge shows up in `docs/STATUS.md` with the next run's docs
commit or `/status` — never a PR of its own.
