# Report 16 — performance-auditor re-review (saved by coordinator)
PERF-1..4 fixed. FINDINGS: 0 blocker, 0 major, 2 minor
| PERF-6 | minor | backend | grnService applyDraftUpdate findLineUoms | read on db not tx → second pooled connection inside tx | pass tx (same as SPEC-8) |
| PERF-7 | minor | backend | 02_procurement-catalog.ts:113-138 | schema changes only via db:push; no migration SQL | confirm deploy path (BL-011) |
