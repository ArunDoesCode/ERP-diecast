# Report 11 — security-auditor — grn + grn-stock (a6ca63e..HEAD)

Authz checked: all 8 GRN routes and the 3 changed/new asset inventory routes have requireAuth (router-level) + requireRole
matching the spec who-table; descriptors' auth matches the guards. Line access is scoped by grnId+lineId (no cross-GRN IDOR).
Over-receipt override is role-checked server-side (client role check is display only). Reconciliation raw SQL: only
pageSize/page (numbers) and a whitelisted sortDir enum are interpolated, all bound or fixed -> no injection.
No new dependencies, no secrets, no dangerouslySetInnerHTML / token storage in frontend diff.

| id | severity | area | file:line | finding | suggested fix |
|---|---|---|---|---|---|
| SEC-1 | major | backend | backend/src/service/grnService.ts:237-297, 299-317; repository/grnRepository.ts:376-401 | Draft-only edit/delete is a check-then-act with no lock. Scenario: floor_supervisor PATCHes a GRN (status read = draft) while QA accepts a line; the PATCH then rewrites receivedQty on a line that already posted stock (ledger = old qty, line/PO = new qty). Same for DELETE: the delete waits on the line lock, then removes the posted line, erasing the audit trail (who/why) while ledger rows and PO received qty stay. Gain: falsified receipt record after posting (BR-GRN-12, 35). | Do update/delete in one tx: lock the GRN row (or lines FOR UPDATE), re-check status = draft and every line qaStatus = pending inside the tx; add `qaStatus='pending' AND isQaBypassed=false` to the updateLineArrivedQty WHERE. |
| SEC-2 | minor | backend | backend/src/types/asset.types.ts:307-313, grn.types.ts qty3 | No upper bound on quantities or unitCostPaise (unitCostPaise `.int().min(0)` has no max). Scenario: back_office/floor_supervisor sends qty 1e15 or cost 1e15 -> precision loss in the milli math (Math.round(qty*1000)) and integer overflow in the DB -> 500 or silently wrong stock/average cost. | Add `.max()` (e.g. qty <= 1e9, paise <= 1e11) to qty3 and manual movement fields. |
| SEC-3 | minor | backend | backend/src/service/assetService.ts:198-232 | Manual movement does not check locationId exists; bad id surfaces as a raw FK 500 error. | Look up location (404) before postStock. |
| SEC-4 | minor | backend | backend/src/types/grn.types.ts (certificateUrl `z.string().url()`) | Accepts `javascript:` / `data:` URLs. Scenario: qa_inspector stores `javascript:...`; harmless today (URL is not rendered anywhere), stored-XSS if a later screen renders it as a link. | Restrict to http(s): `.refine(u => /^https?:\/\//i.test(u))`. |

FINDINGS: 0 blocker, 1 major, 3 minor
