# Report 29 — backend-dev — review round 1 fixes
Result: DONE. bun test 1344 pass / 0 fail (incl. scoReceiptCost.test.ts), typecheck clean, lint 0 errors (260 pre-existing warnings), contract:check ok (manifest unchanged). Not committed.

| id | change | where |
|---|---|---|
| CR-1 | new column `sco_receipt_settlements.processed_qty` (default 0); receipt create records processed part per challan line; QA cost averages `processedQty` only | schemas/02_procurement-purchasing.ts (scoReceiptSettlements), scoReceiptService.ts (create settle tally, decideQa cost), scoReceiptRepository.ts findSettledCosts |
| PERF-1 | partial index `idx_inventory_ledger_sco_loss` (created_at desc, id) where reference_type='sco_loss' | schemas/02_procurement-catalog.ts |
| PERF-3 | `idx_sco_vendor_status`, `idx_sco_created_at` | schemas/02_procurement-purchasing.ts (subcontractingOrders now has an index callback) |
| PERF-4 | `idx_sco_challans_vendor` | same file (scoChallans) |
| PERF-5 | receipt create: lines processed in raw-item-id order; QA: postings collected then sorted by itemId; close: losses sorted by rawItemId | scoReceiptService.ts, scoService.ts |
| SEC-2 | `q` max 100; `escapeLike` for `\ % _` | types/sco.types.ts:131, scoRepository.ts |
| SPEC-2 | challan number > 16 chars -> ConflictError `SCO_CHALLAN_NUMBER_TOO_LONG` | scoChallanService.ts |
| CR-4 | `SUBMIT_KEYS` map typed on docType/PermissionKey, unknown -> BadRequest | approvalService.ts |
| CR-5 | `items2` -> `itemsWithCharge` | scoService.ts |
| CR-7 | dropped no-op `Math.round` | scoChallanService.ts |
| SPEC-5 | deleted `NotImplementedError` | lib/errors.ts |

Schema pushed to test DB (`db:test:prepare`). Dev DB not pushed (no dev env in this worktree); run `bun run db:push` on dev.

## Map updates
- Table `sco_receipt_settlements` has `processed_qty` (part of `qty` drawn by processed pieces). Older rows default 0 -> QA cost for any receipt line still pending QA from before this change would be 0; dev-only data, no prod.
- New indexes listed above; `escapeLike` lives in scoRepository.ts.
- Trap: when converting a `pgTable(name, cols)` to the callback form, edit the right table (my scripted replace hit subcontractingOrderItems first).
- Trap: the "Insufficient stock" AppError stack in test output is an expected-failure log, not a failure.
