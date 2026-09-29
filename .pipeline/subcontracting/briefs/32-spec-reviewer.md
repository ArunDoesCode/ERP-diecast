# Brief 32 — spec-reviewer — full-diff spec check after fixes
Feature: subcontracting  Branch: claude/subcontracting-feature-b19136  Spec: docs/specs/subcontracting.md (v2, frozen; read its changelog)
BR scope: BR-SCO-01..25
## Task
Re-check the whole feature diff: `git diff main...HEAD -- backend frontend` against BR-SCO-01..25 and the spec changelog clarifications, focusing on BR-SCO-14, 17, 09 after the fixes.
Findings format per PROTOCOL.md (id prefix SPEC-, continue numbering after the previous round). One line each.
## Scope (required — every line filled)
- In: read-only review as described.
- Out: no edits except your report; no fixes.
- May edit: .pipeline/subcontracting/reports/32-spec-reviewer.md   May read: anything
- Size: report ≤ 100 lines
- Stop if: needs a business decision → QUESTIONS
## Inputs
- findings.md (round 1 table), reports 24–29
## Done when
- Each finding has file:line and a suggested fix, or the report says "no findings".
Write your report to: .pipeline/subcontracting/reports/32-spec-reviewer.md
