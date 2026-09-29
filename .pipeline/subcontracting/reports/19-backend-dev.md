# Report 19 - backend-dev - S4 contract
DONE. typecheck ok, lint 0 errors, contract:check ok (110 routes), bun test 1314 pass / 0 fail. Not committed.

## Added
- POST /sco/:id/close (`sco.close`; loss needs `sco.loss_override` in service; reason 3-500 optional in Zod, required by service when qty left).
- GET /sco/reports/vendor-stock, GET /sco/reports/loss-log (`sco.view`, paginated).
- GET /sco/getscos: new `createdFrom`/`createdTo` params (repository ignores them until implement).
- Open challans report: existing GET /sco/challans/open reused unchanged.
- No schema change: closedBy/closedAt/closeReason and lossQty exist; `sco_loss` ref type exists; loss log = ledger `sco_loss` rows + SCO close reason.
- Files: types/scoReport.types.ts, controller/scoReportController.ts, service/scoReportService.ts (stubs, 501), scoController.close, scoService.close (stub), types/sco.types.ts (closeScoSchema, date filters), routes/sco.ts, routes/end-points.ts, contract.md, manifest.
- No repository stubs added (would be dead code); repositories come in implement.

## Map updates
- New endpoints above; new files listed.
- Convention for implement: `sco_loss` ledger row = referenceId SCO id, referenceLineId SCO line id, notes = reason.
- Trap: close body may be empty; controller uses `.json().catch(() => ({}))`.
