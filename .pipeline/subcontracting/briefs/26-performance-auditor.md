# Brief 26 — performance-auditor — performance audit of subcontracting feature
Feature: subcontracting  Branch: claude/subcontracting-feature-b19136  Spec: docs/specs/subcontracting.md (v2, frozen; read its changelog for build clarifications)
BR scope: BR-SCO-01..25
## Task
Review the whole feature diff vs base: `git diff main...HEAD` (backend + frontend, ignore .pipeline/ and docs/). N+1 queries, missing indexes, unbounded lists (pagination), transaction scope and locking, ledger posting loops, frontend refetching.
Findings format per PROTOCOL.md (id prefix PERF-). One line each: where · what · fix. Severity blocker/major/minor.
## Scope (required — every line filled)
- In: read-only review of the diff above.
- Out: no edits to any file except your report; no fixes.
- May edit: .pipeline/subcontracting/reports/26-performance-auditor.md   May read: anything
- Size: report ≤ 150 lines
- Stop if: needs a business decision → QUESTIONS
## Inputs
- docs/specs/subcontracting.md, .pipeline/subcontracting/contract.md, plan.md, findings.md (skip already-fixed ids)
## Done when
- Every finding has file:line and a suggested fix.
Write your report to: .pipeline/subcontracting/reports/26-performance-auditor.md
