# Report 25 — security-auditor — subcontracting

Result: no blocker, no major. 2 minor, 1 question. Diff: `main...HEAD`, backend + frontend.

## Checked, clean
- Authz (BR-SCO-23): all 17 `/api/sco/*` routes and both `/api/company/settings` routes use `requirePermission` (which runs `requireAuth`). Keys match the spec who-table: view=`sco.view`, create/edit/submit/cancel=`sco.manage`, challan+receipt=`sco.issue_receive`, QA=`sco.qa_decide`, close=`sco.close`, settings PATCH=`company.manage` (owner only in `SEED_GRANTS`). Routes: backend/src/routes/sco.ts, backend/src/routes/company.ts.
- Close/loss override: backend/src/service/scoService.ts close() checks `can(actor,"sco.loss_override")` inside the SCO row lock, before any posting; missing reason gives 400. Enforced on the server, not only in the UI.
- Submit: `sco.manage` check and creator-only rule sit in approvalService.submitRequest (existing path); SCO re-read under row lock. Approval actions reuse the generic segregation checks.
- IDOR: receipt/QA line ids are resolved through `findLine(receiptId, lineId)`; challan/receipt `scoItemId` is checked against the SCO's own lines (scoReceiptService.ts:187, scoChallanService.ts:173). No cross-SCO write found.
- State checks: edit only in draft, challan only approved/material_issued, receipt only material_issued, cancel only with nothing issued, close only from issued/received. All re-checked after the lock.
- Validation: Zod on every body/query. Ints only, qty >= 1, reasons 3-500, `.strict()` on update and settings, path ids checked as positive integers. `sortBy` is a whitelisted enum everywhere and maps to columns. Raw `sql` fragments contain only column refs and numeric values (no user strings).
- Data exposure: challan print returns vendor id/name/address/GSTIN only (explicit fields, no bank details). No hashes or tokens. Error messages carry status/qty only.
- Audit trail: created/last_updated/cancelled/closed by+at, `approvedBy`, QA decided by+at, ledger `createdBy` on every posting, loss reason stored in ledger notes and `closeReason`.
- Frontend: no `dangerouslySetInnerHTML`, no token or local/session storage use. Settings screen is hidden without `company.manage`, and the backend enforces it anyway. No new dependencies.

## Findings
| id | severity | area | file:line | finding | suggested fix |
|---|---|---|---|---|---|
| SEC-1 | minor | backend | backend/src/repository/companySettingsRepository.ts:19 | Company settings (GSTIN, address, state code printed on legal challans) is overwritten in place. Only the last editor and time are kept. Scenario: a compromised or careless owner account changes the GSTIN and no earlier value can be recovered. | Log old/new values on each save (audit table or `audit_log` row), or record it in backlog if out of scope. |
| SEC-2 | minor | backend | backend/src/types/sco.types.ts:131 | Search `q` has no max length, and `%`/`_` are not escaped in `ilike` (scoRepository.ts:118-119). Scenario: an `sco.view` user sends a very long or `%_%_...` pattern to make slow scans. Impact is low: authenticated only, small tables. | Add `.max(100)` to `q` and escape LIKE wildcards. |

## QUESTIONS
1. Edit and cancel of a draft SCO need only `sco.manage`, so a back-office user can edit or cancel a draft created by another user. Spec BR-SCO-05/20 and the who-table do not restrict this to the creator (only submit is creator-only, BR-SCO-06). Is that intended? Recommend: yes, leave as is (same as PO behaviour).
