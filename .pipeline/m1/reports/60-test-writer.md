# Report 60 — test-writer — regression (approval v2, PR v2, PO v2, known-defects v3)

Typecheck and biome are clean. Nothing committed. Brief contamination: none.

## Red tests (FAIL-EXPECTED: fix not built yet)
| finding | test | file | now |
|---|---|---|---|
| SPEC-P1 | actOnRequest "cancel" -> 400, request pending, PR untouched | src/routes/approval-requests.test.ts | 200 |
| SEC-P3 | PR creator without pr.manage submits -> 403 | approval-requests.test.ts | 201 |
| SEC-P3 | PO creator without po.manage submits -> 403 | approval-requests.test.ts | 201 |
| SPEC-P4 | policy API never returns isSaleOrderLinked | src/routes/approval-policies.test.ts | key present (null) |
| SEC-P4 | notes 2001 chars -> 400 on create | src/routes/pr-lifecycle.test.ts | 201 |
| SEC-P4 | notes 2001 chars -> 400 on edit | pr-lifecycle.test.ts | 200 |
| CRP-4 | edit resends same machine, no pr.link_machine -> 200 | src/routes/pr-machine.test.ts | 403 |
| CRP-8/SPEC-P5 | confirmation method outside the 4 values -> 400 | src/routes/po-lifecycle.test.ts | 200 |
| SEC-P1 | local DB not `diecast`/`*_test`, no DB_RESET_CONFIRM -> exit 2 | scripts/db-reset.test.ts | exit 0 (wipes) |
| SEC-P1 | same target, wrong confirm (with --allow-remote) -> exit 2 | db-reset.test.ts | exit 0 (wipes) |
| SEC-P1 | local port not 5432/5433, no confirm -> exit 2 before connecting | db-reset.test.ts | exit 1 (tries to connect) |
| SEC-P2 | after --allow-remote run, summary says "rotate the seed admin password now" | db-reset.test.ts | missing |

## Green on arrival (guard against regression)
- BR-PR-15 v2: PATCH resending `status: "draft"` -> 400 PR_STATUS_VIA_ACTION (CRP-1 backend half).
- CRP-4: different machine without the key -> 403; edit without the machine field -> 200.
- BR-APR-24: pr.manage-only creator can submit a PR (control).
- BR-PO-17: all four methods accepted, become the log row's channel.
- CRP-2: cancel PO (draft and approved) racing a cancel of another line of the same PR, 6 rounds each, both 200, PR ends cancelled. Green, so it may not hit the deadlock every time. It fails if a 40P01 deadlock shows up.
- BR-KD-30: a run without --allow-remote does not print the rotate warning.

## Existing tests changed
- `approval-requests.test.ts`: `act` helper type no longer offers "cancel" (SPEC-P1, approval v2).
- `db-reset.test.ts` "a failing step exits 1": port 1 is now a local non-5432/5433 port, so it needs `--allow-remote` + `DB_RESET_CONFIRM` to get past the guard (known-defects v3). Assertion (exit 1) unchanged.
- `db-reset.test.ts`: added a second scratch DB `diecast_kd_reset_guard` (created and dropped in the file's hooks). `assertScratchOnly` allows only the two scratch names. The shared test DB is never touched.

## Questions / ambiguity (no test written)
1. **SEC-P4 "saleOrderId must exist (400)"**: not tested. There is no sale-order table until M4, so nothing to check against. It also contradicts BR-PR-02 body text ("stored as sent, unchecked, saleOrderId 42 -> saved"), and `pr-lifecycle.test.ts` still has that test (green). Options: (A) drop the "must exist" line from PR v2 until M4, recommended; (B) keep it and say which table it is checked against. Until then the existing "42 is saved" test stays.
2. **db-reset v3 local confirm**: the v3 line doesn't say whether a local unusual target needs `--allow-remote` as well as `DB_RESET_CONFIRM`. The v1 test says confirm without `--allow-remote` is exit 2. My "guard passes" tests send both flags, which fits either reading. Please make the spec say which.
3. **CRP-1 frontend half** (edit dialog no longer sends status) and BR-PR-39 UI, BR-APR-57..60, BR-KD-16 are UI-only. Not covered here (SPEC-P3, manual checklist).

## Run summary
- approval-requests, approval-policies, pr-lifecycle, pr-machine: 231 pass, 7 fail (the red rows above).
- po-lifecycle: 200 pass, 1 fail (CRP-8).
- db-reset BR-KD-30 group and the failing-step test: 10 pass, 4 fail (SEC-P1/P2).
- The full db-reset fixtures group (13 DBR-1 tests) was not re-run.

## Files
backend/src/routes/approval-requests.test.ts, approval-policies.test.ts, pr-lifecycle.test.ts, pr-machine.test.ts, po-lifecycle.test.ts, backend/scripts/db-reset.test.ts
