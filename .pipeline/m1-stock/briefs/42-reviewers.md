# Brief 42 — code-reviewer + spec-reviewer — suppliers fix re-review
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/suppliers.md (v1, frozen)
BR scope: BR-SUP-01..24
## Task
- code-reviewer: review the fix diff `96f12a7..HEAD` (excluding `.pipeline/**`): confirm PERF-40, SEC-40, SEC-41,
  CR-40, CR-41, CR-42, SPEC-43 are fixed; report anything new the fixes introduced (incl. security/perf).
- spec-reviewer: suppliers diff `a84409c..HEAD`; confirm nothing the fixes changed breaks a BR-SUP rule.
Known and accepted — don't re-report: findings.md rows marked backlog/reject; questions.md; ENV.md guards.
If you have no write tool, return the report inline.
## Scope (required — every line filled)
- In: review of the diffs above
- Out: any edit other than your report
- May edit: only your report file        May read: anything
- Size: report ≤ 40 lines
- Stop if: n/a
## Inputs
- .pipeline/m1-stock/findings.md, reports/39-*.md, reports/40-backend-dev.md, reports/41-frontend-dev.md
## Done when
- Each listed finding fixed / not fixed; new findings with severity, file:line, fix
Write your report to: .pipeline/m1-stock/reports/42-<your-agent-name>.md
