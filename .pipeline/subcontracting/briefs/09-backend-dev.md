# Brief 09 — backend-dev — S2 contract step (challan, interfaces only)
Feature: subcontracting  Branch: claude/subcontracting-feature-b19136  Spec: docs/specs/subcontracting.md (v2, frozen)
BR scope: BR-SCO-07..11, 24, 25
## Task
Contract step for slice S2 (challan = issue material). Read PROTOCOL, spec, `.pipeline/subcontracting/plan.md`, `contract.md` (S1 part), reports 03/05.
1. Schema: `sco_challans` (number `JWC/<FY>/<seq>`, scoId, vendorId, date, e-way bill no., value at issue cost, return due date = date + 1 year, createdBy) and `sco_challan_lines` (challan, sco line, qty, unit issue cost, heat number, HSN, settled qty). Plus the receipt↔challan settlement table needed later (S3) only if trivial to add now; else skip. Vendor location: reuse `locations` with `linkedVendorId`; make first-use creation race-safe (unique per vendor).
2. FY sequence: new numbering path for `JWC/<FY>/<seq>` (FY Apr–Mar, e.g. `27-28`; consecutive per FY, ≤16 chars, never reused). Signature/stub only.
3. Descriptors + Zod types + controller/service/repository stubs (no logic): create challan on an SCO, list challans per SCO / open challans with days left, challan details (print data incl. Rule 55 fields from company settings + vendor + item HSN), permission `sco.issue_receive` for create, `sco.view` for reads.
4. Update `contract.md` (append S2 section), `bun run contract:generate`, run `db:test:prepare`.
## Scope (required — every line filled)
- In: S2 schema, descriptors, Zod types, stubs, contract.md, manifest.
- Out: no logic, no tests, no receipts/QA/close (S3–S4), no frontend.
- May edit: backend/** except test files, .pipeline/subcontracting/contract.md   May read: anything
- Size: as needed for schema + stubs
- Stop if: ambiguous rule → BLOCKED with question
## Done when
- typecheck, contract:check, existing tests green; contract.md lists every S2 endpoint. Do NOT commit.
Write your report to: .pipeline/subcontracting/reports/09-backend-dev.md
