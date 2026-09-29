# Brief 12 — frontend-dev — S2 screens (challan)
Feature: subcontracting  Branch: claude/subcontracting-feature-b19136  Spec: docs/specs/subcontracting.md (v2, frozen)
BR scope: BR-SCO-07, 09, 10, 11
## Task
Against `.pipeline/subcontracting/contract.md` (S2 section) and the manifest, extending the S1 subcontracting screens:
- On SCO detail (approved / material_issued): "Issue material" challan form — per line qty (max = send − issued shown), e-way bill number (show when required per rule), date, heat number; show 400/409 messages.
- Challan list per SCO, challan detail + printable challan (Rule 55 fields, "sent for job work u/s 143, no tax charged"); open-challans page with days left, ≤60 warning, overdue "deemed supply, tell accounts" badge.
- Gate on `sco.issue_receive` (create) / `sco.view` (read).
Report heading `## Screens touched` (URL, role, purpose).
## Scope (required — every line filled)
- In: S2 frontend only.
- Out: no backend, no tests, no receipt/QA/close screens.
- May edit: frontend/** except tests   May read: contract + manifest (not backend source for shapes)
- Size: reuse S1 components
- Stop if: contract lacks a field → BLOCKED naming it
## Done when
- `cd frontend && bunx tsc --noEmit && bun run lint` pass. Do NOT commit.
Write your report to: .pipeline/subcontracting/reports/12-frontend-dev.md
