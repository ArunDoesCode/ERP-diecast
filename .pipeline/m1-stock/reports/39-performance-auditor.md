# Report 39 — performance-auditor, suppliers (saved by coordinator)
FINDINGS: 0 blocker, 0 major, 4 minor
| PERF-40 | minor | backend | supplierService.ts:601-612, 646-657; supplierRepository.ts:623, 647 | batch edits lock rows one by one in request order → possible deadlock between two batches → 500 | lock all targets up front ordered by id (or sort edits by id), keep response order |
| PERF-41 | minor | backend | supplierService.ts:182-214, 234-263 | ~3 queries per batch row, up to ~300 in one tx | optional: one inArray load + one history insert |
| PERF-42 | minor | backend | 02_procurement-suppliers.ts supplier_services | no index on service_id (nothing filters by it yet) | add when needed |
| PERF-43 | minor | backend | supplierRepository.ts search | ilike '%q%' not indexable | pg_trgm later (BL-050 pattern) |
Checked OK: pagination capped 100 everywhere; history index; name unique index; master update lock + history in one tx; last-rate extra filter cheap; frontend keys/invalidation scoped.
