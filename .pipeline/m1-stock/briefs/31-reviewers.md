# Brief 31 — reviewers (inventory iteration 1 re-review)
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/inventory.md (v1, frozen)
BR scope: BR-INV-01..25
## Task
- code-reviewer, security-auditor, performance-auditor: review only the fix diff `67796f9..HEAD` (excluding
  `.pipeline/**`). Confirm each of your inventory-round findings (ids ≥ 20) in findings.md is fixed or has a
  recorded reject/backlog reason; report anything new the fixes introduced.
- spec-reviewer: inventory diff `67c0ba6..HEAD` again; confirm SPEC-20..25 are fixed or carry a recorded reason.
Known and accepted — don't re-report: `requireRole` + `// perm:` guards; lint warnings in test files; rows in
findings.md marked backlog/reject; answers in questions.md.
If you have no write tool, return the report inline.
## Scope (required — every line filled)
- In: review of the diff above
- Out: any edit other than your report
- May edit: only your report file        May read: anything
- Size: report ≤ 50 lines
- Stop if: n/a
## Inputs
- .pipeline/m1-stock/findings.md, questions.md, reports/27-*.md, reports/29-frontend-dev.md, reports/30-backend-dev.md
## Done when
- Each prior finding of yours: fixed / not fixed; new findings with severity, file:line, fix
Write your report to: .pipeline/m1-stock/reports/31-<your-agent-name>.md
