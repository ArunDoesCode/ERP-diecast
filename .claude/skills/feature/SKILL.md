---
name: feature
description: >
  Autonomous feature pipeline, run by the main session as the Opus coordinator. Takes a FROZEN spec (or a
  sub-feature of an epic) and, without the user, plans → branches → builds with backend-dev/frontend-dev
  (Sonnet) and test-writer → verifies with code-reviewer, security-auditor, performance-auditor, spec-reviewer
  → runs test-runner → loops fixes until green → opens a GitHub PR with a manual UI test script. Resumes from
  PR feedback. Use when: /feature <module>, /feature <module> --resume, "build this feature", "run the pipeline".
model: opus
---

# /feature <module> [--sub <sub-feature>] [--base <branch>] [--resume] [--from-pr <n>]

You are the **coordinator**. You are the only one who spawns agents, talks to the user, and touches GitHub.
Read `.claude/pipeline/PROTOCOL.md` now and follow it for every agent call. Recommended session:
`claude --model opus` at repo root. Subagents run on the model pinned in their frontmatter.

**Involve the user only for:** (a) a question neither the spec nor `docs/decisions.md` answers, (b) a loop
limit hit, (c) the PR is ready. Everything else you decide and record.

## Phase 0 — Preflight
1. Spec gate: `docs/specs/<module>.md` has `status: frozen`. If not → stop: "run `/spec` then `/freeze`".
2. `gh auth status` works, `git status` clean on the base. Base = `--base` or `main`.
3. Feature id: `<module>` or `<module>-<sub>`. Branch: `feature/<id>` (sub-features of an epic:
   `feature/<epic>--<sub>` with base `epic/<epic>`).
4. Worktree: `git worktree add -b feature/<id> .claude/worktrees/<id> <base>` then EnterWorktree with that
   path (on `--resume`: EnterWorktree the existing path; recreate from the remote branch if missing).
5. Infra: `cd backend && docker compose up -d && bun run db:push`.
6. Create `.pipeline/<id>/` (state.json, plan.md, findings.md, questions.md). On `--resume` read them and
   continue from `state.json.phase` — never re-plan or re-explore a resumed run.
7. Baseline: spawn **test-runner** with `mode: baseline` → `reports/00-test-runner-baseline.md`.
8. Update `docs/STATUS.md` → Active pipelines row (phase: plan).

## Phase 1 — Plan
Context you load yourself (cheap, no exploring): `docs/STATUS.md`, the spec, `docs/modules/<module>.md`
(+ maps of `depends_on` modules), backlog items for the module, `docs/decisions.md`.
1. Spawn **explorer** with a **map-first, diff-only** brief: the map's `last_verified_commit` and paths,
   plus the questions the map doesn't answer for these BRs. No map yet → run `/map <module>` first.
2. Write `plan.md`: slices in order (each 2–6 BRs, demo-able), per slice the backend/frontend work, files
   likely touched, new tests. Any ambiguity → try spec + decisions → else ask the user (AskUserQuestion,
   ≤4 questions, options + recommendation). Record answers in `questions.md` **and** in the spec's
   Changelog/rules (spec stays frozen; bump version, note "clarified during build").
3. Commit `.pipeline/<id>/` ("chore(<id>): pipeline plan").

## Phase 2 — Build (per slice, in plan order)
Follow **Test independence** in `.claude/pipeline/PROTOCOL.md`: test-writer and the developers are separate
agents with an information wall between them; you never write tests or production code yourself here.
1. **backend-dev** (contract step only): descriptors + `contract.md` + manifest — interfaces, no logic.
   Commit `feat(<id>): <slice> contract`.
2. **test-writer**: BR tests for the slice (expect red). Spawn as `subagent_type: test-writer` (never a
   fork) with the **zero-context brief template** from PROTOCOL.md — pointers only (spec path + version, BR
   ids, contract path). Do not add your own summary, interpretation, plan notes or anything from this
   conversation; test-writer reads the spec itself. FAIL-BUG on existing code
   for in-scope BRs is expected work; out-of-scope FAIL-BUGs → `docs/backlog.md`.
   Commit the tests alone: `test(<id>): BR-… tests (red)`.
3. In parallel (one message, two Agent calls — disjoint ownership):
   **backend-dev** (implement until slice BR tests green, without touching tests) and **frontend-dev**
   (screens against `contract.md`). Neither brief includes test-writer's reasoning — only "make these
   test files pass" and the spec.
4. On BLOCKED: answer from spec/decisions, or ask the user, then re-brief the same agent with the answer.
   A developer claiming a test is wrong must quote the contradicting spec rule; decide against the spec,
   record it in `findings.md`, and if the test really is wrong, re-brief **test-writer** (not the developer)
   and commit its change as `test(<id>): …`.
5. Commit per slice: `feat(<id>): <slice> (BR-…)` — production code only, no test files.

## Phase 3 — Verify loop (whole feature diff vs base)
```
iteration = 0
loop:
  A. Review — spawn in parallel: code-reviewer, security-auditor, performance-auditor, spec-reviewer
  B. Triage — merge findings into findings.md (dedupe by file:line+issue). You decide per finding:
       fix now (all blockers, majors unless clearly out of scope) | backlog (minor / out of scope) |
       reject (explain why in findings.md — reviewers can be wrong; check the code yourself)
     If blockers/majors to fix → route by area: backend → backend-dev, frontend → frontend-dev,
       test → test-writer (only with a spec-rule citation), spec gap → user question. Independent areas
       in parallel. Commit code fixes as "fix(<id>): address <ids>" and test changes separately as
       "test(<id>): <ids>". iteration += 1 → back to A (re-review only the fix diff + spec-reviewer
       on the full diff).
  C. Test — spawn test-runner (compare with baseline; includes the test-integrity check).
     New failures → default assumption: **the code is wrong** → developer agent. Route to test-writer
     only if the failure message contradicts the spec. Commit → iteration += 1 → back to A.
  D. All green (no open blockers/majors, no new test failures) → exit loop.
  If iteration > 3, or the same finding id survives 2 fixes → STOP, summarise to the user, needs input.
```

## Phase 4 — Knowledge update, then PR
0. Before pushing, update the docs **in this branch** so the PR carries code + knowledge together:
   - `docs/modules/<module>.md` — apply the dev agents' "Map updates", add gotchas learned in the fix loop
     (recurring findings are the best gotchas), History row, `last_verified_commit` = HEAD.
   - `docs/specs/<module>.md` — Implementation status table (BR → done + test file).
   - `docs/backlog.md` — new BL items for everything backlogged during triage (with ids).
   - `docs/decisions.md` — any decision made while answering BLOCKED questions.
   - Cross-cutting convention learned (applies to all backend/frontend code) → the package `CLAUDE.md` or
     matching skill, one line — only if it would have prevented a finding. Respect budgets in `docs/KNOWLEDGE.md`.
   - `docs/STATUS.md` — module row + Active pipelines (phase: pr).
   Commit: `docs(<id>): module map, spec status, backlog`.
1. `git push -u origin feature/<id>`.
2. `gh pr create --base <base> --head feature/<id> --label agent-pipeline --title "<id>: <summary>"` with body:
   - Spec + version, BR coverage table (BR | enforced at | test)
   - What changed (backend / frontend), contract changes (from `contract.md`)
   - Audit summary: security / performance / code review — fixed, backlogged, rejected (with reason)
   - Test results (new vs baseline)
   - **Manual UI test checklist** written by **test-writer** from the spec (brief: acceptance criteria +
     frontend-dev's "Screens touched" list for URLs/roles), as a checkbox list
   - "Reply on this PR to request changes; the watcher picks it up. Merge when satisfied."
   - Footer line: `<!-- pipeline:<id> -->`
   (create label once if missing: `gh label create agent-pipeline`.)
3. Save PR number + `lastProcessedCommentAt` (now) in `state.json`; commit + push.
   Wait for CI: `gh pr checks <n> --watch`. Red → treat each failing job as `TEST-` findings, run the
   Phase 3 loop, push, repeat. Only hand over when CI is green.
4. Tell the user: PR link, how to run it locally (`cd .claude/worktrees/<id>` → backend `bun run dev`,
   frontend `bun run dev`), the manual test script. Send a push notification if available.

## Resume from PR feedback (`--resume --from-pr <n>`, normally started by /watch-prs)
1. Load state; fetch new feedback since `lastProcessedCommentAt`:
   `gh pr view <n> --json reviews,comments` and `gh api repos/{owner}/{repo}/pulls/<n>/comments`.
   Ignore anything starting with `🤖` (your own replies).
2. Classify each item: bug (behaviour ≠ spec) | spec change (behaviour = spec, user wants different) |
   question | nit. Spec changes: if needed for this milestone → apply via `/freeze` change-request path
   (bump spec version) — otherwise backlog and reply saying so.
3. Record as `PR-` findings. For each **bug**: first a regression test by **test-writer** (zero-context
   brief: spec path + BR id + the PR comment's URL — the user's own words are allowed, your diagnosis is
   not), committed as `test(<id>): …`; then the fix by the developer agent as `fix(<id>): …`. For each
   **spec change**: update the spec first, then test-writer updates/adds tests from the new spec version,
   then the developer changes code. Then run the **full Phase 3 loop** again.
4. Push; reply to each comment: `🤖 Addressed in <sha>: <one line>` (or backlogged/answered); post a PR
   comment `🤖 Pipeline re-run complete — ready for another manual test.` with an updated checklist for
   what changed (written by test-writer, checklist mode). Update `lastProcessedCommentAt`.

## After merge (detected by /watch-prs)
Docs already merged with the PR (Phase 4 step 0). Remove the worktree (`git worktree remove`), note the merge
in `docs/STATUS.md` "Recently done" (it rides along in the next PR — don't commit to `main`), and if part of
an epic, hand back to `/epic` for the next sub-feature.
