# Report 64 — test-writer — MRG-T1, MRG-T2
Commit c1a1553 (`test(m1): …`). Typecheck 0 errors. Full run: 1148 pass, 11 fail (all waiting on code rows or outside scope, below).

## MRG-T1 (fixtures as real employees)
- grnService, inventoryStock, supplierService, stockPosting tests: one real employee per seed role, made on first use; token carries that employee's id. Owner stays `actorId`.
- inventoryMasters: actorA/actorB are now back_office employees; other roles get a sibling employee per slot.
- Identity asserts (testedBy, qaBypassedBy, createdBy, overReceiptBy, changedBy) now compare with the employee of the calling role.
- stockPosting: `qaAction`/`bypass` get `actorId` + an `Actor` from `loadActor`.
- `Role` import from lib/token replaced by a local type (S7 removed it). permission-enforcement:176 and permissions-matrix:222 cast the `"roles"` compare.
- Extra: afterAll in pr-lifecycle, po-lifecycle, pr-machine, pr-cancel, approval-policies nulls `document_number_counters.lastUpdatedBy` before deleting employees (FK error left "unnamed" failures).

## MRG-T2
- BR-PR-14: 6 tests in `backend/src/routes/pr-lifecycle.test.ts`. 4 RED, waiting on MRG-B2 (standard-rate fallback + `noCostHistory`). 2 pass (avg cost above 0).
- BR-PO-10: new `backend/src/service/poReceiptStatus.test.ts`, 10 tests via grnService (partial, fully, correct back, correct all -> dispatched, reject, bypass, two lines). All PASS.

## Still red (not mine to fix)
| test | waits on |
|---|---|
| BR-PR-14 x4 | MRG-B2 |
| db-reset BR-KD-46 "fixtures never set stock" (1, others green now) | MRG-B1 |
| permissions-matrix BR-AUTH-21 `/setup/pages` x4, `/setup/permissions`, `/setup/roles/:roleId/permissions` | matrix rows list routes S7 removed (BR-AUTH-15 retires page grants). Needs a test-change finding quoting the spec; coordinator to open one. |

## Notes
- TEST-1 question: spec BR-PR-14 does not say where the per-line `noCostHistory` flag is returned. Tests read `data.items[]` (or `data.pr.items[]`) from `getprdetails`, matched by itemId. If backend puts it elsewhere, spec needs one line.
- BRIEF-CONTAMINATION: none.

## MRG-T3 (appended)
Permissions-matrix: dropped the 6 parity rows for routes removed in S7 (BR-AUTH-15); added one test that they return 404 for super-admin. permissions-matrix 67 pass / 0 fail, typecheck 0 errors. Q1 answered (items[] on getprdetails), tests already match.

## MRG-T4 (appended)
db-reset.test.ts BR-KD-46: replaced "stock and average cost 0" with "currentStock equals ledger sum per item, and some stock exists" (known-defects v4). Full run: 1154 pass, 0 fail, 31 files; typecheck 0 errors (BR-PR-14 and db-reset now green as code rows landed).

## SPEC-P3 (appended)
Manual UI checklist written: .pipeline/m1/manual-ui-checklist.md (8 sections: grants gating, roles, screens, isSuperAdmin, Cancel PR BR-KD-16/BR-PR-39, BR-PR-14 note, BR-APR-57..60, PO screens). Links the m1-stock checklist for grn/inventory/suppliers.
