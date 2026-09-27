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
6. Create `.pipeline/<id>/` (state.json, plan.md, findings.md, questions.md). On `--resume` read them.
7. Baseline: spawn **test-runner** with `mode: baseline` → `reports/00-test-runner-baseline.md`.

## Phase 1 — Plan
1. Spawn **explorer** (brief: which files/utilities exist for these BRs, patterns to copy).
2. Write `plan.md`: slices in order (each 2–6 BRs, demo-able), per slice the backend/frontend work, files
   likely touched, new tests. Any ambiguity → try spec + decisions → else ask the user (AskUserQuestion,
   ≤4 questions, options + recommendation). Record answers in `questions.md` **and** in the spec's
   Changelog/rules (spec stays frozen; bump version, note "clarified during build").
3. Commit `.pipeline/<id>/` ("chore(<id>): pipeline plan").

## Phase 2 — Build (per slice, in plan order)
1. **test-writer**: BR tests for the slice (expect red). FAIL-BUG on existing code for in-scope BRs is
   expected work; out-of-scope FAIL-BUGs → `docs/backlog.md`.
2. **backend-dev** (contract step): descriptors + `contract.md` + manifest.
3. In parallel (one message, two Agent calls — disjoint ownership):
   **backend-dev** (implement until slice BR tests green) and **frontend-dev** (screens against `contract.md`).
4. On BLOCKED: answer from spec/decisions, or ask the user, then re-brief the same agent with the answer.
5. Commit per slice: `feat(<id>): <slice> (BR-…)`.

## Phase 3 — Verify loop (whole feature diff vs base)
```
iteration = 0
loop:
  A. Review — spawn in parallel: code-reviewer, security-auditor, performance-auditor, spec-reviewer
  B. Triage — merge findings into findings.md (dedupe by file:line+issue). You decide per finding:
       fix now (all blockers, majors unless clearly out of scope) | backlog (minor / out of scope) |
       reject (explain why in findings.md — reviewers can be wrong; check the code yourself)
     If blockers/majors to fix → route by area: backend → backend-dev, frontend → frontend-dev,
       test → test-writer, spec gap → user question. Independent areas in parallel. Commit
       "fix(<id>): address <ids>". iteration += 1 → back to A (re-review only the fix diff + spec-reviewer
       on the full diff).
  C. Test — spawn test-runner (compare with baseline).
     New failures → route same as B → commit → iteration += 1 → back to A.
  D. All green (no open blockers/majors, no new test failures) → exit loop.
  If iteration > 3, or the same finding id survives 2 fixes → STOP, summarise to the user, needs input.
```

## Phase 4 — PR
1. `git push -u origin feature/<id>`.
2. `gh pr create --base <base> --head feature/<id> --label agent-pipeline --title "<id>: <summary>"` with body:
   - Spec + version, BR coverage table (BR | enforced at | test)
   - What changed (backend / frontend), contract changes (from `contract.md`)
   - Audit summary: security / performance / code review — fixed, backlogged, rejected (with reason)
   - Test results (new vs baseline)
   - **Manual UI test script** from frontend-dev reports (role, URL, steps, expected) as a checkbox list
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
3. Record as `PR-` findings, route fixes (Phase 3 B routing), then run the **full Phase 3 loop** again.
4. Push; reply to each comment: `🤖 Addressed in <sha>: <one line>` (or backlogged/answered); post a PR
   comment `🤖 Pipeline re-run complete — ready for another manual test.` with an updated test script for
   what changed. Update `lastProcessedCommentAt`.

## After merge (detected by /watch-prs)
Mark `state.json` `phase: merged`, remove the worktree (`git worktree remove`), mark BRs done in the spec's
Implementation status on the base branch (small follow-up commit/PR if base is main), and if part of an
epic, hand back to `/epic` for the next sub-feature.
