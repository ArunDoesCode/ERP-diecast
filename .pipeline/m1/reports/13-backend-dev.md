# Report 13 — backend-dev — S4 service checks + PR machine gate

Result: DONE with 2 tests still red (reasons below). bun test 179 pass / 2 fail; typecheck + lint clean; contract regenerated.

## Changed
- `lib/auth-middleware.ts`: new `can(actor,key)` (super-admin true); requirePermission uses it.
- `service/grnService.ts` + `controller/grnController.ts`: Actor passed; OVER_RECEIPT_OVERRIDE_ROLES removed -> `grn.over_receipt_override`.
- `service/approvalService.ts` + `controller/approvalController.ts`: ActorContext = {actorId, actor}; view_all, view_others_pending (403 PERMISSION_DENIED with key), `approval.auto_approve_own` (submitRequest gets optional 3rd arg `actor`; keeps old 2-arg signature for approvalRepository.test).
- `service/employeeService.ts`: last-super-admin check uses `loadActor(id).isSuperAdmin` (no role literal).
- `service/assetService.ts`: listMachines uses `can`.
- `service/prService.ts` + `controller/prController.ts`: create/update take Actor; non-null assetId without `pr.link_machine` -> 403 PERMISSION_DENIED {key:"pr.link_machine"}.
- `types/pr.types.ts`: updatePrSchema saleOrderId/assetId/notes now `.optional()` (was wrongly required, so a partial PATCH like `{prId, assetId}` returned 400). Contract manifest regenerated.

## Still red
1. `no-role-names.test.ts` "no seed role name as string literal":
   - `lib/token.ts:6-12` Role union -> S7.
   - `repository/approvalRepository.ts:394` fallback chain `role: "owner"` — approval-chain storage, out of my scope/files. Needs coordinator decision (approval spec).
2. `pr-machine.test.ts` "holder of pr.link_machine saves a PR with a machine": TEST DEFECT. Test reads `body.data.id` after POST /api/pr/createpr, but the existing response is `data: { pr: {...}, items: [...] }` (prRepository.createWithItems). Status 201 assert passes; the id read fails. Not a spec rule; test should use `data.pr.id`. I did not change the response shape (frontend depends on it).

## Map updates
- New: `can(actor,key)` in lib/auth-middleware.ts is the only way services decide access. Services take `Actor`, never role names.
- approvalService ActorContext is now `{actorId, actor}`; `submitRequest(input, actorId, actor?)` auto-approves when actor holds `approval.auto_approve_own` (owner seed) — new behaviour, BR-AUTH-21.
- Trap: `updatePrSchema` (drizzle-zod createUpdateSchema with overrides) makes overridden fields required unless `.optional()` is added.
- Trap: POST /pr/createpr returns `data: {pr, items}`, not a flat PR.
- Trap: `loadActor` has a 2s cache; employeeService calls `invalidateActor` on writes.
- Open: approvalRepository fallback policy chain hard-codes role "owner".
- Commit: see git log ("feat(m1): auth S4").
