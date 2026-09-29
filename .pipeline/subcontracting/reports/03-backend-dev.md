# Report 03 — backend-dev — S1 contract step

Done. Interfaces only; every S1 handler returns 501 `NOT_IMPLEMENTED` (new `NotImplementedError` in `lib/errors.ts`). Not committed.

## Changed
- Schema `02_procurement-purchasing.ts`: SCO header + expectedReturnDate (not null), subtotal/tax/total paise, approvedBy, current/totalApprovalLevels, lastUpdatedBy/At, cancelledBy/At/Reason, closedBy/At/Reason. Line: `serviceId` FK (not null), `rawQtyToIssue` and `expectedReturnQty` now integer, counters issued/accepted/rejected/unprocessed/lossQty (int, default 0). `createdBy` kept nullable (older rows); service must set/check it.
- New `04_company.ts` `company_settings` (id=1 check, name, address, gstin, stateCode, updatedBy/At); `item_master.hsn_code`.
- New: `types/sco.types.ts`, `routes/sco.ts`, `routes/company.ts`, controller/service/repository for `sco` and `companySettings`; `end-points.ts` (`sco`, `company`), `routes/index.ts` mounts `/sco`, `/company`; `asset.types.ts` `assetItemUpdateSchema.hsnCode`.
- `.pipeline/subcontracting/contract.md`, `backend/.contracts/api-manifest.json` (99 routes).
- `db:test:prepare` run. Dev DB NOT pushed (run `db:push`; new not-null columns `expected_return_date`, `service_id` will fail if dev has SCO rows).

## Checks
typecheck ok, contract:check ok, bun test 1155 pass, lint 0 errors (259 pre-existing warnings).

## Map updates
- New files above; endpoints `/api/sco/*`, `/api/company/settings`; table `company_settings`; `item_master.hsn_code`.
- Trap: registry has no PUT, so company settings upsert is PATCH.
- Trap: line fields keep old names (`rawQtyToIssue` = send qty, `expectedReturnQty` = return qty) to avoid interactive column-rename in drizzle push.
- Approval SCO branch (`approvalRepository`) unchanged; still to fix in implement step (amount, category, level mirror).
