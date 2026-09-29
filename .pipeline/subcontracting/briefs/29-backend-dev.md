# Brief 29 — backend-dev — review round 1 fixes
Feature: subcontracting  Branch: claude/subcontracting-feature-b19136  Spec: docs/specs/subcontracting.md (v2, frozen)
BR scope: BR-SCO-09, BR-SCO-14, BR-SCO-17
## Task
Fix these findings (details in `.pipeline/subcontracting/reports/24-…`, `25-…`, `26-…`, `27-…`; decisions in `findings.md`):
- CR-1 (major): QA issue cost for processed pieces must use only the processed settlement segments, not unprocessed ones (`scoReceiptService.ts` ~431-439). Make `backend/src/routes/scoReceiptCost.test.ts` green. Do not touch tests.
- PERF-1 (major) + PERF-3 + PERF-4: add indexes — partial index on `inventory_ledger` for `reference_type = 'sco_loss'`; `idx_sco_vendor_status (vendor_id, status)`, `idx_sco_created_at`; `idx_sco_challans_vendor (vendor_id)`. Push to test DB (`db:test:prepare`; see ENV.md).
- PERF-5: sort stock postings by item id in receipt/QA/close paths (as the challan path does).
- SEC-2: `q` max 100 chars + escape `%`, `_`, `\` in the ilike patterns.
- SPEC-2: after building `JWC/<FY>/<seq>` assert length ≤ 16, else throw AppError.
- CR-4, CR-5, CR-7, SPEC-5: small cleanups as in the reports (explicit docType→key map in approvalService; rename `items2`; drop no-op round; delete unused `NotImplementedError`).
## Scope (required — every line filled)
- In: the findings listed above only.
- Out: everything else (CR-6, CR-8, SEC-1, SPEC-1/3/4/6, PERF-2/6/7 are backlog); no tests; no frontend; no new features.
- May edit: backend/** except test files   May read: anything
- Size: as needed; focused diffs
- Stop if: a fix needs a business decision or a test contradicts the spec → BLOCKED
## Done when
- scoReceiptCost.test.ts green; full bun test, typecheck, lint 0 errors, contract:check pass. Do NOT commit.
Write your report to: .pipeline/subcontracting/reports/29-backend-dev.md
