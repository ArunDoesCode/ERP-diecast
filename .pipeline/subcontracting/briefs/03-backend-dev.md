# Brief 03 — backend-dev — S1 contract step (interfaces, no logic)
Feature: subcontracting  Branch: claude/subcontracting-feature-b19136  Spec: docs/specs/subcontracting.md (v2, frozen)
BR scope: BR-SCO-01..06, 20, 21, 23
## Task
Contract step only for slice S1 (order + approval). Read `.claude/pipeline/PROTOCOL.md`, the spec, the map
`docs/modules/subcontracting.md`, the plan and `reports/02-explorer.md`. Copy the PO stack pattern.
1. Schema: extend `subcontracting_orders` / `_items` per plan S1 (header: expected return date, approval
   level fields, cancel + close who/when/reason; line: `serviceId` FK, send qty, return qty as whole
   numbers, issued/accepted/rejected/unprocessed/loss counters, price + GST % copied). Add `company_settings`
   (one row: name, address, GSTIN, state code) and `item_master.hsn_code` (nullable text). Keep existing
   table names; make `createdBy` not-null for SCO only if safe, else keep and check in service.
2. Route descriptors in `backend/src/routes/end-points.ts` + Zod types (`types/sco.types.ts`) +
   controller/service/repository/route files with signatures and `NotImplemented`-style stubs (no logic):
   SCO list, details, create, update, submit, cancel; company settings get/put; item update accepts `hsnCode`.
   Permission key per route: `sco.view` / `sco.manage`; company settings owner-only (use an existing key or
   ask via QUESTIONS).
3. `.pipeline/subcontracting/contract.md`: method, path, request, response, errors, role per endpoint.
4. `cd backend && bun run contract:generate`; commit manifest.
5. Push schema to test DB per ENV.md (`db:test:prepare`).
## Scope (required — every line filled)
- In: schema, descriptors, Zod types, stubs, contract.md, manifest for S1 only.
- Out: no business logic, no tests, no challan/receipt/close endpoints (S2–S4), no frontend, no refactors.
- May edit: backend/** (except test files), .pipeline/subcontracting/contract.md, backend/.contracts/api-manifest.json   May read: anything
- Size: as needed for schema + stubs; no logic
- Stop if: a rule is ambiguous or a key is missing → BLOCKED with the question, don't guess
## Inputs
- docs/specs/subcontracting.md, docs/modules/subcontracting.md, .pipeline/subcontracting/plan.md, reports/02-explorer.md, ENV.md
## Done when
- `bun run typecheck` and `contract:check` pass; contract.md lists every S1 endpoint; do NOT commit (coordinator commits).
Write your report to: .pipeline/subcontracting/reports/03-backend-dev.md
