# Brief 27 — code-reviewer / security-auditor / performance-auditor / spec-reviewer — review inventory
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/inventory.md (v1, frozen) (+ grn-stock.md v1 for manual movements)
BR scope: BR-INV-01..25 (+ BR-GRN-32..44 manual-movement paths touched)
## Task
Review the inventory diff `67c0ba6..HEAD` (excluding `.pipeline/**`). Your own lens only. spec-reviewer also
checks frontend calls vs `.pipeline/m1-stock/contract.md` (Inventory section) and that each BR-INV id has a
named test. Findings in PROTOCOL.md table format with your prefix, numbering from 20 (e.g. CR-20) so ids
don't clash with the GRN round.
Known and accepted — don't re-report: `requireRole` + `// perm:` guards (ENV.md); lint warnings in test files;
small PR/supplier edits marked "take work/m1 version on merge"; rows in findings.md marked backlog/reject;
answers in questions.md.
If you have no write tool, return the report inline and the coordinator saves it.
## Scope (required — every line filled)
- In: review of the diff above
- Out: any edit other than your report
- May edit: only your report file        May read: anything
- Size: report ≤ 100 lines
- Stop if: n/a
## Inputs
- .pipeline/m1-stock/{plan.md (part 2),contract.md,ENV.md,findings.md,questions.md}, reports/20..26-*.md
## Done when
- Every finding has severity, file:line, fix
Write your report to: .pipeline/m1-stock/reports/27-<your-agent-name>.md
