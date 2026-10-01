# Brief 03 — frontend-dev — IST day in SCO date pickers
Feature: sco-ist-date  Branch: work/sco-ist-date  Spec: docs/specs/subcontracting.md (v4, frozen)
BR scope: BR-SCO-03, BR-SCO-09 (frontend side)
## Task
Every SCO date picker uses the plant's IST day, whatever the browser zone: challan date default + max (IssueMaterialDialog.tsx todayIso), expected-return min, and the receipt dialog's todayIso (EnterReceiptDialog.tsx). Use `Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata"})`, one shared helper in frontend/src/lib. Send the challan date as a plain IST date (`${d}T00:00:00+05:30`), not a local-midnight conversion. No new future-date rule for the receipt date.
## Scope
- In: SCO date pickers and the helper
- Out: tests, specs, backend, other modules' dialogs
- May edit: frontend/src/components/pages/subcontracting/**, frontend/src/lib/**   May read: anything
- Size: ≤ 4 files, ≤ 60 changed lines
- Stop if: anything outside scope → BLOCKED with the question
## Done when
- `cd frontend && bunx tsc --noEmit && bun run lint` clean
Write your report to: .pipeline/sco-ist-date/reports/03-frontend-dev.md
