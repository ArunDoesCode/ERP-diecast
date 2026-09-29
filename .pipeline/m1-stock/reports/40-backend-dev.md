# Report 40 — backend-dev — supplier review minors

`bun test` 358 pass / 0 fail; typecheck ok; biome clean on touched files; `contract:check` clean (manifest regenerated, unchanged output).

| id | change | where |
|---|---|---|
| PERF-40 | batch edit first locks the supplier's price-list rows ordered by id (`lockItemRowsOrdered` / `lockServiceRowsOrdered`), then applies rows in request order (response order kept) | supplierRepository.ts, supplierService.ts (editSupplierItems/Services) |
| SEC-40 | `.max()`: name 200, email 254, phone 30, contact 200, address 500, supplierSku 100 | supplier.types.ts |
| SEC-41 | qty `.max(1e9)` | supplier.types.ts |
| CR-40 | create-with-items: blank `supplierSku` -> null | supplierService.ts `create` |
| CR-41 | `escapeLike` in item/service list search | supplierRepository.ts |
| CR-42 | removed dead repo methods (`listItems`, `updateItemBy*`, `editSupplierItemBy*`, `editSupplierServiceBy*`), `itemLookupColumns`, schemas `supplierItemLookupQuerySchema`, `supplierDetailQuerySchema` | supplierRepository.ts, supplier.types.ts |

Note: PERF-40 locks all of the supplier's rows (not just targeted ones) so itemId-selected targets need no pre-resolve; fine at price-list sizes.

Map updates: batch edit takes an ordered row lock up front (deadlock-safe); text fields now length-capped (see types); dead repo methods listed in the map's repository row are gone.
