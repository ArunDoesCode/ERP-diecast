# DiecastOS — monorepo root

Die-casting plant ERP. Solo developer + Claude Code. `backend/` = Bun + Hono + Drizzle + Postgres (REST).
`frontend/` = Next.js 16 + TanStack Query. Each package has its own `CLAUDE.md` with tech conventions —
read the one for the package you touch. This file only covers **how work flows**.

## Current milestone
M1 Procurement hardening and M2 Subcontracting are merged. UAT-1 at the factory has not started. BOM and
Sale Order are not started (no spec). In progress: workflow v2 (`docs/plans/agentic-workflow-v2.md`); BOM
explosion is the first feature after it. Live state: `docs/STATUS.md`. Roadmap and routine: `docs/WORKFLOW.md`.

## The loop (every module, no exceptions)
BRIEF → RESEARCH → SPEC → PRE-FREEZE REVIEW → FREEZE (owner approves `OWNER.md`) → BUILD (contract → red
tests → backend ∥ frontend → review loop) → HAND-OVER → owner tries it, answers, merges → lessons written down

**Gate rule:** do not write or change feature code for a module unless its spec (`docs/specs/<module>/spec.md`,
or the older flat `docs/specs/<module>.md`) has `status: frozen`. If it doesn't, stop and say so — suggest
`/spec <module>`. Bug fixes to existing behaviour are allowed via `/bug`; a bug that reveals a missing rule
becomes a spec change first. Hook: `.claude/hooks/spec-gate.sh`.

**Never-wait rule:** after `/freeze` a build never stops to ask: spec gap → benchmark + logged assumption;
failure → runbook, second time → park the slice with an issue. What it decided alone is shown once, in the
hand-over (built · parked · confirm yes/no · try it). Policy + the four hard stops: `.claude/pipeline/PROTOCOL.md`.

**Scope rule:** ideas not in the frozen spec become a GitHub issue (labels `P1–P3` + type + `mod:<module>`), never part of the current build.

**Test independence rule:** tests are written only by the `test-writer` agent, from the spec, in a fresh
context with a pointers-only brief (never a fork, never your summary). Developer agents and the coordinator
never create or edit tests; tests and code go in separate `test(…)` / `feat(…)`/`fix(…)` commits.
Details: `.claude/pipeline/PROTOCOL.md` → Test independence.

## How to write (every agent, every reply, report and doc)
The user reads everything; keep it light.
- Answer or result first, in 1–2 lines. Then only what the user needs to decide or act.
- Plain words, short sentences. No jargon if a normal word works.
- Small list or table over paragraphs. A normal reply fits on one screen (~15 lines).
- One recommendation, not a survey of options. Don't restate the question or narrate what you did.
- Questions to the user: max 3 at a time, each answerable with a letter or one word.
- Detail belongs in files (spec, map, report) — link to it instead of pasting it.

## Where knowledge lives (layered — details and budgets in `docs/KNOWLEDGE.md`)
| File | Contains |
|---|---|
| `docs/STATUS.md` | **Start here.** Where every module stands, active pipelines, what's waiting, next action |
| `docs/modules/<module>.md` | As-built map: code locations, data model, API, flows, module gotchas, history |
| `docs/briefs/<feature>.md` · `docs/research/<feature>.md` | The owner's why / who / outcome · what other ERPs do, with links |
| `docs/specs/<module>/` | `OWNER.md` (the only file the owner reads) · `spec.md` (rules `BR-<MOD>-NN`) · `design/` · `assumptions.md`. Older modules: flat `docs/specs/<module>.md` |
| `docs/runbooks/` · `docs/metrics/runs.md` | What to do when a build goes wrong · one row per pipeline run |
| GitHub Issues | Deferred ideas, defects, change requests, UAT bugs (old `BL-NNN` ids in titles; `docs/backlog.md` = closed archive) |
| `docs/decisions.md` | Decisions with the why (append-only) |
| `docs/uat-log.md` | Factory UAT bugs |
| package `CLAUDE.md` + skills | Tech conventions per package / per kind of task |

**Before touching a module, read its map; explore only code changed since its `last_verified_commit`.**
Module learnings go in the map, not here. Corrected twice on the same thing → write it at the narrowest layer.

CodeGraph: per-worktree gitignored `.codegraph/` index; use it per `.claude/pipeline/PROTOCOL.md` → Code lookup.

## Commands (repo-root `.claude/skills/`)
You (with Claude): `/brief <feature>` → `/research <feature>` → `/spec <module>` → answer the cards →
`/freeze <module>`  ← last step you must be present for → `/build <module>` prints the two lines to run.
Autonomous (Opus coordinator = main session, `claude --model opus`; `/goal` keeps it going to hand-over):
- `/feature <module>` — plan → branch/worktree → build → 5 reviewers ∥ test-runner → fix loop / park → PR + hand-over
- `/epic <module>` — large feature: split into sub-features, epic branch, one `/feature` + PR per sub-feature
- `/watch-prs` — run as `/loop 10m /watch-prs`; picks up your PR comments and merges, re-runs the loop
Pick-up & knowledge: `/status` (where are we, next action), `/map <module>` / `/map --stale` (module maps),
`/wrap` (end of session). Manual helpers: `/slice` (one slice, you in the loop), `/bug`.

Agents (repo-root `.claude/agents/`, model by family alias). Spec time: researcher, solution-designer,
ui-ux-designer (sonnet), spec-analyst (opus). Build: explorer, test-runner (haiku); backend-dev, frontend-dev,
test-writer, code-reviewer, security-auditor, performance-auditor, spec-reviewer, design-reviewer (sonnet).
They talk only through the coordinator and the run folder `.pipeline/<id>/` — local to the worktree and
git-ignored; only `summary.md` (the run record) is committed. Protocol: `.claude/pipeline/PROTOCOL.md`.
Conventions the dev/review agents read: `backend/.claude/reference/`, `frontend/.claude/reference/`.

## Git
- **One branch + one worktree per pipeline run, one small PR each.** A run (`/feature`, `/bug`, `/slice`)
  works on `feature/<id>` in `.claude/worktrees/<id>`, cut from fresh `origin/main`. Resuming a run =
  re-enter its worktree (EnterWorktree `path=`); never a second branch or worktree for the same id.
- Epics: `epic/<name>` from `main`; each sub-feature is `feature/<id>` cut from the epic branch with a PR
  into it; one final PR `epic/<name>` → `main`.
- Every item is its own commit (`fix(<id>): …`, `test(…)`, `feat(…)`, `docs(…)`). STATUS/map/spec-status
  updates are commits in the same PR — never a PR of their own.
- Never commit or push to `main`. The pipeline pushes only `feature/*` and `epic/*`; the user merges into
  `main`. After the merge: remove the worktree, delete the local branch.
- Pipeline PRs carry label `agent-pipeline`. Pipeline replies on GitHub start with `🤖`.
- CI (`.github/workflows/ci.yml`) must be green before a PR is handed to the user.

## Checks (run before calling anything done)
- Backend: `cd backend && bun run typecheck && bun run lint && bun test` (needs `docker compose up -d` + `bun run db:test:prepare`; tests only ever run against the `diecast_test` DB)
- Frontend: `cd frontend && bunx tsc --noEmit && bun run lint`
- Contract: `cd backend && bun run contract:generate` and commit `.contracts/api-manifest.json` (CI runs
  `contract:check`). `bun test` fails if a frontend `API_ROUTES` path has no backend route; check methods and
  payloads with `bun run contract:query "<METHOD /path>"`

## Domain invariants (never break)
- Money = integer paise. Quantities: check the spec for units/decimals before assuming.
- Stock changes only through `inventory_ledger` postings — never edit `currentStock` directly.
- Every state change on PR/PO/GRN/SCO is permission-checked (`requirePermission("<key>")`, keys in
  `backend/src/lib/permissions.ts`; no role-name checks in route code) and audit-trailed.
