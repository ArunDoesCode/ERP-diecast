# Report 15 — backend-dev — COORD-1 ledger value column to bigint

Result: DONE. `bun test` 157 pass / 0 fail, typecheck clean, lint 122 (unchanged), contract:check up to date (manifest unchanged). `db:test:prepare` run.

## Changes
- `backend/src/db/schemas/02_procurement-catalog.ts` — `inventory_ledger.total_value_change_paise` is now `bigint(..., { mode: "number" })`; `unit_cost_paise` stays int4.
- `backend/src/repository/stockPostingRepository.ts` — row-value cap is `Number.MAX_SAFE_INTEGER` (was int4 max).
- Reconciliation sums `quantity_change`, not this column; nothing else sums it. Asset list/response schemas still type as number.

## Map updates
- `total_value_change_paise` = bigint (number mode, safe to 2^53); `unit_cost_paise` = int4 (cap 2147483647 kept in manual movement schema).
- Dev DB needs `bun run db:push` (int4 -> bigint, plus the two ledger indexes from round 1).
