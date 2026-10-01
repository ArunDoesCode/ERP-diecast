# Brief 02 — backend-dev — IST day for SCO dates
Feature: sco-ist-date  Branch: work/sco-ist-date  Spec: docs/specs/subcontracting.md (v4, frozen)
BR scope: BR-SCO-01, 03, 09, 11
## Task
Make every SCO "today", challan-date check, expected-return-date check, days-left/due-status and number period use the plant calendar day in IST (Asia/Kolkata) — built-in Intl only, no new dependency. Put the helper in one shared place (e.g. backend/src/lib) and reuse it. A full-timestamp input counts as the IST day it falls in. Known UTC spots: scoChallanService.ts todayKey / assertChallanDateNotFuture (~28-54), the expected-return check in scoService, the days-left/dueStatus calc, the SCO number period.
## Scope
- In: the four spots above + the helper
- Out: tests (never edit), specs, docs, frontend, a receipt future-date check (not in spec)
- May edit: backend/src/service/sco*.ts, backend/src/lib/** (new helper)   May read: anything
- Size: ≤ 5 files, ≤ 120 changed lines
- Stop if: anything outside scope → BLOCKED with the question
## Inputs
- Tests: backend/tests/routes/scoIstDay.test.ts (red); report .pipeline/sco-ist-date/reports/01-test-writer.md
- Worktree backend/.env points at test DB diecast_sco_test (port 5433)
## Done when
- `cd backend && bun test tests/routes/scoIstDay.test.ts` green and no other SCO test newly red; typecheck + lint clean
Write your report to: .pipeline/sco-ist-date/reports/02-backend-dev.md
