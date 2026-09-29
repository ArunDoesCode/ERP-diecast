# Brief 19 — backend-dev — S4 contract step (close, loss, reports; interfaces only)
Feature: subcontracting  Branch: claude/subcontracting-feature-b19136  Spec: docs/specs/subcontracting.md (v2, frozen)
BR scope: BR-SCO-19, 22, 23, 24, 25 + reports (open challans with days left, stock at each vendor, SCO register, loss log)
## Task
Contract step for slice S4. Read PROTOCOL, spec, plan, `contract.md` (S1–S3), reports 14 and 16.
1. Schema only if needed: close fields on SCO header (who/when/reason, loss qty) may already exist from S1 — reuse; loss log needs a queryable record (ledger `sco_loss` rows + SCO close reason) — add a small table only if a query over ledger + SCO is not enough.
2. Descriptors + Zod types + controller/service/repository stubs (no logic): close SCO (`sco.close`; reason 3–500 chars needed when qty is left at the vendor, which also needs `sco.loss_override`), reports: open challans (exists from S2 — reuse or extend), stock at each vendor (per vendor, per item, qty, value at issue cost), SCO register (filters status/vendor/date, paginated per the pagination-contract skill), loss log (SCO, item, qty, cost, reason, who, when). All reads `sco.view`.
3. Append S4 section to `contract.md`; `bun run contract:generate`.
## Scope (required — every line filled)
- In: S4 descriptors, Zod types, stubs, contract.md, manifest.
- Out: no logic, no tests, no frontend.
- May edit: backend/** except test files, .pipeline/subcontracting/contract.md   May read: anything
- Size: as needed for stubs
- Stop if: ambiguous rule → BLOCKED with question
## Done when
- typecheck, contract:check, existing tests green; contract.md lists every S4 endpoint. Do NOT commit.
Write your report to: .pipeline/subcontracting/reports/19-backend-dev.md
