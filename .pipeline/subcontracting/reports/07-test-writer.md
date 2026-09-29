# Report 07 — test-writer
- TEST-1: added `company.manage: ["ow"]` to SPEC table in `backend/src/lib/permissions.test.ts` (spec auth-setup key table). Both exact-keys tests now pass.
- TEST-2: `sco.test.ts` afterAll now nulls `document_number_counters` createdBy/lastUpdatedBy for test employees before deleting them. backend-dev may revert the `actorId: null` workaround.
- GAP-1: new test "BR-SCO-04 SCO of 25,000 + 4,500 GST matches the policy for 29,500..." (two sco/subcontracting policies, min-included/max-excluded at 2,950,000; asserts request.policyId). PASS. Test policies use priorities -95001/-95002, removed in afterAll.
- Run: permissions.test, sco.test, permissions-sync.test: 86 pass, 0 fail. typecheck clean.
