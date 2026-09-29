# Findings — subcontracting

| id | sev | area | status | note |
|---|---|---|---|---|
| TEST-1 | major | test | open | Tests "BR-AUTH-06 catalog holds exactly the keys of the spec table" and "BR-AUTH-21 owner holds exactly the spec keys" fail: catalog/owner seed now hold `company.manage`. Spec rule: `docs/specs/auth-setup.md` key table row `company.manage` — "edit company settings: plant name, address, GSTIN, state (subcontracting BR-SCO-09) — ow" (added in auth-setup changelog 2026-09-29, D-017). Tests must include it. |
| TEST-2 | minor | test | open | `sco.test.ts` afterAll deletes employees but not their `document_number_counters` rows (FK error). Test cleanup must null/delete counter actor rows like PO tests do. Then backend-dev reverts the `actorId: null` workaround in `scoRepository.insertOrder`. |
| GAP-1 | minor | test | open | No test that approval policy matches SCO on value incl. GST, category `subcontracting` (BR-SCO-04). Ask spec-reviewer; add in fix loop if flagged. |
