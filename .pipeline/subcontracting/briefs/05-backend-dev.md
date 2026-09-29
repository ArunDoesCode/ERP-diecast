# Brief 05 — backend-dev — S1 implement (order + approval)
Feature: subcontracting  Branch: claude/subcontracting-feature-b19136  Spec: docs/specs/subcontracting.md (v2, frozen)
BR scope: BR-SCO-01..06, 20, 21, 23
## Task
Replace the S1 stubs with real logic until `backend/src/routes/sco.test.ts` passes. Do not touch test files.
- Create/update/list/details/submit/cancel per spec; company settings get/patch; item `hsnCode` accepted.
- Add key `company.manage` (owner only) to the permission catalog + seed grants (`backend/src/lib/permissions.ts`); use it for company settings instead of `sco.loss_override`. Add it to the owner seed only.
- Approval SCO branch (`approvalRepository.ts` / `approvalService.ts`): amount = SCO value incl. GST, category `subcontracting`, mirror approval level fields, sent back → `draft` (never `require_more_info`, BR-APR-42), lock + re-check the SCO row on submit (BL-065), cancel closes open request with trail (BR-APR-48).
- Vendor/service/item validation incl. inactive supplier, service list, whole-number pcs, date window, `createdBy` set and checked. Every action role-checked; money = integer paise; audit-trailed like PO.
- Regenerate contract manifest if any route changes; keep `contract.md` current.
## Scope (required — every line filled)
- In: S1 backend only (BR-SCO-01..06, 20, 21, 23).
- Out: no tests, no challan/receipt/close (S2–S4), no frontend, no refactors of PO/PR code beyond the SCO branches.
- May edit: backend/** except test files, .pipeline/subcontracting/contract.md   May read: anything
- Size: as needed; keep diffs focused on SCO
- Stop if: rule ambiguous or the test contradicts the spec → BLOCKED quoting the rule
## Inputs
- spec, contract.md, backend/src/routes/sco.test.ts (read only), ENV.md, reports/03-backend-dev.md
## Done when
- `bun test backend/src/routes/sco.test.ts` green; full `bun test`, typecheck, lint (0 errors), contract:check pass. Do NOT commit.
Write your report to: .pipeline/subcontracting/reports/05-backend-dev.md
