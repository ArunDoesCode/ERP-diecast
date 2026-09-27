# Project status — pick up here

> Single entry point for "where are we and what's next". Updated by `/feature` (at phase changes and in
> every PR), `/watch-prs` (merges), `/status` (on demand) and `/wrap`. Humans: read this, then run `/status`.

**Updated:** 2026-09-27 · **Milestone:** M0 workflow infra → M1 procurement hardening
**Next action:** merge PR #4 (M0 infra batch), then answer the open questions inline in
`docs/specs/grn.md`, `purchase-requisition.md`, `approval.md` → `/freeze <module>`. known-defects
(BL-001/004/005) spec is drafted (PR #5 merged) and waiting on your answers. Open P1 defects: BL-024 (owner can register super-admin), BL-025..BL-027 (from spec drafts).

## Modules
| Module | Spec | Map | Code | Tests | Open PR | Next step |
|---|---|---|---|---|---|---|
| auth-setup | none | [map](modules/auth-setup.md) | full | route-registry, app.test, authService.test | #4 | spec in M1 (BL-017 QR login later) |
| approval | draft v0 (10 Qs) | [map](modules/approval.md) | full (₹/paise form bug BL-025) | approvalRepository.test, approval.types.test | #4 | answer Qs → `/freeze approval` |
| purchase-requisition | draft v0 (13 Qs) + known-defects draft | [map](modules/purchase-requisition.md) | full (BL-001, BL-026) | none | — | answer Qs → `/freeze purchase-requisition` |
| purchase-order | none | [map](modules/purchase-order.md) | full | none | — | spec in M1 |
| grn | draft v0 (13 Qs) | [map](modules/grn.md) | full (double-post race BL-027) | none | — | answer Qs → `/freeze grn` |
| inventory | in grn spec | [map](modules/inventory.md) | full (stock/avg cost stale BL-014) | none | — | covered by grn spec |
| suppliers | none | [map](modules/suppliers.md) | full | none | — | spec in M1 |
| subcontracting | none | — | schema only | none | — | M2 |
| bom | none | — | none | none | — | M3 (after UAT-1 starts) |
| sale-order | none | — | none | none | — | M4 |

Legend — Spec: none / draft / frozen vN · Code: none / schema only / partial / full

## Active pipelines
| Feature | Branch | Phase | PR | Waiting on |
|---|---|---|---|---|
| — | | | | |

## Waiting on you
- [ ] Merge PR #4 (`feature/bl-006-test-db`, BL-006..BL-022). After merge, once: add `DATABASE_URL_TEST` to
  `backend/.env` (see `.env.example`), `docker compose up -d`, `bun run db:test:prepare`
- [ ] Answer open questions inline in the three draft specs (grn, purchase-requisition, approval)
- [ ] Answer `known-defects` spec: SME Q1–Q4, assumptions A1–A15, decisions D1–D2 → `/freeze known-defects`
- [ ] BL-012 blocked: branch protection needs GitHub Pro or a public repo (API 403) — decide: upgrade / keep private + discipline
- [ ] Remaining infra/debt needing a call: BL-010 Playwright (after specs freeze), BL-011 migrations (after
  known-defects' `db:reset` merges), BL-031 supplier batch limits
- [ ] Maps `approval` and `grn` are 1 commit behind (`5681c94` CI fix) — `/map --stale` when convenient

## Recently done
- 2026-09-27 — PR #4 (open): BL-006 test DB, BL-007 createApp, BL-008 committed manifest + route contract test,
  BL-009 hooks, BL-013 CLAUDE.md drift, BL-018 refresh re-reads RBAC, BL-020 no-change, BL-021 audit statuses,
  BL-022 approval PATCH fix; draft specs grn/approval/purchase-requisition; new items BL-025..BL-037
- 2026-09-27 — PR #5 merged: known-defects spec draft (BL-001/004/005), BL-024 privilege escalation logged
- 2026-09-27 — PR #2 merged: test independence enforced in the agent pipeline
- 2026-09-27 — PR #1 merged: workflow setup + CI green (approval subDocType, lint, seed)
- 2026-09-27 — spec-first + autonomous pipeline tooling, CI, module maps for 7 existing modules
