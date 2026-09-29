# DiecastOS — monorepo root

Die-casting plant ERP. Solo developer + Claude Code. `backend/` = Bun + Hono + Drizzle + Postgres (REST).
`frontend/` = Next.js 16 + TanStack Query. Each package has its own `CLAUDE.md` with tech conventions —
read the one for the package you touch. This file only covers **how work flows**.

## Current milestone
M1 — Procurement hardening: write specs + business-rule tests for PR, Approval, PO, GRN (code exists,
specs don't). Next: M2 Subcontracting → UAT-1 at factory → M3 BOM spec → M4 Sale Order + BOM explosion.
Full roadmap and daily routine: `docs/WORKFLOW.md`.

## The loop (every module, no exceptions)
SPEC → FREEZE → CONTRACT → BACKEND + TESTS → FRONTEND → SCENARIO TEST → SME CHECK → DONE → lessons written down

**Gate rule:** do not write or change feature code for a module unless `docs/specs/<module>.md` exists and
has `status: frozen`. If it doesn't, stop and say so — suggest `/spec <module>`. Bug fixes to existing
behaviour are allowed via `/bug`, but a bug that reveals a missing rule becomes a spec change first.

**Scope rule:** ideas that are not in the frozen spec become a GitHub issue (`gh issue create`, labels `P1–P3` + type + `mod:<module>`), never into the
current build. Don't "also add" things.

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
| `docs/specs/<module>.md` | Should-be behaviour: states, rules `BR-<MOD>-NN`, acceptance criteria |
| GitHub Issues | Deferred ideas, defects, change requests, UAT bugs (old `BL-NNN` ids in titles; `docs/backlog.md` = closed archive) |
| `docs/decisions.md` | Decisions with the why (append-only) |
| `docs/uat-log.md` | Factory UAT bugs |
| package `CLAUDE.md` + skills | Tech conventions per package / per kind of task |

**Before touching a module, read its map; explore only code changed since the map's
`last_verified_commit`.** Module-specific learnings go in the map, not in CLAUDE.md. If the user corrects
you on the same thing twice, write it down at the narrowest layer that fits.

## Commands (repo-root `.claude/skills/`)
You (with Claude): `/spec <module>` → SME answers → `/freeze <module>`  ← last step you must be present for
Autonomous (Opus coordinator = main session, `claude --model opus`):
- `/feature <module>` — plan → branch/worktree → build → review+security+perf+spec audit → tests → fix loop → PR
- `/epic <module>` — large feature: split into sub-features, epic branch, one `/feature` + PR per sub-feature
- `/watch-prs` — run as `/loop 10m /watch-prs`; picks up your PR comments and merges, re-runs the loop
Pick-up & knowledge: `/status` (where are we, next action), `/map <module>` / `/map --stale` (module maps),
`/wrap` (end of session). Manual helpers: `/slice` (one slice, you in the loop), `/bug`.

Pipeline agents (repo-root `.claude/agents/`, model set by family alias — always the latest of that family): explorer (haiku), backend-dev, frontend-dev,
test-writer, code-reviewer, security-auditor, performance-auditor, spec-reviewer (sonnet), test-runner (haiku),
spec-analyst (opus). Agents communicate only via the coordinator and `.pipeline/<feature>/` —
protocol: `.claude/pipeline/PROTOCOL.md`. Package agents (hono-*, nextjs-*) hold the detailed conventions
the dev/review agents read.

## Git
- **One working branch, one worktree, few PRs.** Work happens on one local branch `work/<theme>` (now
  `work/m1`) in the one worktree `.claude/worktrees/bl-006-test-db`. Re-enter it (EnterWorktree `path=`);
  never create a new branch or worktree per bug, feature, spec or doc fix.
- Every item is its own commit on that branch (`fix(BL-018): …`, `test(…)`, `feat(…)`, `docs(…)`).
  STATUS/backlog/map updates are commits there too — never a PR of their own.
- **Don't push until the batch is ready.** Push and open one PR only when the user asks, or when a group
  of related items is done and checked. The user merges; then start the next batch from fresh `main`.
- A second branch/worktree only for a truly parallel session or an epic. Never commit to `main`.
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
- Every state change on PR/PO/GRN/SCO is role-checked (`requireRole`) and audit-trailed.
