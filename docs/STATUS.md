# Project status — pick up here

> Single entry point for "where are we and what's next". Updated by `/feature` (in the docs commit of every
> PR), `/watch-prs` (merges), `/status` (on demand) and `/wrap`. Humans: read this, then run `/status`.

**Updated:** 2026-11-18 · **Milestone:** M1 Procurement hardening and M2 Subcontracting are merged. UAT-1 at the factory has not started. BOM and Sale Order have no spec, tables or code.
**Now:** Workflow v2 build in progress — plan: [plans/agentic-workflow-v2.md](plans/agentic-workflow-v2.md). No product feature is built until its pilot (landing dashboard) is done.
**Next action:** finish workflow v2 (phases 1–6 of the plan), then `/brief bom-explosion`. In parallel: prepare UAT-1 (list under "Waiting on you").

## Modules
| Module | Spec | Map | Code | State |
|---|---|---|---|---|
| auth-setup | frozen v10 | [map](modules/auth-setup.md) | full — permission layer (`requirePermission`) | merged (PR #13) |
| known-defects | frozen v5 | (PR / auth maps) | full — `bootstrap-admin`, `db:reset` guard | merged (PR #13, #86) |
| purchase-requisition | frozen v2 | [map](modules/purchase-requisition.md) | full | merged (PR #13) |
| approval + approval-policies | frozen v2 / v1 | [map](modules/approval.md) | full (SCO plumbing only) | merged (PR #13) |
| purchase-order | frozen v2 | [map](modules/purchase-order.md) | full | merged (PR #13) |
| grn + grn-stock | frozen v1 / v1 | [map](modules/grn.md) | full | merged (PR #13) |
| inventory | frozen v1 | [map](modules/inventory.md) | full | merged (PR #13) |
| suppliers | frozen v1 | [map](modules/suppliers.md) | full | merged (PR #13) |
| subcontracting | frozen v4 | [map](modules/subcontracting.md) | full — incl. IST day | merged (PR #14, #86) → UAT-1 |
| db-migrations | frozen v1 | — | full — baseline + `db:migrate` | merged (PR #86) |
| bom | none | — | none | after workflow v2 (first customer of the new flow) |
| sale-order | none | — | none | after bom |

Legend — Code: none / schema only / partial / full. Tests per module: see each map's **Tests** table.

## Active work
| Item | Branch | Phase | PR | Waiting on |
|---|---|---|---|---|
| Workflow v2 (process only, no product code) | claude/erp-agentic-review-1af233 | Phase 0 truth pass done; phases 1, 2, 5 in progress | not opened | coordinator |
| Tick manual UI checklist items (M1) | claude/quizzical-shamir-a5a596 | open since 2026-10-02, no `agent-pipeline` label | #87 | you: merge or close |

No `/feature` pipeline is running.

## Waiting on you
- [ ] PR #87 — merge or close.
- [ ] Issues #16, #44, #63 are still open although PR #86 says it fixes them — close them if you agree.
- [ ] Before UAT-1: enter real **Company details** (plant name, address, GSTIN, state) and an HSN code on each raw item — a challan is refused (400) without them. The demo seed fills dummy values only.
- [ ] Before UAT-1: run the subcontracting manual UI checklist (PR #14 body).
- [ ] Dev DB: `brew install libpq` (for `pg_dump`), then `bun run db:reset` + `bun run seed` — a push-built dev DB cannot be migrated (BR-MIG-21).
- [ ] Open issues: 51, none P1 (`gh issue list`). Date/guard follow-ups: #82, #83, #84, #85.

## Recently done
- 2026-11-18 — Workflow v2 phase 0 (truth pass): one git model (`feature/<id>` per run), `requirePermission` in all rules, one build order, one spec size rule, package agents retired into reference docs, `backend/CLAUDE.md` cut to conventions. Decision D-023
- 2026-10-01 — PR #86 merged: `db:reset` guard checks the real DB target (known-defects v5), SCO dates use the IST day (subcontracting v4), generated migrations replace `db:push` (db-migrations v1). Decisions D-020..D-022
- 2026-09-30 — PR #80 merged: all backend tests moved to `backend/tests`, scripts trimmed, SCO demo seed · PR #79: old docs removed · PR #81: dependabot config removed · PRs #65–#78: dependency bumps
- 2026-09-29 — PR #14 merged: subcontracting (SCO, challan, receipt + QA, close, loss, reports) — **M2 done**
- 2026-09-29 — PR #13 merged: permission layer, PR / approval / PO / GRN / inventory / suppliers built to frozen specs — **M1 done**
- 2026-09-27..29 — PRs #1–#11, #64, #72: workflow setup, CI, test DB, `createApp`, contract manifest, hooks, module maps, GitHub Issues as backlog, per-worktree CodeGraph
