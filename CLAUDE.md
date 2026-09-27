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

## Commands (workflow skills, repo-root `.claude/skills/`)
- `/spec <module>` — interview + write/extend a spec (draft)
- `/freeze <module>` — completeness check, then freeze
- `/slice <module> <BR ids>` — build one vertical slice test-first, backend → contract → frontend → review
- `/bug <description>` — reproduce → regression test → fix → log
- `/wrap` — end of session: capture learnings

Workflow agents (repo-root `.claude/agents/`): `spec-analyst`, `test-writer`, `spec-reviewer`.
Implementation agents live per package: `backend/.claude/agents/` (hono-builder, hono-reviewer, ponytail,
cavecrew-*) and `frontend/.claude/agents/` (nextjs-builder, nextjs-reviewer, ponytail, cavecrew-*).

## Checks (run before calling anything done)
- Backend: `cd backend && bun run typecheck && bun run lint && bun test` (needs `docker compose up -d` + `bun run db:push`)
- Frontend: `cd frontend && bunx tsc --noEmit && bun run lint`
- Contract: `cd backend && bun run contract:generate`, then check frontend `src/lib/api/routes.ts` paths
  against `bun run contract:query "<METHOD /path>"`

## Domain invariants (never break)
- Money = integer paise. Quantities: check the spec for units/decimals before assuming.
- Stock changes only through `inventory_ledger` postings — never edit `currentStock` directly.
- Every state change on PR/PO/GRN/SCO is role-checked (`requireRole`) and audit-trailed.
