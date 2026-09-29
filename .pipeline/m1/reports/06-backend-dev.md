# 06 backend-dev — S3 contract
Done: types/signatures + contract.md S3 section. No router switched.
- route-registry.ts: `permission` variant added.
- auth-middleware.ts: `Actor`, `loadActor`, `invalidateActor`, `invalidateRole`, `requirePermission` (bodies throw "not implemented", unused).
- contract.md: types, error bodies, token payload, full route -> key table (real paths).
Checks: lint clean. typecheck: only error is `permissions-sync.test.ts` missing `./permissions-sync` (S2 build, pre-existing red test).
Questions: Q1 GET /asset/machines (bo + fs, one-key rule); Q2 /setup/modules and /setup/pages* key.
Map updates: onError/AppError has no extra-fields slot, so `key` in 403 needs `errors.ts` + `app.ts` change in S3 build. Explorer parity table paths were stale; real paths are in end-points.ts.
