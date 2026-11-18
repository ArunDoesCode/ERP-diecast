# UI end-to-end tests (Playwright)

**Tests in this folder are written only by the `test-writer` agent**, from the frozen spec
(root `CLAUDE.md` → Test independence rule). Developers and other agents do not add or edit `*.spec.ts` here.

## Run
```bash
cd backend && bun run try        # API :4000 + UI :3000 with the dev DB (leave it running)
cd frontend
bun run e2e:install              # once per machine: downloads Chromium
bun run e2e                      # all specs, desktop 1440x900 + tablet 1024x768
bun run e2e --project=desktop    # one screen size
bun run e2e e2e/<file>.spec.ts   # one file
```
- The UI on `:3000` is reused if it is up; if not, Playwright starts `bun run dev` itself.
  The API on `:4000` is never started by Playwright.
- Other target: `E2E_BASE_URL=http://host:port bun run e2e` (nothing is started for a non-local URL).

## Where results go (both gitignored)
| What | Where |
|---|---|
| Screenshots and traces of failed tests | `frontend/test-results/<test name>-<project>/` |
| HTML report | `frontend/playwright-report/` → `bunx playwright show-report` |

Config: `frontend/playwright.config.ts`. CI: job `e2e` in `.github/workflows/ci.yml` (non-blocking,
skipped while this folder has no `*.spec.ts`).
