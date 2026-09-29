# Agent pipeline protocol

How the coordinator and subagents communicate. Every pipeline agent reads this file first.

## Topology: hub and spoke
```
                         ┌──────────── you: spec approval (/freeze), questions, PR review/merge
                         │
                 ┌───────▼────────┐
                 │  COORDINATOR   │  main session, Opus — runs /feature, /epic, /watch-prs
                 │  (the only one │  owns state.json, writes briefs, reads reports,
                 │  that spawns)  │  triages findings, routes fixes, talks to you and GitHub
                 └───────┬────────┘
   brief file ▼          │            ▲ report file + short return summary
  ┌──────────┬───────────┼────────────┬─────────────┬──────────────┬─────────────┐
explorer  backend-dev  frontend-dev  test-writer  reviewers ×4   test-runner
 (haiku)   (sonnet)     (sonnet)      (sonnet)    (sonnet)        (haiku)
```
- Subagents **cannot spawn subagents** and **never talk to each other directly**. Everything flows through
  the coordinator and the run folder.
- Backend ↔ frontend share one artefact: the **API contract** (route descriptors in
  `backend/src/routes/end-points.ts` + generated `backend/.contracts/api-manifest.json` + the run's
  `contract.md`). Frontend never reads backend source to guess shapes.

## Run folder: `.pipeline/<feature>/` (committed on the feature branch)
| File | Written by | Purpose |
|---|---|---|
| `state.json` | coordinator | phase, iteration counters, branch, base, PR number, last processed PR comment id |
| `plan.md` | coordinator | slices, BR ids per slice, file ownership (backend/frontend), order |
| `contract.md` | backend-dev | endpoints added/changed: method, path, request, response, errors, roles |
| `briefs/<NN>-<agent>.md` | coordinator | the task for one agent invocation |
| `reports/<NN>-<agent>.md` | the agent | full result (details, logs, findings) |
| `findings.md` | coordinator | consolidated open findings with status (open / fixed in <sha> / wont-fix + why) |
| `questions.md` | coordinator | questions raised, who answered, answer, where recorded (spec changelog / decisions) |

`NN` is a global, increasing sequence number so the history reads in order.

## Brief format (coordinator → agent)
```md
# Brief NN — <agent> — <one-line goal>
Feature: <feature>  Branch: <branch>  Spec: docs/specs/<module>.md (vN, frozen)
BR scope: BR-XXX-01, BR-XXX-02
## Task
<what to do, concretely>
## Scope (required — every line filled)
- In: <exactly what to do, e.g. "BR-GRN-03..05 backend only">
- Out: <what NOT to do, e.g. "no frontend, no refactors, no new endpoints">
- May edit: <paths/globs>        May read: <paths/globs, or "anything">
- Size: <e.g. "≤ 3 files, ≤ 150 changed lines">
- Stop if: needs anything outside scope → return BLOCKED with the question, don't expand scope
## Inputs
- files / reports / findings to read
## Done when
- <verifiable checks>
Write your report to: .pipeline/<feature>/reports/NN-<agent>.md
```
Every subagent call uses this format — inside `/feature` **and** for one-off calls (`/bug`, `/spec`,
a quick explorer lookup). A brief without a filled Scope block must not be sent. An agent that finds work
outside its scope reports it under QUESTIONS; it never does it.

## Return format (agent → coordinator)
Write the full report file, then return **only** this block as your final message:
```
STATUS: DONE | BLOCKED | FAILED
REPORT: .pipeline/<feature>/reports/NN-<agent>.md
CHANGED: <comma-separated files, or none>
FINDINGS: <n blocker, n major, n minor>   (reviewers/test-runner only)
QUESTIONS: <numbered questions the coordinator must answer, or none>
NEXT: <one line — what you'd do next / who should act>
```
- `BLOCKED` = you need a decision. Put the question under QUESTIONS with options + your recommendation.
  Never guess a business rule; never ask the user yourself.
- `FAILED` = you couldn't complete for a technical reason (explain in report).
- Nothing after the block — no summary, no recap. Report files follow "How to write" in root `CLAUDE.md`:
  findings one line each (where · what · fix), no prose intros.

## Findings format (reviewers, test-runner)
In the report, one row per finding:
`| id | severity (blocker/major/minor) | area (backend/frontend/test/spec) | file:line | finding | suggested fix |`
Ids are `<agent-prefix>-<n>`: `CR-` code review, `SEC-` security, `PERF-` performance, `SPEC-` spec match,
`TEST-` test run, `PR-` PR feedback.

## Ownership (avoid edit collisions when agents run in parallel)
- backend-dev: `backend/**` **except test files** (never, under any brief)
- frontend-dev: `frontend/**` **except test files** (never, under any brief)
- test-writer: **only** test files — `**/*.test.ts`, `backend/src/scenarios/**`, `frontend/e2e/**` — and the
  manual UI test checklist. Never production code.

## Test independence (who writes tests vs code)
Tests are the spec turned into code. They must not be shaped by the implementation, so:
1. **Different agents.** test-writer writes and changes tests; backend-dev / frontend-dev write code. No
   agent does both, and the coordinator never edits tests or production code itself during `/feature`.
2. **Tests first.** For each slice, test-writer runs **before** the developers, and its tests are committed
   on their own: `test(<id>): BR-… tests` — before any implementation commit.
3. **Zero-context brief for test-writer.** The coordinator passes **no context of its own** — not its
   understanding of the feature, not a summary or paraphrase of the rules (a paraphrase is already an
   interpretation), not conversation history, plan notes, developer reports, review findings or "how the
   code works". test-writer gets **only pointers** and reads the sources itself, using exactly the template
   below. Always spawn it as `subagent_type: test-writer` in a fresh context — **never as a fork** (a fork
   inherits the coordinator's whole conversation). Briefs to developers never ask them to adjust tests.

   ```md
   # Brief NN — test-writer — <mode: tests | regression | checklist>
   Feature: <id>  Branch: <branch>
   Spec: docs/specs/<module>.md (vN, frozen)
   BR ids: BR-XXX-01, BR-XXX-02
   Contract: .pipeline/<id>/contract.md            (omit if none)
   Screens touched: .pipeline/<id>/reports/NN-frontend-dev.md#screens-touched   (checklist mode only)
   Test change request: findings.md#<finding-id>   (only when changing an existing test; the finding must
                                                    quote the spec rule)
   May edit: <test file globs, e.g. backend/src/**/*.test.ts>   Out: production code, specs
   Write your report to: .pipeline/<id>/reports/NN-test-writer.md
   ```
   Nothing else goes in the brief — no extra sentences. If test-writer needs more, it returns `BLOCKED` and
   the answer is added to the **spec** (via the spec changelog), never to the brief.
4. **Changing a test** needs a finding that quotes the spec rule showing the test is wrong (or a spec
   change via `/freeze`); the coordinator records the decision in `findings.md` and briefs test-writer.
   "The implementation does X" is never a valid reason.
5. **Checked mechanically.** test-runner verifies that every change to a test file on the branch is in a
   `test(<id>):` commit, and every `feat(`/`fix(` commit touches no test file. A violation is a blocker.
6. **Human checklist is independent too.** The manual UI test checklist in the PR is written by
   test-writer from the spec, not by the developer who built the screens.
- coordinator: `.pipeline/**`, `docs/**` (spec changelog, decisions, backlog)
- reviewers, auditors, test-runner, explorer: read-only (write only their report file)

## Loop limits
- Max **3** fix iterations per verification phase. Same finding id open after 2 fixes → coordinator stops
  and asks the user. Never loop silently.
