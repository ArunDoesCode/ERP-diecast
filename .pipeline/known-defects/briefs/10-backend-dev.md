# Brief 10 — backend-dev — SEC-7 query-string overrides in the db:reset guard
Feature: known-defects  Branch: work/known-defects  Spec: docs/specs/known-defects.md (v5, changelog line "SEC-7")
BR scope: BR-KD-53 (also 30, 52)
## Task
Finding SEC-7: postgres.js applies `?database=` and other startup keys from the URL query at connect time (verified), so the guard's path-based check can be bypassed. Make `db:reset` and `db:test:prepare` refuse, exit 2 before connecting, any URL carrying a query string (the repo's URLs use none). Fix in the guard in backend/scripts/db-reset.ts (the one place both scripts use).
## Scope
- In: the guard only
- Out: tests (never edit), specs, docs, `.claude/**`
- May edit: backend/scripts/db-reset.ts, backend/scripts/prepare-test-db.ts   May read: anything
- Size: ≤ 2 files, ≤ 20 changed lines
- Stop if: anything outside scope → BLOCKED with the question
## Done when
- `cd backend && bun test tests/scripts/` green; typecheck + lint clean
Write your report to: .pipeline/known-defects/reports/10-backend-dev.md
