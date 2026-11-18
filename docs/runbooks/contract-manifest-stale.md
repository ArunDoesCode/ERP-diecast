# Contract manifest stale

The manifest `backend/.contracts/api-manifest.json` is generated from the route descriptors
(`backend/src/routes/end-points.ts` and the route files). It is committed. Frontend reads it, never
backend source.

## Symptom
- CI step "Contract manifest is committed and current" fails with
  `backend/.contracts/api-manifest.json is out of date`.
- `bun test` fails in `tests/lib/frontend-routes-contract.test.ts`: a path in frontend `API_ROUTES`
  (`frontend/src/lib/api/routes.ts`) has no backend route (past: F-FE-1, a retired route still listed).
- Frontend sends or reads a field the backend does not have (past: F-TEST-7, CRP-1).
- Merge conflict inside the manifest file.

## Check
```bash
cd backend && bun run contract:check                 # exit 1 = committed file differs from the code
bun run contract:query "<METHOD /path>"              # what the backend really offers for one route
git status --short -- .contracts                     # uncommitted manifest?
```
These scripts load the app, so they need the env (`DATABASE_URL`, both token secrets). In a worktree
without `backend/.env` use `bun --env-file=<path> run contract:check`.

## Fix
1. Manifest out of date:
   ```bash
   cd backend && bun run contract:generate
   git add .contracts/api-manifest.json
   git commit -m "feat(<id>): regenerate contract manifest"
   bun run contract:check                             # must exit 0 now
   ```
   Better: backend-dev commits the manifest in the same commit as the route change.
2. Frontend path with no backend route: decide from the **spec** which side is right.
   - Spec has the endpoint → backend-dev adds the route, then step 1.
   - Spec does not → frontend-dev removes or corrects the entry in `frontend/src/lib/api/routes.ts`.
3. Wrong method or payload → `bun run contract:query "<METHOD /path>"`, give the output to frontend-dev;
   it fixes types and calls to match. If the backend shape is wrong against the spec, backend-dev fixes
   the descriptor first, then step 1.
4. Merge conflict in the manifest → do not merge by hand. Take either side, then run step 1; the
   generator output is the truth.
5. Update `.pipeline/<id>/contract.md` if an endpoint changed, so the next brief points at the right shape.

## If it fails twice
`contract:check` still exits 1 right after `contract:generate` → the output is not stable or the script
is broken. That is an environment failure: record command + output in `.pipeline/<id>/reports/`, open an
issue (`defect`, `mod:backend`, `P1`), and [park-a-slice.md](park-a-slice.md) for the slice that changed
routes. Frontend and backend still disagree after 2 rounds → usually a spec gap:
[spec-gap-mid-build.md](spec-gap-mid-build.md).

## Never
- Never edit `api-manifest.json` by hand.
- Never let frontend-dev read backend source to guess a shape; use `contract:query`.
- Never delete or weaken `frontend-routes-contract.test.ts` to get green.
- Never commit the manifest inside a `test(…)` commit.
