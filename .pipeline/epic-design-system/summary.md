# Run epic-design-system

| | |
|---|---|
| Module / spec | design-system · `docs/specs/design-system/spec.md` v1 |
| Mode / branch / base | epic · `epic/design-system` → `main` |
| Dates | started 2026-11-18T15:17Z · hand-over 2026-11-18 |
| PR | epic PR into main; sub-PRs #101, #102, #103 (merged into the epic) |

## Gates at hand-over
typecheck, lint, tests (backend 1661, frontend 291), contract, standards (report mode, raw-palette 47 from 62), contrast, build: green at 195a914. Reviews code, security, performance, spec: green. Design / screenshots skipped (design-reviewer not active yet). Local e2e skipped in the final round (test-DB reset not permitted); CI e2e runs on the epic PR.

## Sub-features
| Sub-feature | BR ids | Result |
|---|---|---|
| foundation | BR-DS-01..05, 09..11, 13, 15, 20, 24 | built · #101 |
| shell | BR-DS-06, 16, 21, 22, 26 | built · #102 |
| po-adoption | BR-DS-07, 08, 12, 14, 17, 18, 19, 25, 27 | built · #103 |

## Assumptions made (`docs/specs/design-system/assumptions.md`)
A-46 … A-57 — 0 to confirm, 12 info. Decision D-024 (e2e locally before push; CI e2e only on PRs into main).

## Findings
Majors fixed: count-up stuck under StrictMode, fold button on narrow screens, missing document-number breadcrumb, Pagination hiding its size select, PO list build (Suspense), reduced motion and focus-ring colour (found by CI e2e), density only on DataTable, raw-palette line badge. Backlog: #104–#107. Rejected with reason: 5.

## Lessons (also in the module map)
- E2E tests were written without ever running; ~10 CI round trips fixed test bugs one at a time → D-024: run e2e locally before push.
- Login rate limiter: e2e must reuse one saved session.
- Measure rows after loading ends; find nav items by href, not server label.
- Stacked sub-feature branches work with merge-commit PRs, but each stacked fix needs a forward merge; a sub-PR can be red only because a later sub-feature builds the page its test uses.
- A coordinator in one worktree cannot edit another worktree; switching the session's worktree locks running subagents out — switch only when no agent runs.
