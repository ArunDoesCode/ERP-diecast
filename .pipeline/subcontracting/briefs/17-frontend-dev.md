# Brief 17 — frontend-dev — S3 screens (receipt + QA)
Feature: subcontracting  Branch: claude/subcontracting-feature-b19136  Spec: docs/specs/subcontracting.md (v2, frozen)
BR scope: BR-SCO-12, 13, 16, 17, 18, 22
## Task
Against `.pipeline/subcontracting/contract.md` (S3 section) and the manifest, extending the S1–S2 screens:
- On SCO detail (material_issued): "Enter receipt" form — vendor challan/invoice no., per line processed qty and unprocessed qty (max = still at vendor shown), show 400/409 messages.
- Receipts list per SCO; QA decision dialog per processed line (accepted + rejected must equal processed); settlement view (which challans/qty each receipt settled); qty at vendor per line; charge due panel (Σ accepted × price + GST); status `material_received` badge.
- Gate: `sco.issue_receive` (receipt), `sco.qa_decide` (QA), `sco.view` (reads).
Report heading `## Screens touched` (URL, role, purpose).
## Scope (required — every line filled)
- In: S3 frontend only.
- Out: no backend, no tests, no close/loss/report screens.
- May edit: frontend/** except tests   May read: contract + manifest
- Size: reuse S1–S2 components
- Stop if: contract lacks a field → BLOCKED naming it
## Done when
- `cd frontend && bunx tsc --noEmit && bun run lint` pass. Do NOT commit.
Write your report to: .pipeline/subcontracting/reports/17-frontend-dev.md
