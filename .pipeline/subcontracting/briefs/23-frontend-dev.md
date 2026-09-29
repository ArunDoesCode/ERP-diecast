# Brief 23 — frontend-dev — S4 screens (close, loss, reports)
Feature: subcontracting  Branch: claude/subcontracting-feature-b19136  Spec: docs/specs/subcontracting.md (v2, frozen)
BR scope: BR-SCO-19, 22
## Task
Against `.pipeline/subcontracting/contract.md` (S4 section) and the manifest, extending S1–S3 screens:
- SCO detail: "Close" dialog — shows qty left at vendor; if >0 needs reason (3–500 chars) and is shown only to holders of `sco.loss_override` (others see a note that owner must close); 403/400/409 messages shown ("decide QA first").
- Reports under Subcontracting: open challans (exists — link it), stock at each vendor, SCO register (status/vendor/created-date filters, paginated), loss log. Follow the data-table skill.
- Gate: `sco.close`, `sco.loss_override`, `sco.view`.
Report heading `## Screens touched` (URL, role, purpose).
## Scope (required — every line filled)
- In: S4 frontend only.
- Out: no backend, no tests.
- May edit: frontend/** except tests   May read: contract + manifest
- Size: reuse existing components
- Stop if: contract lacks a field → BLOCKED naming it
## Done when
- `cd frontend && bunx tsc --noEmit && bun run lint` pass. Do NOT commit.
Write your report to: .pipeline/subcontracting/reports/23-frontend-dev.md
