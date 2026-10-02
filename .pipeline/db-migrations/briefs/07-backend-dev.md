# Brief 07 — backend-dev — SEC-7 query-string overrides
Feature: db-migrations  Branch: work/db-migrations  Spec: docs/specs/db-migrations.md (v1, changelog line "SEC-7")
BR scope: BR-MIG-11, 16, 17
## Task
Finding SEC-7 (.pipeline/db-migrations/reports/09-security-auditor.md): postgres.js applies `?database=` (and other startup keys) from the URL query at connect time, so the guard's path-based check can be bypassed (verified: a URL with path `diecast_mig_test` and `?database=diecast_kd_test` connects to the second). Make `db:migrate` and `db:test:prepare` refuse, exit 2 before connecting, any URL whose query string carries a connection override. Safest rule: refuse ANY query parameter (the repo's URLs use none), including percent-encoded key names and mixed keys. Fix in the shared parse/guard in backend/scripts/lib/migrate.ts (assertDriverMatches or parseTarget).
## Scope
- In: the shared guard + the two scripts only
- Out: tests (never edit), specs, db-reset.ts (fixed on another branch), `.claude/**`
- May edit: backend/scripts/**   May read: anything
- Size: ≤ 3 files, ≤ 40 changed lines
- Stop if: anything outside scope → BLOCKED with the question
## Done when
- `cd backend && bun test tests/scripts/db-migrations.test.ts` green except the .claude db:push scan (red by design); typecheck + lint clean
Write your report to: .pipeline/db-migrations/reports/11-backend-dev.md
