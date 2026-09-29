# Brief 39 — code-reviewer / security-auditor / performance-auditor / spec-reviewer — review suppliers
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/suppliers.md (v1, frozen)
BR scope: BR-SUP-01..24 (BR-SUP-25 comes from the auth layer on work/m1 — not on this branch)
## Task
Review the suppliers diff `a84409c..HEAD` (excluding `.pipeline/**`). Your own lens only. spec-reviewer also
checks frontend calls vs `.pipeline/m1-stock/contract.md` (Suppliers section) and that each BR-SUP id has a named
test. Findings in PROTOCOL.md table format with your prefix, numbering from 40 (e.g. CR-40).
Backend-dev notes to check: (a) changing GSTIN without PAN → 400 if the stored PAN no longer matches;
(b) last rate skips inactive price-list rows but not inactive suppliers.
Known and accepted — don't re-report: `requireRole` + `// perm:` guards and role helpers (ENV.md); lint warnings
in test files; PO-side parts (plan.md part 3 "Decisions"); rows in findings.md marked backlog/reject; questions.md.
If you have no write tool, return the report inline.
## Scope (required — every line filled)
- In: review of the diff above
- Out: any edit other than your report
- May edit: only your report file        May read: anything
- Size: report ≤ 100 lines
- Stop if: n/a
## Inputs
- .pipeline/m1-stock/{plan.md (part 3),contract.md,ENV.md,findings.md,questions.md}, reports/35..38-*.md
## Done when
- Every finding has severity, file:line, fix
Write your report to: .pipeline/m1-stock/reports/39-<your-agent-name>.md
