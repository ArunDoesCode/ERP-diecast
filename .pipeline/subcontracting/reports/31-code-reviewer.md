# Report 31 — code-reviewer — round 1 fix re-review
Verified fixed: CR-1, PERF-1/3/4/5, SEC-2, SPEC-2, CR-2/3/4/5/7, SPEC-5. No blockers, no majors.

| id | severity | area | file:line | finding | suggested fix |
|---|---|---|---|---|---|
| CR-9 | minor | backend | backend/src/service/approvalService.ts (SUBMIT_KEYS block, ~l.367) | `if (!submitKey)` is unreachable: the Record is exhaustive over the docType enum, so the guard is dead code | drop the guard, or leave (harmless) |
| CR-10 | minor | backend | backend/src/service/scoReceiptService.ts:280-285 | lines are now sorted by rawItemId, so receipt line rows are inserted in item order, not the user's order. Receipt line ids/numbering no longer follow input order | sort only the stock postings, or keep as is if line order is not user visible |

Checks done (no issue):
- CR-1: `processed_qty` written per settlement (`tally`); QA cost uses processedQty only. Unprocessed cost path (l.356) unchanged. A QA line always has processed > 0, so the divisor is never 0.
- New column has `default 0 notNull`. Repo uses `db:push` (no migrations), so no backfill file is needed. Old pending-QA rows in a dev DB would cost 0 (feature is unreleased).
- Indexes: loss-log partial index (createdAt desc, id) matches the default sort (createdAt desc, id asc) and the `sco_loss` filter. `sql` is imported. vendor/status and created_at indexes match the list filters and sort.
- LIKE escape: backslash, % and _ escaped, Postgres default escape char is `\`. `q` max 100 applied. Only the SCO list uses `q`.
- SPEC-2: length check runs inside the tx, after the counter bump, so it rolls back.
- CR-7: `Math.round` removed on integer qty x integer paise, fine.
- PERF-5: receipt sorted by raw item id. QA and close collect postings and sort by itemId, so lock order is consistent.
- Frontend CR-2/3: keys `["subcontracting","vendor-stock"]` and `["subcontracting"]` match `scoKeys`. Approval mutations now refresh SCO data.
- CR-4/5: `NotImplementedError` removal has no remaining references (typecheck should confirm).
