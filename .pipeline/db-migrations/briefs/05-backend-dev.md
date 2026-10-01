# Brief 05 — backend-dev — fix security/code-review findings
Feature: db-migrations  Branch: work/db-migrations  Spec: docs/specs/db-migrations.md (v1, frozen; read the changelog line "security review")
BR scope: BR-MIG-11, 16, 17, 21
## Task
Fix, in this order: SEC-1 (backup dir 0700, dump file 0600; set before/around pg_dump so the file is never world-readable), SEC-6 (dump file name from a safe form of the db name; the file must stay inside backups/), SEC-2/SEC-4 (db:migrate AND db:test:prepare judge the host/port/db the driver will really use — check the built client's resolved options against the parsed target; encoded host and several hosts refused; refusals of the target in BOTH scripts exit 2 before connecting), CR-4 (db:test:prepare rebuilds only on a journal mismatch), CR-2/BR-MIG-21 (db:migrate refuses any DB that has user tables in `public` but no migration journal, with the message "built by push? use db:reset"; exit non-zero before changing anything). Findings detail: .pipeline/db-migrations/reports/04-code-reviewer.md and 05-security-auditor.md.
Docs: replace the stale `db:push` instructions with the migration commands in docs/diecastos-dev-handbook.html (command table + glossary + "Migrations vs push" paragraph) and docs/modules/{subcontracting,auth-setup,grn,suppliers}.md; one line each.
## Scope
- In: the findings above + those doc lines
- Out: tests (never edit), specs, `.claude/**`, db-reset.ts guard (fixed on another branch), frontend
- May edit: backend/scripts/**, docs/diecastos-dev-handbook.html, docs/modules/*.md   May read: anything
- Size: ≤ 6 files, ≤ 200 changed lines
- Stop if: anything outside scope → BLOCKED with the question
## Inputs
- Tests: backend/tests/scripts/db-migrations.test.ts (7 red: SEC-1 ×2, SEC-6, SEC-2/4 encoded host in prepare, CR-2 ×2, plus the .claude db:push scan that stays red by design). Some prepare-refusal tests may currently assert only non-zero; make them exit 2 anyway.
- Only scratch *_test DBs on port 5433; no pg_dump on this host (tests use a fake).
## Done when
- `cd backend && bun test tests/scripts/` green except the .claude scan test; full `bun test` no new failures; typecheck + lint clean
Write your report to: .pipeline/db-migrations/reports/08-backend-dev.md
