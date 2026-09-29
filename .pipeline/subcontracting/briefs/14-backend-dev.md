# Brief 14 — backend-dev — S3 contract step (receipt + QA, interfaces only)
Feature: subcontracting  Branch: claude/subcontracting-feature-b19136  Spec: docs/specs/subcontracting.md (v2, frozen)
BR scope: BR-SCO-12..18, 22, 24, 25
## Task
Contract step for slice S3. Read PROTOCOL, spec, plan, `contract.md` (S1+S2), reports 09 and 11.
1. Schema: extend `subcontracting_grns` (receipt) / `_items`: vendor challan/invoice no. (unique per vendor), per line processed qty, unprocessed qty, accepted/rejected qty, QA decision actor + time, QA state as a real enum/constrained value (not free text); `sco_receipt_settlements` (receipt line ↔ challan line, qty settled); SCO line counters (issued/accepted/rejected/unprocessed) if not already there. Numbering for receipts via existing `sco_grn` sequence.
2. Descriptors + Zod types + controller/service/repository stubs (no logic): create receipt (`sco.issue_receive`), QA decide per line (`sco.qa_decide`), get/list receipts per SCO (`sco.view`), SCO details extended with charge due (Σ accepted × price + GST at line %), qty at vendor per line, settled challans.
3. Append S3 section to `contract.md`; `bun run contract:generate`; `db:test:prepare`.
## Scope (required — every line filled)
- In: S3 schema, descriptors, Zod types, stubs, contract.md, manifest.
- Out: no logic, no tests, no close/loss/reports (S4), no frontend.
- May edit: backend/** except test files, .pipeline/subcontracting/contract.md   May read: anything
- Size: as needed for schema + stubs
- Stop if: ambiguous rule → BLOCKED with question
## Done when
- typecheck, contract:check, existing tests green; contract.md lists every S3 endpoint. Do NOT commit.
Write your report to: .pipeline/subcontracting/reports/14-backend-dev.md
