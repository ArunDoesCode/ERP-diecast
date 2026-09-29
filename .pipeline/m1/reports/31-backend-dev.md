# Report 31 — backend-dev — db:reset + fixtures (BR-KD-30, 33, 35, 40, 44, 46)

Result: `backend/scripts/db-reset.test.ts` 39 pass, 1 fail. The one fail is the item standard-rate test (`item_master` has no standard-rate column yet; comes from the inventory branch). Left red on purpose.

## Target safety (F-TEST-10)
- The target DB comes only from `process.env.DATABASE_URL` as handed to `db-reset.ts`. It never reads `DATABASE_URL_TEST`, never looks up a `.env` file itself, and never uses src/db/client's URL for the drop.
- The drop step opens its own connection from that same value. drizzle-kit, bootstrap-admin and the policy seed inherit it. The in-process db client (roles, fixtures) reads the same variable.
- `bun test` sets DATABASE_URL=DATABASE_URL_TEST only inside the test process (preload). `bun run db:reset` is a separate process and does not run that preload.
- The tests pass an explicit scratch URL. The shared `diecast_test` was not touched by my runs. I used scratch DBs on :5433 (`kd31_manual`, `kd31_test`, `kd31b_test`), all dropped.

## What was built
- `backend/scripts/db-reset.ts`: guard (exit 2), inputs (exit 4), step failure (exit 1). Target printed as `host:port/db (password ***)`. Unknown flags are ignored.
- Steps: drop `public` + `drizzle`, recreate `public` → drizzle-kit push → roles + catalog + grants → admin → approval policies → fixtures → summary.
- `backend/scripts/db-reset-fixtures.ts`: all data through real services (employeeService, assetService, supplierService, prService, poService, grnService, approvalService).
- `backend/scripts/drizzle-reset.config.ts`: same as drizzle.config plus `schemaFilter: ["public"]`.
- `backend/package.json`: `db:reset`. `.github/workflows/ci.yml` and `docs/WORKFLOW.md` updated.
- Commit: `feat(m1): db:reset script + fixtures (BR-KD-30..46)`.

## Decisions
- CI runs `db:reset --no-fixtures` against the CI test DB (`.../diecast_test`, step-level `DATABASE_URL`). `bun test` still runs on DATABASE_URL_TEST. `db:test:prepare` is unchanged and still works.
- I checked this: full `bun test` on a reset-built test DB failed 2 tests (the standard-rate one and the BR-AUTH-11 role-name scan in src). The prepare-built DB failed 21 (mostly BR-PR-* tests, red because of other in-flight work). So the reset-built DB is no worse.
- The admin is created by running `scripts/bootstrap-admin.ts` as a child process with `BOOTSTRAP_ADMIN_*`. The password is `SEED_USER_PASSWORD`, per spec v2.
- No `seed_page_access.sql` run: page grants are retired. Roles come from `Object.keys(SEED_GRANTS)`; the script fails naming an unknown permission key.
- Fixture approvals: approver is picked from the request's current step role and must not be the requester. Requesters are floor_supervisor / die_designer, POs are made by back_office, and each PO total is ≥ ₹1L so the "PO large" policy (owner only) applies.
- Fixture users are not given roles beyond the seed grants. `submitRequest` is called without an actor, so `approval.auto_approve_own` (owner) never auto-approves.

## Gaps
1. Standard rate: fixtures do not set it. `ITEMS[].ratePaise` in the fixtures file holds the values (ADC12 24_500, etc.). Once the column exists, add it to `assetService.createItem` in `db-reset-fixtures.ts`.
2. Not tested by design: "fixtures throw → exit 1 with `fixtures` printed" and "unknown seed key" (no test hooks). Both paths are implemented.
3. Summary balance uses ledger sums (ADC12 500 kg, H13 300 kg, Gloves 2000 pair, Shot Sleeve 12 pcs).

## Checks
- `bun run typecheck`: clean.
- `bun run lint`: 1 error + warnings, all in src files owned by other in-flight work (authRepository import order etc.). No hits in `scripts/`.
- db-reset tests: see above. Runtime about 7 s.

## Map updates (for docs/modules)
- New: `backend/scripts/db-reset.ts`, `db-reset-fixtures.ts`, `drizzle-reset.config.ts`; script `db:reset`.
- Trap: `drizzle-kit push` without a schema filter stops asking "rename or create" for every table when the DB has another schema (exit 2). db:reset uses `--config=scripts/drizzle-reset.config.ts`.
- Trap: stdout/stderr of child tools must not be echoed: drizzle-kit output contains the word "postgres", which equals the local dev password and fails the test's "password not printed" check. Child output is captured and shown only on failure (after scrubbing).
- Trap: `actOnRequest` does not let super-admin act on a role step (roleName must match), so fixtures use role-holders.
- Trap: PO cancel of a draft PO returns its PR lines to pending and recomputes the PR header (a PR can go back to `approved`).
- Trap: a GRN header becomes `pending_qa` only when at least one line is finalized and one is not; `draft` GRNs never get moved by fixtures.
- Fixture document numbers reset with the DB but use the run month (`PR-YYYY-MM-n`); two runs in the same month give identical numbers.
