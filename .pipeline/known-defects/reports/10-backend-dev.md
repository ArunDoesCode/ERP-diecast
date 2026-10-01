# Report 10 — backend-dev — SEC-7
Fixed in backend/scripts/db-reset.ts (only file touched, +9/-3): right after the protocol check, any URL with a query string (`parsed.search` or a raw `?`) is refused with exit 2, before the postgres driver is built. Removed the now-dead `urlSearch` variable. prepare-test-db.ts needed no change (it runs db:reset, so the same guard applies).
Checks: `bun test tests/scripts/` 121 pass / 0 fail; typecheck clean; lint reports 260 pre-existing warnings, no errors.

## Map updates
- db:reset guard also refuses any DATABASE_URL query string (SEC-7). postgres.js applies ?database/?user/?host from the query at connect time, so a path-only check can be bypassed.
