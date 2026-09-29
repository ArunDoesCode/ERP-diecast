# Report 21 — test-writer — inventory tests (BR-INV-01..25)

Spec: docs/specs/inventory.md v1 (frozen). Files (new, uncommitted):
- backend/src/service/inventoryMasters.test.ts (74 tests: items, services, locations, machines, audit, roles)
- backend/src/service/inventoryStock.test.ts (51 tests: manual movements, stock view, reorder, movement list, last rate, roles)

Run: `bun --env-file=/Users/turbo_fltr/.claude/diecast-env/stock-test.env test <file>`. Typecheck clean; biome: warnings only (`any`, same as grnService.test.ts).
Result now: masters 41 pass / 33 fail, stock 6 pass / 45 fail. Fixtures TEST_inv_m_ / TEST_inv_s_, cleaned in afterAll (verified, no leaks).

## FAIL-BUG
None can be told apart yet: every red test is a handler not built (501 on POST /inventory/movements and GET /inventory/stock,
or item/service/location/machine rules for S6-S8). Two 500s to watch when S6-S8 land (should be 409): item SKU clash
(BR-INV-01, unique index violation not mapped), service code / location name / machine name+code clash (BR-INV-09/11/16).

## FAIL-EXPECTED (red until the slice lands)
| BR | What is red |
|---|---|
| 01 | SKU clash ignoring case/spaces -> 409 (now 500) |
| 03 | standard rate edit/postings (needs opening stock, 501); PATCH strictness |
| 04 | ITEM_IN_USE for ledger / PR / PO / supplier-item lines (PR, PO, supplier cases now 200) |
| 05 | inactive item on new PR (201 now) and supplier-item link (201 now) |
| 06 | deactivate with stock, adjust to zero, stock view marks inactive |
| 07, 19 | whole stock view (501) |
| 08, 21, 22, 23 | all manual movements (501) |
| 09-10 | service code clash 409 (500 now); service id as itemId -> 400 |
| 11-15 | location name clash, vendor_premise rules (no supplier / inactive / non-vendor with supplier), forced virtual, second main_store, only-main_store type change, LOCATION_IN_USE, isActive list filter, posting into inactive location |
| 16-17, 15 | machine name/code clash 409, isActive list filter |
| 20 | movement list row shape (`sourceDocument`, `itemSku`, `locationName`), PATCH/PUT/DELETE on movement |
| 24 | last-rate sources and order (response shape changed) |
| 25 | lastUpdatedBy on items and locations |
| roles | item list `isActive`/`category` filter |

## PASS (already correct)
Item field validation (BR-INV-02 unit/category/required), SKU required, standard-rate validation on create, strict body
(currentStock/averageCostPaise -> 400), reorder-level rules, no DELETE for items/services/locations/machines,
service SAC rules (BR-INV-09), machine status/date rules and audit, service audit, role 403s, 401 without token.

## Not covered (needs a flow outside this spec's tests) — reported, not guessed
- BR-INV-05 "inactive item can't go on a new **PO**", BR-INV-10 "inactive service can't go on a new PO or SCO": needs the approved-PR-to-PO flow; PR and supplier-link halves are covered.
- BR-INV-20 "each row names its source document" with a real document number (GRN no.): only manual rows (number null, id 0) asserted.
- BR-INV-21 "form opens with type Stock-take": UI only; API side covered (no default, doc types 400).
- BR-INV-06 "inactive item stock-in is refused": spec only says "adjusted to zero"; not asserted.
- BR-AUTH-26 read-only machine list for PR form: separate route/spec, not in this contract.

## QUESTIONS / notes
1. Error envelope: contract.md says `{ error: { code } }`; app.onError returns top-level `{ message, code }` (as app.test.ts). Tests accept either.
2. BR-INV-10 asserts 400 for a service id sent as itemId (spec); contract.md says "404/400". If the handler returns 404 the test will fail — spec rule wins unless spec is amended.
3. BR-INV-13 test tries to change the real main_store to scrap_yard and restores it if the server wrongly allows it.
4. Brief 21 has no contamination.
