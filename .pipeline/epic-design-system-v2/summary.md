# Run epic-design-system-v2

| | |
|---|---|
| Module / spec | design-system · `docs/specs/design-system/spec.md` v2 |
| Mode / branch / base | epic · `epic/design-system-v2` → `main` |
| Dates | started 2026-11-20T16:10Z · hand-over 2026-11-20 |
| PR | epic PR into main (one push at the end — owner: "dont push to git until its al done") |

## Gates at hand-over
typecheck, lint, tests (backend 1773, frontend 371), contract, standards (all rules 0, report mode), contrast, build: green at 90be020. Reviews code, security, performance, spec: green. Local e2e not run (test DB reset denied by permissions); CI runs e2e on the epic PR.

## Sub-features (merged into the epic locally, no sub-PRs)
| Sub-feature | BR ids | Result |
|---|---|---|
| look | BR-DS-02, 06, 07, 16, 20, 26, 28 | built · 3 slices (tokens + shell, controls, 12 px text app-wide in 3 parallel groups) · 2 fix rounds |
| fields | BR-DS-29 | built · 15 forms in 3 parallel groups · 2 fix rounds |

## Assumptions made (`docs/specs/design-system/assumptions.md`)
A-59 … A-67 — A-59 confirmed by the owner ("a"), 8 info.

## Findings
| Class | Found | Fixed | Backlog (issues) | Rejected |
|---|---|---|---|---|
| CR | 6 | 5 | 1 (size check skips size-* in control files) | 0 |
| SPEC | 5 | 3 | 1 (half-transparent invalid ring) | 0 (1 no action) |
| TEST | 1 | 1 | 0 | 0 |

## Lessons (also written to the module map)
- A worktree-isolated session cannot create sibling worktrees: sub-feature branches ran inside the epic worktree.
- Main checkout `backend/.env` has no `DATABASE_URL_TEST`; a git-ignored `.pipeline/test.env` with CI's test values (test DB on 5433 only) made the backend suite runnable.
- Test-runner and design-reviewer `db:reset` on the test DB is denied by permissions, so local e2e cannot run from agents.
- `text-xs` was the real "too small" cause: 224 uses outside badges; the size check made it visible.
