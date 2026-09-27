# Backlog

Ideas and change requests that are **not** in a frozen spec. Nothing here gets built until it is moved into
a spec via `/spec` and frozen. Format: `- [ ] <module>: <idea> — why — raised <date>`.

## Known defects (found 2026-09-27 repo review — fix via `/bug`)
- [ ] purchase-requisition: frontend `DELETE /pr/deletepr` sends id in body; backend route is
      `/pr/deletepr/:id` → 404 (`frontend/src/lib/api/routes.ts`, `frontend/src/lib/api/purchase-requisitions/fetchers.ts`)
- [ ] approval: frontend still uses `prType`, schema uses `subDocType` → 8 tsc errors
      (`frontend/src/components/pages/setup/approval/approval-policy-helpers.ts`, `frontend/src/types/approval.ts`)
- [ ] frontend: 40 `a11y/noLabelWithoutControl` lint errors in GRN modals / PO dialogs

## Workflow infrastructure (M0)
- [ ] backend: `bootstrap-admin` script — `/auth/register` needs an existing super-admin/owner, so an empty
      DB has no way to create the first user
- [ ] backend: `bun run db:reset` — drop → push → page access seed → approval policies → realistic fixtures
- [ ] backend: separate test database in docker-compose (`DATABASE_URL_TEST`)
- [ ] backend: export `createApp()` from `src/index.ts` so HTTP tests get the real error handler
- [ ] repo: commit `backend/.contracts/api-manifest.json` (currently gitignored) and a test that every
      frontend `API_ROUTES` path exists in it
- [ ] repo: GitHub Actions CI — typecheck + lint + backend tests
- [ ] repo: Claude Code hooks — biome on edited file, typecheck on stop
- [ ] frontend: Playwright for 5–8 golden paths

## Ideas
- [ ] …
