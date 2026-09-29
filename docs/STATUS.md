# Project status — pick up here

> Single entry point for "where are we and what's next". Updated by `/feature` (at phase changes and in
> every PR), `/watch-prs` (merges), `/status` (on demand) and `/wrap`. Humans: read this, then run `/status`.

**Updated:** 2026-09-29 · **Milestone:** M0 workflow infra → M1 procurement hardening
**Next action:** answer the "Questions for you" tables (7 each) in `grn`+`grn-stock`, `approval`+`approval-policies`,
`purchase-requisition`, `known-defects` → `/freeze <module>`. Open P1 defects: BL-024 (owner can register
super-admin), BL-025..BL-027 (from spec drafts).

## Modules
| Module | Spec | Map | Code | Tests | Open PR | Next step |
|---|---|---|---|---|---|---|
| auth-setup | stub draft v0 | [map](modules/auth-setup.md) | full | route-registry, app.test, authService.test | — | stub spec (BR-AUTH-01/02) → `/spec auth-setup` |
| approval | draft v0 (+ approval-policies, 7 Qs) | [map](modules/approval.md) | full (₹/paise form bug BL-025) | approvalRepository.test, approval.types.test, approvalService.test | — | answer Qs → `/freeze approval` |
| purchase-requisition | draft v0 (7 Qs) + known-defects draft (7 Qs) | [map](modules/purchase-requisition.md) | full (BL-001, BL-026) | none | — | answer Qs → `/freeze purchase-requisition` |
| purchase-order | none | [map](modules/purchase-order.md) | full | none | — | spec in M1 |
| grn | frozen v1 (+ grn-stock v1) | [map](modules/grn.md) | full — all BRs built on work/m1-stock | grnService.test, stockPosting.test | — | merge work/m1-stock into work/m1 |
| inventory | frozen v1 (stock rules in grn-stock) | [map](modules/inventory.md) | full; grn-stock parts rebuilt (BL-014 fixed) | stockPosting.test | — | `/feature inventory` on work/m1-stock |
| suppliers | none | [map](modules/suppliers.md) | full | none | — | spec in M1 |
| subcontracting | none | — | schema only | none | — | M2 |
| bom | none | — | none | none | — | M3 (after UAT-1 starts) |
| sale-order | none | — | none | none | — | M4 |

Legend — Spec: none / draft / frozen vN · Code: none / schema only / partial / full

## Active pipelines
| Feature | Branch | Phase | PR | Waiting on |
|---|---|---|---|---|
| agent-scope docs | feature/agent-scope | PR open, CI green | [#10](../../pull/10) | you to merge |
| grn + grn-stock | work/m1-stock | done, not pushed | — | merge into work/m1 (auth session) |

## Waiting on you
- [ ] Merge PR #10 (docs-only: required Scope block in subagent briefs, model-alias note)
- [ ] One-time local setup from PR #4:
  add `DATABASE_URL_TEST` to `backend/.env` (see `.env.example`), `docker compose up -d`, `bun run db:test:prepare`
- [ ] Answer the "Questions for you" tables (7 each) in grn(+grn-stock), purchase-requisition, approval(+approval-policies)
- [ ] Answer `known-defects` spec: 7 questions → `/freeze known-defects`
- [ ] BL-012 blocked: branch protection needs GitHub Pro or a public repo (API 403) — decide: upgrade / keep private + discipline
- [ ] Remaining infra/debt needing a call: BL-010 Playwright (after specs freeze), BL-011 migrations (after
  known-defects' `db:reset` merges), BL-031 supplier batch limits
- [ ] Maps `auth-setup` and `approval` are stale (BL-018/BL-022 fixes touched their code after
  `last_verified_commit`) — `/map --stale` when convenient

## Recently done
- 2026-09-29 — PR #9 merged: draft specs rewritten in slim format (~1,500 → 537 lines; grn+grn-stock,
  approval+approval-policies, purchase-requisition, known-defects; ≤7 questions each, rule ids kept)
- 2026-09-27 — PR #8 merged: plain-language rule for all agents + slim spec template
- 2026-09-27 — PR #7 merged: backlog/STATUS refresh after PR #6
- 2026-09-27 — PR #6 merged: BL-018/BL-022 regression tests redone by test-writer (spec stub `auth-setup.md` BR-AUTH-01/02)
- 2026-09-27 — PR #4 merged: BL-006 test DB, BL-007 createApp, BL-008 committed manifest + route contract test,
  BL-009 hooks, BL-013 CLAUDE.md drift, BL-018 refresh re-reads RBAC, BL-020 no-change, BL-021 audit statuses,
  BL-022 approval PATCH fix; draft specs grn/approval/purchase-requisition; new items BL-025..BL-037
- 2026-09-27 — PR #5 merged: known-defects spec draft (BL-001/004/005), BL-024 privilege escalation logged
- 2026-09-27 — PR #2 merged: test independence enforced in the agent pipeline
- 2026-09-27 — PR #1 merged: workflow setup + CI green (approval subDocType, lint, seed)
- 2026-09-27 — spec-first + autonomous pipeline tooling, CI, module maps for 7 existing modules
