# Brief 11 — code-reviewer / security-auditor / performance-auditor / spec-reviewer — review grn + grn-stock
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/grn.md (v1, frozen), docs/specs/grn-stock.md (v1, frozen)
BR scope: every BR-GRN-* in both specs
## Task
Review the whole feature diff: `a6ca63e..HEAD` (excluding `.pipeline/**`). Your own lens only (your agent
definition). spec-reviewer also checks frontend calls vs `.pipeline/m1-stock/contract.md` and that each BR has
a named test. Findings in the PROTOCOL.md table format with your id prefix.
Known and accepted — don't re-report: route guards use `requireRole` + `// perm:` comments on purpose (ENV.md);
lint warnings baseline 121 (test-file non-null assertions); findings already in findings.md.
## Scope (required — every line filled)
- In: review of the diff above
- Out: any edit other than your report
- May edit: only your report file        May read: anything
- Size: report ≤ 120 lines
- Stop if: n/a
## Inputs
- .pipeline/m1-stock/{plan.md,contract.md,ENV.md,findings.md}, reports/06..10-backend-dev.md, reports/05-frontend-dev.md
## Done when
- Every finding has severity, file:line, fix
Write your report to: .pipeline/m1-stock/reports/11-<your-agent-name>.md
