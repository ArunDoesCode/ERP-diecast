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

**Scope rule:** ideas that are not in the frozen spec go to `docs/backlog.md` (one line), never into the
current build. Don't "also add" things.

## Where knowledge lives
| File | Contains |
|---|---|
| `docs/specs/<module>.md` | Business behaviour: states, numbered rules `BR-<MOD>-NN`, acceptance criteria |
| `docs/decisions.md` | Architecture/product decisions with the why (append-only) |
| `docs/backlog.md` | Deferred ideas + change requests |
| `docs/uat-log.md` | Bugs found by the factory during UAT |
| `frontend/docs/gotchas.md` | Recurring bug patterns and fixes |
| `backend/CLAUDE.md`, `frontend/CLAUDE.md` | Tech conventions per package |

If the user corrects you on the same thing twice, write it into the right file above (ask which if unclear).

## Commands (repo-root `.claude/skills/`)
You (with Claude): `/spec <module>` → SME answers → `/freeze <module>`  ← last step you must be present for
Autonomous (Opus coordinator = main session, `claude --model opus`):
- `/feature <module>` — plan → branch/worktree → build → review+security+perf+spec audit → tests → fix loop → PR
- `/epic <module>` — large feature: split into sub-features, epic branch, one `/feature` + PR per sub-feature
- `/watch-prs` — run as `/loop 10m /watch-prs`; picks up your PR comments and merges, re-runs the loop
Manual helpers: `/slice` (one slice, you in the loop), `/bug`, `/wrap`.

Pipeline agents (repo-root `.claude/agents/`, model pinned): explorer (haiku), backend-dev, frontend-dev,
test-writer, code-reviewer, security-auditor, performance-auditor, spec-reviewer (sonnet), test-runner (haiku),
spec-analyst (opus). Agents communicate only via the coordinator and `.pipeline/<feature>/` —
protocol: `.claude/pipeline/PROTOCOL.md`. Package agents (hono-*, nextjs-*) hold the detailed conventions
the dev/review agents read.

## Git
- One branch per feature `feature/<id>` (epics: `epic/<name>` + `feature/<name>--<sub>` PRs into it), each
  in its own worktree under `.claude/worktrees/`. Never commit to `main`; the user merges PRs.
- Pipeline PRs carry label `agent-pipeline`. Pipeline replies on GitHub start with `🤖`.
- CI (`.github/workflows/ci.yml`) must be green before a PR is handed to the user.

## Checks (run before calling anything done)
- Backend: `cd backend && bun run typecheck && bun run lint && bun test` (needs `docker compose up -d` + `bun run db:push`)
- Frontend: `cd frontend && bunx tsc --noEmit && bun run lint`
- Contract: `cd backend && bun run contract:generate`, then check frontend `src/lib/api/routes.ts` paths
  against `bun run contract:query "<METHOD /path>"`

## Domain invariants (never break)
- Money = integer paise. Quantities: check the spec for units/decimals before assuming.
- Stock changes only through `inventory_ledger` postings — never edit `currentStock` directly.
- Every state change on PR/PO/GRN/SCO is role-checked (`requireRole`) and audit-trailed.
