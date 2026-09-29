# Brief 30 — backend-dev — fix inventory review round 1 (backend)
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/inventory.md (v1), docs/specs/grn-stock.md (v1)
BR scope: BR-INV-04, 07, 08, 12, 13, 15, 24 (fix side)
## Task
Fix these findings (details in `.pipeline/m1-stock/reports/27-*.md`, decisions in findings.md):
- PERF-20: index `item_id` on purchase order items and purchase request items (+ supplier_items if no index leads with item_id).
  Index-only change in 02_procurement-purchasing.ts — no other PR/PO change.
- PERF-21: ledger index `(location_id, id desc)`. PERF-22: ledger index on `created_at`.
- CR-22: `postStock` refuses an inactive location (400, BR-INV-15); deactivating the only active `main_store` → 409.
- CR-23: reset `isVirtual` when a location leaves `vendor_premise`; ignore client `isVirtual` for other types (vendor_premise always true).
- CR-24: BR-INV-04 check + update in one tx with the item row locked.
- CR-25: reorder level whole number for pcs/set (effective unit on update).
- CR-26: last rate uses the newest PO line with rate > 0; no fake 1 paise — legacy item with standard rate 0 returns 0 (source standard rate).
- SEC-20: escape `\ % _` in every `ilike` search term in the asset repository.
Do NOT rename the last-rate source `pr_estimate` (SPEC-24 backlogged). Then `db:test:prepare`, `contract:generate` if shapes changed.
## Scope (required — every line filled)
- In: the findings above
- Out: tests (never edit), frontend, PR/PO logic, ENV.md off-limits files
- May edit: backend/src/** except *.test.ts, backend/.contracts/**        May read: anything
- Size: ≤ 7 files, ≤ 300 changed lines
- Stop if: a fix needs a business decision → BLOCKED
## Done when
- full `bun test` green; typecheck + lint no new warnings; contract:check clean
- Report: per finding id → fixed where; "Map updates"
Write your report to: .pipeline/m1-stock/reports/30-backend-dev.md
