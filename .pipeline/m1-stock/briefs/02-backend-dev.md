# Brief 02 — backend-dev — contract for grn + grn-stock (interfaces only)
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/grn.md (v1, frozen), docs/specs/grn-stock.md (v1, frozen)
BR scope: all BR-GRN-* in both specs
## Task
Contract step only — no business logic. Define every request/response shape the two specs need, so
test-writer and frontend-dev can work from it:
- GRN: create/update (challan mandatory, no receivedDate in body, per-line batch/heat number), QA decision
  (accepted + rejected qty, remarks, certificate URL, over-receipt override reason), bypass (reason, optional
  accepted qty, override reason), correction (qty, reason), details (per line: accepted, rejected, corrected
  total, netAcceptedQty, bypass/override info).
- Inventory: manual movement (only `stock_adjustment` / `opening_stock`, reason required, qty, cost),
  item create/update without currentStock/averageCostPaise, reconciliation `GET` (list of mismatch rows).
- Schema/enum additions the contract implies (ledger `reference_line_id`, ref types `grn_correction`,
  `opening_stock`, GRN over-receipt/correction storage) — declare them in the schema files, no service logic.
- Error codes/status per rule (400/403/404/409) listed per endpoint in `contract.md`.
- Route guards: follow `.pipeline/m1-stock/ENV.md` (requireRole with key's seed roles + super-admin,
  `// perm: <key>` comment). Keys and seed roles: "Who can do what" in both specs, `inventory.*` in docs/specs/inventory.md.
Then `bun --env-file=… run contract:generate` and `db:test:prepare`.
## Scope (required — every line filled)
- In: Zod schemas in `backend/src/types/{grn,asset}.types.ts`, route descriptors in `end-points.ts`, route
  guards in `routes/{grn,asset}.ts`, schema columns/enums, `.contracts/api-manifest.json`, `.pipeline/m1-stock/contract.md`.
  Handlers may stay as today or return 501 for brand-new endpoints.
- Out: service/repository logic, tests, frontend, files listed as off-limits in ENV.md, PO/PR code.
- May edit: backend/src/types/**, backend/src/routes/**, backend/src/db/schemas/02_*.ts, backend/.contracts/**, .pipeline/m1-stock/contract.md
  May read: anything
- Size: ≤ 8 files, ≤ 400 changed lines
- Stop if: a shape needs a business decision the specs don't answer → BLOCKED with options + recommendation
## Inputs
- .pipeline/m1-stock/plan.md, .pipeline/m1-stock/reports/01-explorer.md, .pipeline/m1-stock/ENV.md
- docs/modules/grn.md, docs/modules/inventory.md
## Done when
- typecheck passes; contract:generate committed-ready; contract.md lists every endpoint (method, path, request, response, errors, roles + perm key)
Write your report to: .pipeline/m1-stock/reports/02-backend-dev.md
