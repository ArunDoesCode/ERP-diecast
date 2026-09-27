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
## Inputs
- files / reports / findings to read
## Constraints
- ownership: only edit <paths>
- do not: <things out of scope>
## Done when
- <verifiable checks>
Write your report to: .pipeline/<feature>/reports/NN-<agent>.md
```

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

## Findings format (reviewers, test-runner)
In the report, one row per finding:
`| id | severity (blocker/major/minor) | area (backend/frontend/test/spec) | file:line | finding | suggested fix |`
Ids are `<agent-prefix>-<n>`: `CR-` code review, `SEC-` security, `PERF-` performance, `SPEC-` spec match,
`TEST-` test run, `PR-` PR feedback.

## Ownership (avoid edit collisions when agents run in parallel)
- backend-dev: `backend/**` except tests written by test-writer (may edit them only if a brief says so)
- frontend-dev: `frontend/**`
- test-writer: `backend/**/*.test.ts`, `backend/src/scenarios/**`, `frontend/e2e/**`
- coordinator: `.pipeline/**`, `docs/**` (spec changelog, decisions, backlog)
- reviewers, auditors, test-runner, explorer: read-only (write only their report file)

## Loop limits
- Max **3** fix iterations per verification phase. Same finding id open after 2 fixes → coordinator stops
  and asks the user. Never loop silently.
