# Brief 07 — frontend-dev — show SCO dates in the IST day (CR-1)
Feature: sco-ist-date  Branch: work/sco-ist-date  Spec: docs/specs/subcontracting.md (v4, frozen)
BR scope: dates note (v4), BR-SCO-09
## Task
Finding CR-1 (.pipeline/sco-ist-date/reports/04-code-reviewer.md): `formatScoDate` in frontend/src/lib/sco-format.ts (~line 59) formats in the browser zone, so a challan date shows a day early in a non-IST browser or on a UTC server render. Format it in Asia/Kolkata (reuse frontend/src/lib/ist-date.ts if it fits). Same check for any other SCO date display helper in that file.
## Scope
- In: SCO date display formatting only
- Out: tests, specs, backend, anything else
- May edit: frontend/src/lib/sco-format.ts, frontend/src/lib/ist-date.ts   May read: anything
- Size: ≤ 2 files, ≤ 20 changed lines
- Stop if: anything outside scope → BLOCKED with the question
## Done when
- `cd frontend && bunx tsc --noEmit && bun run lint` clean
Write your report to: .pipeline/sco-ist-date/reports/07-frontend-dev.md
