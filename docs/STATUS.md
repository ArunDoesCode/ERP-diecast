# Project status — pick up here

> Single entry point for "where are we and what's next". Updated by `/feature` (at phase changes and in
> every PR), `/watch-prs` (merges), `/status` (on demand) and `/wrap`. Humans: read this, then run `/status`.

**Updated:** 2026-09-29 · **Milestone:** M2 Subcontracting — `/feature subcontracting` running (BL-070)
**Next action:** wait for the subcontracting PR, then review + merge it.

## Modules
| Module | Spec | Map | Code | Next step |
|---|---|---|---|---|
| auth-setup | frozen v10 | [map](modules/auth-setup.md) | full — permission layer S1–S7 built on work/m1 | merge m1 PR |
| known-defects | frozen v4 | (PR / auth maps) | full — BL-001/004/005 fixed (`bootstrap-admin`, `db:reset`) | merge m1 PR |
| purchase-requisition | frozen v2 | [map](modules/purchase-requisition.md) | full — built on work/m1 | merge m1 PR |
| approval + approval-policies | frozen v2 / v1 | [map](modules/approval.md) | full — built on work/m1 (SCO plumbing only) | merge m1 PR |
| purchase-order | frozen v2 | [map](modules/purchase-order.md) | full — built on work/m1 | merge m1 PR |
| grn + grn-stock | frozen v1 / v1 | [map](modules/grn.md) | full — built on work/m1-stock, merged da516f2 | merge m1 PR |
| inventory | frozen v1 | [map](modules/inventory.md) | full — merged da516f2 | merge m1 PR |
| suppliers | frozen v1 | [map](modules/suppliers.md) | full — merged da516f2 | merge m1 PR |
| subcontracting | frozen v1 | [map](modules/subcontracting.md) | schema only — **not built** | `/feature subcontracting` (next batch, BL-070) |
| bom | none | — | none | M3 (after UAT-1 starts) |
| sale-order | none | — | none | M4 |

Legend — Code: none / schema only / partial / full. Tests per module: see each map's **Tests** table.

## Active pipelines
| Feature | Branch | Phase | PR | Waiting on |
|---|---|---|---|---|
| subcontracting | claude/subcontracting-feature-b19136 | verify (iteration 0) | — | — |

## Waiting on you
- [ ] Review + merge the m1 PR. Run the manual UI checklist in it (includes SPEC-P3: approval
  policy form BR-APR-57..60, UI half of BR-PR-39, BR-KD-16 — no automated test).
- [ ] Old local test DB: drop `pages` and `role_pages` (or recreate the DB) before `bun run db:test:prepare`.
  Dev DB needs `db:push` after the merge.
- [ ] BL-012 blocked: branch protection needs GitHub Pro or a public repo — decide: upgrade / keep private.
- [ ] BL-011 migrations before UAT-1 (also drops `pages`/`role_pages`, BL-056).

## Recently done
- 2026-09-29 — PR #13 merged: work/m1 → main (M1 done)
- 2026-09-29 — work/m1 (not yet merged): permission layer S1–S7 (role lists and `role_pages` gone,
  `isSuperAdmin` on `/auth/me`), bootstrap-admin + db:reset, PR / approval / PO built to frozen specs,
  work/m1-stock merged (grn, inventory, suppliers), review findings fixed (incl. BL-069 owner stock-take locations); backlog BL-056..070 added,
  10 old items closed; decisions D-012..D-016
- 2026-09-29 — PR #11 merged: dev handbook · PR #10 merged: Scope block in subagent briefs
- 2026-09-29 — PR #9 merged: draft specs rewritten in slim format
- 2026-09-27 — PRs #1–#8 merged: workflow setup, CI, test DB (BL-006), createApp, contract manifest, hooks,
  spec-first pipeline tooling, module maps
