# Brief 19 — explorer — inventory code facts for BR-INV-01..25
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/inventory.md (v1, frozen)
BR scope: BR-INV-01..25
## Task
Map-first, diff-only. Read docs/modules/inventory.md (last_verified_commit 0a406f4; grn-stock parts updated
2026-09-29) and docs/modules/grn.md. Explore only code changed since 0a406f4 in the map's paths plus what the
questions below need. Answer with file + symbol:
1. `itemMaster`, `serviceMaster`, `locations`, `machines` columns today: which of SKU/code unique (case?), category/uom types, isActive, reorderLevel, standard rate, sacCode, machine code/status/lastMaintenanceAt, lastUpdatedBy/At, linkedVendorId/isVirtual.
2. Create/update Zod schemas + repository methods for each master (asset.types.ts, assetRepository): what they allow changing; any delete routes.
3. All `/api/asset/*` routes with guards (routes/asset.ts) and END_POINTS descriptors.
4. Where items/services/machines/locations are picked elsewhere: PR, PO, supplier-item, SCO code paths that check `isActive` (file + symbol) — only list, don't read deeply.
5. `getLastRate` current logic and callers (incl. PO price suggestion).
6. Stock view: is there any per-item per-location balance endpoint? Movement list filters and response (does a row name its source document?).
7. Manual movement: current request shape (after the m1-stock grn-stock work) — signed qty or counted qty? opening_stock checks?
8. Frontend: inventory screens (items, services, locations, machines, movements) — components and forms; which fields each form sends.
9. Existing tests touching asset/inventory (stockPosting.test.ts) — fixture helpers usable for inventory tests.
## Scope (required — every line filled)
- In: read-only lookup, answers 1–9
- Out: any edits; design proposals beyond one-line notes
- May edit: only your report file        May read: anything
- Size: report ≤ 200 lines
- Stop if: n/a
## Inputs
- docs/modules/inventory.md, docs/modules/grn.md, docs/modules/suppliers.md, .pipeline/m1-stock/contract.md
## Done when
- All 9 answered with file + symbol
Write your report to: .pipeline/m1-stock/reports/19-explorer.md
