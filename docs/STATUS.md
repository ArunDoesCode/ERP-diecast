# Project status — pick up here

> Single entry point for "where are we and what's next". Updated by `/feature` (in the docs commit of every
> PR), `/watch-prs` (merges), `/status` (on demand) and `/wrap`. Humans: read this, then run `/status`.

**Updated:** 2026-11-19 · **Milestone:** M1 Procurement hardening and M2 Subcontracting are merged. UAT-1 at the factory has not started. BOM and Sale Order have no spec, tables or code.
**Now:** Branch `claude/cranky-payne-f2bc8a` pushed as one commit: design review + GRN screens, BR-GRN-45/46, BR-PO-24..26, BR-SCO-26..29, BR-AUTH-27..31, flow-run bug fixes, every open issue (#15–#109), design roll-out to all modules, golden-path e2e, dependency majors. Waiting for your review and merge.
**Next action:** merge the branch PR; then, in a new session, `/brief landing-dashboard` (pilot) and `/brief bom-explosion`. In parallel: prepare UAT-1 (import the factory item and supplier lists, company details, HSN codes).

## Modules
| Module | Spec | Map | Code | State |
|---|---|---|---|---|
| auth-setup | frozen v10 | [map](modules/auth-setup.md) | full — permission layer (`requirePermission`) | merged (PR #13) |
| known-defects | frozen v5 | (PR / auth maps) | full — `bootstrap-admin`, `db:reset` guard | merged (PR #13, #86) |
| purchase-requisition | frozen v2 | [map](modules/purchase-requisition.md) | full | merged (PR #13) |
| approval + approval-policies | frozen v2 / v1 | [map](modules/approval.md) | full (SCO plumbing only) | merged (PR #13) |
| purchase-order | frozen v2 | [map](modules/purchase-order.md) | full | merged (PR #13) |
| grn + grn-stock | frozen v1 (+ BR-GRN-45 after freeze) / v1 | [map](modules/grn.md) | full; screens on the design system | merged (PR #13); BR-GRN-45 on local branch |
| inventory | frozen v1 | [map](modules/inventory.md) | full | merged (PR #13) |
| suppliers | frozen v1 | [map](modules/suppliers.md) | full | merged (PR #13) |
| subcontracting | frozen v4 | [map](modules/subcontracting.md) | full — incl. IST day | merged (PR #14, #86) → UAT-1 |
| db-migrations | frozen v1 | — | full — baseline + `db:migrate` | merged (PR #86) |
| design-system | frozen v2 | [map](modules/design-system.md) | full — v2 look (graphite + indigo, 14 px, 36 px controls, 44 px rows, label-above fields) app-wide | v1 merged (PR #108); v2 epic PR open, waiting for your merge |
| bom | none | — | none | after workflow v2 (first customer of the new flow) |
| sale-order | none | — | none | after bom |

Legend — Code: none / schema only / partial / full. Tests per module: see each map's **Tests** table.

## Active work
| Item | Branch | Phase | PR | Waiting on |
|---|---|---|---|---|
| Design-review fixes, GRN on shared patterns, BR-GRN-45 (#109) | claude/cranky-payne-f2bc8a | done, local | none yet | you: push, open PR, merge |

## Waiting on you
- [ ] Push `claude/cranky-payne-f2bc8a`, open its PR, merge; then close #109.
- [ ] To let the local e2e step run (D-024), allow `db:reset` on the test DB (`localhost:5433/diecast_test`) for the pipeline.
- [ ] Set `permissions.defaultMode` to `auto` in `~/.claude/settings.json`.
- [ ] Before UAT-1: enter real **Company details** (plant name, address, GSTIN, state) and an HSN code on each raw item — a challan is refused (400) without them. The demo seed fills dummy values only.
- [ ] Before UAT-1: run the subcontracting manual UI checklist (PR #14 body).
- [ ] Dev DB: `brew install libpq` (for `pg_dump`), then `bun run db:reset` + `bun run seed` — a push-built dev DB cannot be migrated (BR-MIG-21).
- [ ] Open issues: 57, none P1 (`gh issue list`). P2 defects: #34 (inactive item on a new PO), #41 (PO supplier picker lists inactive suppliers). Date/guard follow-ups: #82, #83, #84, #85.

## Recently done
- 2026-11-19 — All 57 open issues fixed on `claude/cranky-payne-f2bc8a`; full flow run (purchase, GRN, subcontracting) passes in the browser; 1773 backend + 301 frontend tests, 7 golden-path e2e on desktop + tablet. Frontend TypeScript stays 6.0.3 until a Next.js upgrade (TS 7 breaks `next build` on 16.2). Deploy note: everyone signs in once; operator QR badges must be regenerated.
- 2026-11-20 — Design system v2 built (epic `epic/design-system-v2`): new colours, bigger type and controls on every screen, one field look; one push and one PR at the end (owner).
- 2026-11-19 — Design review of PO + GRN screens (light/dark, desktop/tablet, axe): DES-001..012 fixed; GRN list + detail on the shared patterns; BR-GRN-45 PO/PR numbers + document flow on GRN (#109). Closed #16, #44, #63 (fixed by PR #86) and duplicates #88, #89, #90.
- 2026-11-18 — PR #108 merged: design-system epic into `main`.
- 2026-11-18 — Design system epic built (3 sub-features, PRs #101–#103 into `epic/design-system`); CI now runs frontend unit tests + contrast check; e2e runs locally before push and in CI only on PRs into `main` (D-024). Follow-ups #104–#107
- 2026-11-18 — PR #92 merged: workflow v2 (brief/research/build skills, new agents, hooks, runbooks, design-system spec frozen v1). Standards hardening built, PR #96 open.
- 2026-11-18 — Workflow v2 phase 0 (truth pass): one git model (`feature/<id>` per run), `requirePermission` in all rules, one build order, one spec size rule, package agents retired into reference docs, `backend/CLAUDE.md` cut to conventions. Decision D-023
- 2026-10-01 — PR #86 merged: `db:reset` guard checks the real DB target (known-defects v5), SCO dates use the IST day (subcontracting v4), generated migrations replace `db:push` (db-migrations v1). Decisions D-020..D-022
- 2026-09-30 — PR #80 merged: all backend tests moved to `backend/tests`, scripts trimmed, SCO demo seed · PR #79: old docs removed · PR #81: dependabot config removed · PRs #65–#78: dependency bumps
- 2026-09-29 — PR #14 merged: subcontracting (SCO, challan, receipt + QA, close, loss, reports) — **M2 done**
- 2026-09-29 — PR #13 merged: permission layer, PR / approval / PO / GRN / inventory / suppliers built to frozen specs — **M1 done**
- 2026-09-27..29 — PRs #1–#11, #64, #72: workflow setup, CI, test DB, `createApp`, contract manifest, hooks, module maps, GitHub Issues as backlog, per-worktree CodeGraph
