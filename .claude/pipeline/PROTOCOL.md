# Agent pipeline protocol

How the coordinator and subagents work together. Every pipeline agent reads this file first.

## Topology: hub and spoke
- **Coordinator** = main session (Opus). Runs `/feature`, `/epic`, `/bug`. The only one that spawns agents,
  owns `state.json`, writes briefs, triages findings, parks slices, talks to GitHub and the owner.
- **Subagents**: explorer, test-runner (haiku) · backend-dev, frontend-dev, test-writer, researcher,
  code-reviewer, security-auditor, performance-auditor, spec-reviewer, design-reviewer (sonnet). They cannot
  spawn agents and never talk to each other: everything goes through the coordinator and the run folder.
- Backend ↔ frontend share one artefact: the **API contract** (descriptors in
  `backend/src/routes/end-points.ts` + generated `backend/.contracts/api-manifest.json` + the run's
  `contract.md`). Frontend never reads backend source to guess shapes.

## Git model
One branch + one worktree per run: `feature/<id>` in `.claude/worktrees/<id>`, cut from the base (`main`, or
`epic/<name>` for a sub-feature). One small PR into the base, label `agent-pipeline`.
- Push to `feature/*` / `epic/*` and `gh pr create` are automatic. Never commit or push to `main`.
- Sub-feature PR → epic branch: merged by the pipeline when every gate is green (`/epic` §2).
  Feature / epic PR → `main`: the owner merges.
- Commits: `feat(<id>)`, `fix(<id>)`, `test(<id>)`, one `docs(<id>)` per run. No `chore(<id>): pipeline …`.

## Spec paths
New: `docs/specs/<module>/spec.md` (+ `OWNER.md`, `design/{data,api,screens,edge-cases}.md`,
`assumptions.md`). Old, still valid: `docs/specs/<module>.md` (assumptions in
`docs/specs/<module>.assumptions.md`). "The spec" = whichever exists. Frozen = `status: frozen`.
Assumption row: `| A-NN | date | BR or area | question | what we chose | source | confirm / info |`.

## Run folder: `.pipeline/<id>/` (local to the worktree, gitignored)
Only `summary.md` is committed (once, in the run's `docs(<id>)` commit). `NN` = `state.json.nextSeq`.

| File | Written by | Purpose |
|---|---|---|
| `state.json` | coordinator | the run's single source of truth — see Run state |
| `plan.md` | coordinator | slices, BR ids per slice, file ownership, order |
| `contract.md` | backend-dev | endpoints added/changed: method, path, request, response, errors, permission |
| `briefs/<NN>-<agent>.md` · `reports/<NN>-<agent>.md` | coordinator · the agent | one task · its full result |
| `findings.md` | coordinator | open findings with status (open / fixed in <sha> / backlog #n / rejected + why / parked #n) |
| `questions.md` | coordinator | gaps and blocks: question, source of the answer, answer, A-NN |
| `screens/` | design-reviewer | screenshots for the PR |
| `HANDOVER.md` · `summary.md` | coordinator | from `templates/HANDOVER.md` · `templates/RUN_RECORD.md` at hand-over |

## Run state (`state.json`, schema: `.claude/pipeline/state.schema.json`)
Fields: `schema` 2 · `id` · `module` · `mode` (feature | sub | bug | epic) · `branch` · `base` · `phase`
(preflight | plan | build | review | fix | handover | done) · `phases` (start/end per phase) · `slices` ·
`currentSlice` · `calls[]` (agent, slice, start, end, tokens, result) · `fixRounds` · `findings` (counts
per class CR/SEC/PERF/SPEC/DES/TEST/PR) · `gates` · `lastGreen` · `parked[]` · `failures[]` ·
`assumptions` · `pr`. The guardrail hooks read `module` and `mode`.

The coordinator updates it **at every phase change and after every agent call**. Helper (script not
allowed → edit the file by hand):
```bash
.claude/pipeline/state.sh phase <name>                          # close the old phase, open the new one
.claude/pipeline/state.sh call <agent> <slice|-> <RESULT> <startISO> [tokens]   # append one call, end = now
.claude/pipeline/state.sh now | gates | metrics | line          # timestamp · gate table · /status · /wrap
```
- `gates.<name>.status`: pending | green | red | skipped | parked (+ `note` for skipped/parked). Gates: typecheck,
  lint, tests, contract, standards, codeReview, security, performance, spec, design, screenshots, ci.
- `lastGreen` = HEAD sha each time test-runner reports typecheck, lint, tests and contract all green.
- **Gate table rule:** `/feature` and `/epic` end **every turn** with the output of `state.sh gates` as the
  last thing in the reply. The `/goal` judge reads only the conversation.

## Never-wait build policy
After `/freeze` the run goes to the end without the owner.
| Event | What the coordinator does | Runbook (`docs/runbooks/`) |
|---|---|---|
| Spec gap (BLOCKED question, "unspecced" finding) | spec → `docs/decisions.md` → else **researcher** → follow the benchmark → row in assumptions (tag `confirm` or `info`) → continue | `spec-gap-mid-build.md` |
| Check / CI / env failure | fix by the runbook; add to `failures[]`; second failure of the same kind → park | `ci-red.md`, `test-db-reset.md`, `docker-or-port-problem.md`, `contract-manifest-stale.md` |
| Same finding survives 2 fixes, or 3 fix rounds | **park** the slice: revert to `lastGreen`, issue with evidence, next slice | `fix-loop-does-not-end.md`, `park-a-slice.md` |
| Tool call denied | drop the action, record it, go on with other work | `permission-blocked.md` |
| Session died | resume from `state.json` | `resume-after-crash.md` |
| Push / open PR | automatic to `feature/*` or `epic/*` | — |

**Hard stops (the only ones):** a destructive or irreversible action · a guardrail hook or deny rule
blocks the run · a domain invariant would break (money in paise, stock only through the ledger, audit
trail) · a needed secret or access is missing. On a hard stop: write `HANDOVER.md`, phase `handover`, stop.
Everything the run decided alone is shown once, at the end, in the hand-over (`templates/HANDOVER.md`).

## Brief format (coordinator → agent)
```md
# Brief NN — <agent> — <one-line goal>
Run: <id>  Branch: <branch>  Base: <base>  Spec: <spec path> (vN, frozen)
BR scope: BR-XXX-01, BR-XXX-02
## Task
<what to do, concretely>
## Scope (required — every line filled)
- In: <exactly what, e.g. "BR-GRN-03..05 backend only">
- Out: <what NOT to do, e.g. "no frontend, no refactors, no new endpoints">
- May edit: <paths/globs>        May read: <paths/globs, or "anything">
- Size: <e.g. "≤ 3 files, ≤ 150 changed lines">   Stop if: needs anything outside scope → return BLOCKED
## Inputs
- <paths, finding ids, report sections — pointers only>
## Done when
- <verifiable checks; developers: the slice's test files + package typecheck and lint — see Efficiency>
Write your report to: .pipeline/<id>/reports/NN-<agent>.md
```
Used for every subagent call. No filled Scope block → do not send. **Pointers, not pasted text:** a brief
names files, sections and ids; it never copies spec text, code, reports or findings. Work outside scope is
reported under QUESTIONS, never done.

## Return format (agent → coordinator)
Write the full report file, then return **only** this block:
```
STATUS: DONE | BLOCKED | FAILED
REPORT: .pipeline/<id>/reports/NN-<agent>.md
CHANGED: <comma-separated files, or none>
FINDINGS: <n blocker, n major, n minor>   (reviewers/test-runner only)
QUESTIONS: <numbered questions the coordinator must answer, or none>
NEXT: <one line — who should act; name the runbook if one applies>
```
`BLOCKED` = you need a decision: question + options + your recommendation. Never guess a business rule;
never ask the owner yourself. `FAILED` = technical reason. Nothing after the block. Reports: root `CLAUDE.md` → How to write.

## Findings format (reviewers, test-runner)
`| id | severity (blocker/major/minor) | area (backend/frontend/test/spec) | file:line | finding | suggested fix |`
Ids: `CR-` code review, `SEC-` security, `PERF-` performance, `SPEC-` spec, `DES-` design, `TEST-` test run, `PR-` PR feedback.

## Ownership (no edit collisions in parallel runs)
- backend-dev: `backend/**` **except test files** (never, under any brief)
- frontend-dev: `frontend/**` **except test files** (never, under any brief)
- test-writer: **only** test files — `**/*.test.ts`, `backend/tests/**`, `frontend/e2e/**` — and the manual
  UI test checklist. Never production code.
- researcher: `docs/research/**` only.
- coordinator: `.pipeline/**`, `docs/**` (spec changelog, assumptions, decisions, maps) and GitHub issues.
- reviewers, auditors, test-runner, explorer: read-only (write only their report; design-reviewer also `screens/`).

## Test independence (who writes tests vs code)
Tests are the spec turned into code. They must not be shaped by the implementation, so:
1. **Different agents.** test-writer writes and changes tests; backend-dev / frontend-dev write code. No
   agent does both, and the coordinator never edits tests or production code itself during `/feature`.
2. **Contract → red tests → code.** For each slice, backend-dev writes the contract (interfaces only, no
   logic), then test-writer runs **before** any implementation, and its tests are committed
   on their own: `test(<id>): BR-… tests` — before any implementation commit.
3. **Zero-context brief for test-writer.** The coordinator passes **no context of its own** — not its
   understanding of the feature, not a summary or paraphrase of the rules (a paraphrase is already an
   interpretation), not conversation history, plan notes, developer reports, review findings or "how the
   code works". test-writer gets **only pointers** and reads the sources itself, using exactly the template
   below. Always spawn it as `subagent_type: test-writer` in a fresh context — **never as a fork** (a fork
   inherits the coordinator's whole conversation). Briefs to developers never ask them to adjust tests.

   ```md
   # Brief NN — test-writer — <mode: tests | regression | checklist>
   Run: <id>  Branch: <branch>
   Spec: <spec path> (vN, frozen)
   BR ids: BR-XXX-01, BR-XXX-02
   Contract: .pipeline/<id>/contract.md            (omit if none)
   Screens touched: .pipeline/<id>/reports/NN-frontend-dev.md#screens-touched   (checklist mode only)
   Test change request: .pipeline/<id>/findings.md#<finding-id>   (only when changing an existing test;
                                                    the finding must quote the spec rule)
   May edit: <test file globs, e.g. backend/tests/**/*.test.ts>   Out: production code, specs
   Write your report to: .pipeline/<id>/reports/NN-test-writer.md
   ```
   Nothing else goes in the brief — no extra sentences. If test-writer needs more, it returns `BLOCKED` and
   the answer is added to the **spec** (via the spec changelog), never to the brief.
4. **Changing a test** needs a finding that quotes the spec rule showing the test is wrong (or a spec
   change via `/freeze`); the coordinator records the decision in `findings.md` and briefs test-writer.
   "The implementation does X" is never a valid reason.
5. **Checked mechanically.** test-runner verifies that every change to a test file on the branch is in a
   `test(<id>):` commit, and every `feat(`/`fix(` commit touches no test file. A violation is a blocker.
   The `test-ownership.sh` hook enforces the same at write time.
6. **Human checklist is independent too.** The manual UI test checklist in the PR is written by
   test-writer from the spec, not by the developer who built the screens.

## Efficiency (one full test run per loop)
- **Full `bun test` is run only by test-runner**: once as baseline, once per review round.
- **test-runner runs in parallel with the reviewers** (one message, all Agent calls together).
- **Developers run only their slice**: `bun test <the test files named in the brief>` plus their package's
  typecheck and lint. Never the whole suite.
- **Reviewers do not run tests.** code-reviewer reads only the review checklist of the package the diff
  touches. design-reviewer runs only when `frontend/e2e/` and the `design-system` skill exist; otherwise
  gates `design` and `screenshots` = `skipped` with that note.
- **Fix rounds re-review the fix diff only** (spec-reviewer: full diff), again with test-runner in parallel.
- **Docs once per run:** map, spec status + changelog, assumptions, decisions, `docs/STATUS.md`,
  `summary.md` go in one `docs(<id>)` commit at hand-over (earlier only when a park needs a clean tree).
  Issues are opened once, at hand-over — except the issue a park needs.

**Loop limit:** max **3** fix rounds. Same finding id open after 2 fixes, or round 3 not green → park.
Never a 4th round, never a silent loop, never a wait for the owner.

## Code lookup (CodeGraph)
Each worktree has its own gitignored `.codegraph/` index, built by the SessionStart hook; `/feature` runs
`codegraph sync` at run start, after each slice commit and before review. Agents never init or sync; index
missing or still building → Read/Grep.
- **Use it for** "where is X", "who calls X", "what breaks if X changes": one `codegraph_explore` call per
  question, symbol/file names in the query, `projectPath` = the worktree root (absolute). **Do not Read a
  file it already returned.**
- **Still Read/Grep for**: files you are about to edit, literal strings, config, docs, SQL/migrations, your
  own uncommitted edits. Not needed for test-runner, doc-only tasks, reading a spec or map.
- **Test independence wins:** test-writer looks up signatures/types/routes only, never implementation
  bodies of the code under test.
