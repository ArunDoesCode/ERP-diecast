# Project status — pick up here

> Single entry point for "where are we and what's next". Updated by `/feature` (at phase changes and in
> every PR), `/watch-prs` (merges), `/status` (on demand) and `/wrap`. Humans: read this, then run `/status`.

**Updated:** 2026-09-27 · **Milestone:** M0 workflow infra → M1 procurement hardening
**Next action:** merge the BL-006 PR (separate test DB); known-defects (BL-001, BL-004, BL-005) is in
progress in another session → `/freeze` → `/feature known-defects`. Remaining M0 infra: BL-007..BL-010. Then `/spec grn` — it must decide BL-014 (item stock/avg cost never
updated from the ledger), the most serious defect found so far.

## Modules
| Module | Spec | Map | Code | Tests | Open PR | Next step |
|---|---|---|---|---|---|---|
| auth-setup | none | [map](modules/auth-setup.md) | full | route-registry only | — | spec in M1 |
| approval | none | [map](modules/approval.md) | full | approvalRepository.test | — | spec in M1 |
| purchase-requisition | none | [map](modules/purchase-requisition.md) | full (delete bug BL-001) | none | — | `/spec purchase-requisition` |
| purchase-order | none | [map](modules/purchase-order.md) | full | none | — | spec in M1 |
| grn | none | [map](modules/grn.md) | full | none | — | `/spec grn` (pilot) |
| inventory | none | [map](modules/inventory.md) | full (stock/avg cost stale BL-014) | none | — | spec with GRN |
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
- [ ] Merge the BL-006 PR — separate test DB; after merge: `docker compose up -d`, add `DATABASE_URL_TEST`
  to `backend/.env` (see `.env.example`), `bun run db:test:prepare`
- [ ] BL-012 blocked: branch protection needs GitHub Pro or a public repo (API 403) — decide: upgrade / keep private + discipline
- [ ] Maps `approval` and `grn` are 1 commit behind (`5681c94` CI fix) — `/map --stale` when convenient

## Recently done
- 2026-09-27 — BL-006: tests run only against `diecast_test` (compose service `postgres-test`, `bun test` preload guard)
- 2026-09-27 — PR #2 merged: test independence enforced in the agent pipeline
- 2026-09-27 — PR #1 merged: workflow setup + CI green (approval subDocType, lint, seed)
- 2026-09-27 — spec-first + autonomous pipeline tooling, CI, module maps for 7 existing modules
