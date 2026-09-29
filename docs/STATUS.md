# Project status — pick up here

> Single entry point for "where are we and what's next". Updated by `/feature` (at phase changes and in
> every PR), `/watch-prs` (merges), `/status` (on demand) and `/wrap`. Humans: read this, then run `/status`.

**Updated:** 2026-09-29 · **Milestone:** M2 Subcontracting merged (PR #14) → next: UAT-1 at the factory
**Next action:** dev DB setup (below), fill Company details + item HSN, then run subcontracting through the manual checklist at the factory (UAT-1). After UAT-1: M3 BOM spec (`/spec bom`).

## Modules
| Module | Spec | Map | Code | Next step |
|---|---|---|---|---|
| auth-setup | frozen v10 | [map](modules/auth-setup.md) | full — permission layer S1–S7 built on work/m1 | merged (PR #13) |
| known-defects | frozen v4 | (PR / auth maps) | full — BL-001/004/005 fixed (`bootstrap-admin`, `db:reset`) | merged (PR #13) |
| purchase-requisition | frozen v2 | [map](modules/purchase-requisition.md) | full — built on work/m1 | merged (PR #13) |
| approval + approval-policies | frozen v2 / v1 | [map](modules/approval.md) | full — built on work/m1 (SCO plumbing only) | merged (PR #13) |
| purchase-order | frozen v2 | [map](modules/purchase-order.md) | full — built on work/m1 | merged (PR #13) |
| grn + grn-stock | frozen v1 / v1 | [map](modules/grn.md) | full — built on work/m1-stock, merged da516f2 | merged (PR #13) |
| inventory | frozen v1 | [map](modules/inventory.md) | full — merged da516f2 | merged (PR #13) |
| suppliers | frozen v1 | [map](modules/suppliers.md) | full — merged da516f2 | merged (PR #13) |
| subcontracting | frozen v3 | [map](modules/subcontracting.md) | full — merged (PR #14) | UAT-1 at factory |
| bom | none | — | none | M3 (after UAT-1 starts) |
| sale-order | none | — | none | M4 |

Legend — Code: none / schema only / partial / full. Tests per module: see each map's **Tests** table.

## Active pipelines
| Feature | Branch | Phase | PR | Waiting on |
|---|---|---|---|---|
| — | — | none active | — | — |

## Waiting on you
- [ ] Dev DB after the merges: `drop table subcontracting_grn_items, subcontracting_grns cascade` (old empty tables), drop `pages` and `role_pages` if still there, then `bun run db:push`.
- [ ] Owner: fill **Company details** (plant name, address, GSTIN, state) and give each raw item an HSN code — a challan is refused (400) without them.
- [ ] Run the subcontracting manual UI checklist (PR #14 body) before UAT-1.
- [ ] Open issues: <https://github.com/ArunDoesCode/ERP-diecast/issues> (P1: `gh issue list --label P1`). BL-079 challan date timezone is one of them.
- [ ] BL-011 migrations before UAT-1 (also drops `pages`/`role_pages`, BL-056).

## Recently done
- 2026-09-29 — PR #14 merged: subcontracting (SCO, challan, receipt + QA, close, loss, reports; spec v3). Backend 1346 tests. Decisions D-017, D-018; backlog BL-072..079
- 2026-09-29 — PR #13 merged: work/m1 → main (M1 done)
- 2026-09-29 — work/m1 (not yet merged): permission layer S1–S7 (role lists and `role_pages` gone,
  `isSuperAdmin` on `/auth/me`), bootstrap-admin + db:reset, PR / approval / PO built to frozen specs,
  work/m1-stock merged (grn, inventory, suppliers), review findings fixed (incl. BL-069 owner stock-take locations); backlog BL-056..070 added,
  10 old items closed; decisions D-012..D-016
- 2026-09-29 — PR #11 merged: dev handbook · PR #10 merged: Scope block in subagent briefs
- 2026-09-29 — PR #9 merged: draft specs rewritten in slim format
- 2026-09-27 — PRs #1–#8 merged: workflow setup, CI, test DB (BL-006), createApp, contract manifest, hooks,
  spec-first pipeline tooling, module maps
