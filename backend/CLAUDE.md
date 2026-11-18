# DiecastOS Backend — conventions

Backend of DiecastOS, an ERP for aluminium die-casting plants in India. Current build focus: procurement
(suppliers → PR → PO → GRN → approvals) and subcontracting. Job / floor / dispatch code does not exist yet.
This file holds only the conventions needed on every backend task. If it drifts from the code, fix the file.

| Need | Read |
|---|---|
| Product vision, owner problems, factory process, product-level limits | `docs/product/vision.md` |
| Full file tree (routes, lib, schema files), key files, known debt | `backend/.claude/reference/backend-layout.md` |
| Build conventions / review checklist | `backend/.claude/reference/hono-build-conventions.md`, `hono-review-checklist.md` |
| One module's code, tables, endpoints, gotchas | `docs/modules/<module>.md` |
| New endpoint / list endpoint | skills `api-endpoint-intake`, `pagination-contract` |

## Stack (do not suggest alternatives without a strong reason)
| Layer | Technology | Notes |
|---|---|---|
| API | Hono on Bun | REST; package manager Bun (`bun run <script>`) |
| Database | PostgreSQL 15, local via Docker | `docker-compose.yaml`; no Supabase, no cloud DB, no production DB yet |
| ORM | Drizzle ORM + drizzle-kit (v1) | schema in `src/db/schemas/`, migrations generated from it |
| Auth | Custom JWT (`jose`) + own tables | `Bun.password.hash` / `.verify` for desk login; operators use a QR token (`src/lib/qr-token.ts`) |
| Validation | Zod (v4) | every controller parses input before calling a service |
| Lint / format | Biome | `bun run lint` / `bun run fix` |

`backend/` and `frontend/` are separate sibling folders, each with its own `package.json` — no Turborepo,
no shared packages. The frontend talks to this backend only through the Hono API. If a frontend change
needs new backend behaviour, add it here first.

## Layout
```
src/index.ts      entry: connects DB, serves createApp()
src/app.ts        createApp(): middleware, /health, /api → mainRouter, onError (tests use it)
src/routes/       Hono routers, one per feature; paths in routes/end-points.ts
src/controller/   parses input (Zod), calls service, shapes response
src/service/      business logic, orchestrates repository calls
src/repository/   Drizzle queries only, no business logic
src/types/        Zod schemas + inferred types per feature (*.types.ts)
src/db/           client.ts, schemas/ (by domain, re-exported from index.ts), migrations/
src/lib/          auth-middleware, permissions, errors, async-handler, route-registry, token, env, …
tests/            all *.test.ts, mirroring src/ + setup-env.ts (bun test preload)
```

## Database
```bash
docker compose up -d        # dev Postgres :5432 + test Postgres :5433
bun run db:migrate          # apply pending migrations to DATABASE_URL (dev DB)
bun run db:test:prepare     # apply migrations + role/permission seed to the test DB
bun run db:test:rebuild     # wipe + rebuild the test DB exactly as CI does (DATABASE_URL_TEST only; --dry-run, --fixtures)
bun run try                 # try the branch: DBs + safe db:migrate + API :4000 + UI :3000 (--check = show only)
```
**Tests never touch the dev DB.** `bunfig.toml` preloads `tests/setup-env.ts`, which replaces `DATABASE_URL`
with `DATABASE_URL_TEST` before any module loads, and refuses to run if that variable is missing, equals
`DATABASE_URL`, or names a database that doesn't end in `_test` (`src/lib/test-db-url.ts`). The
`postgres-test` container is in-memory (tmpfs): after a container restart run `bun run db:test:prepare`
again. Tests clean up their own fixtures (prefix names, delete in `afterAll`) — the test DB is shared by
every test file in a run.

### Schema discipline
- Schema lives in `src/db/schemas/`, split by domain, re-exported from `index.ts`. It is the single source
  of truth; Drizzle generates migrations from it.
- Every new table has audit columns: `createdBy` (FK to `employees.id`), `createdAt`, and for mutable
  entities `lastUpdatedBy` + `lastUpdatedAt`.
- Money is stored as **integer paise** (never floats) — e.g. `subtotalPaise`, `totalAmountPaise`.
- No `any` in column definitions; type circular FKs with `AnyPgColumn`.

### Schema change workflow
```bash
bun run typecheck       # after editing src/db/schemas/*.ts
bun run db:generate     # generate the migration; commit it in the same PR (CI fails if it is missing)
bun run db:migrate      # apply to your dev DB
```
Never edit a migration that is merged to `main`. Never change the DB by hand. Schema push is removed.

## Architecture decisions
- **Roles and their grants are DB rows, not a hardcoded enum** — `roles` (FK'd from `employees.roleId`) plus
  `rolePermissions`. Seeded system roles: `super-admin`, `owner`, `back_office`, `floor_supervisor`,
  `qa_inspector`, `die_designer`, `operator`. Permission keys live in code (`src/lib/permissions.ts`) and
  are synced to the DB.
- **Email + password login for desk workers, QR token login for operators** (no password) — both built.
- **Business logic lives in services** — not in DB triggers, not in controllers.
- **No RLS** — authorization is entirely at the API middleware layer (below).
- **Errors are typed `AppError` subclasses** (`src/lib/errors.ts`: `BadRequestError`, `NotFoundError`,
  `ConflictError`, `UnauthorizedError`, `ForbiddenError`). No raw `throw new Error(...)` in new code.

## Authorization — permissions and enforcement
Access is **permission-based**. A role is a row in `roles` with a set of permission keys (`rolePermissions`);
route guards check keys, never role names. `super-admin` is the one system role that holds every key.
The key catalog is `src/lib/permissions.ts` (code owns the keys; the DB copy is synced from it).

- **Desk workers** (owner, back_office, floor_supervisor, qa_inspector, die_designer, super-admin): email +
  password → JWT. **Floor operators** (operator): QR token scan → JWT (no password, no email).
- **The token only identifies the caller.** Payload (`src/lib/token.ts`): `{ userId, userName }`. On every
  request `requireAuth` verifies the token, then loads the caller (`Actor`: id, role, `isSuperAdmin`,
  `isActive`, `permissions`) fresh from the DB (short cache, cleared when the employee, role or its grants
  change). A missing or inactive employee is a 401, so a deactivated user loses access immediately. Role
  and permissions are never read from the token.

**Every route applies auth plus a permission guard, per route:**
```typescript
import { requirePermission } from "../lib/auth-middleware";

router.post(
  SCO_ROUTES.create,
  requirePermission("sco.manage"),
  asyncHandler(scoController.create),
);
```
- `requirePermission(key)`: 401 if not authenticated, 403 `PERMISSION_DENIED` (body carries `key`) if the caller lacks it.
- `requireAnyPermission(...keys)`: same, but holding any one key is enough (e.g. a `.manage` key admitting `.view` routes).
- Add a new key to `src/lib/permissions.ts` first, then use it. Never check role names in route code.
- Never retrofit authorization: every new route gets a permission guard on day one — check
  `src/routes/*.ts` for the existing pattern before adding a new router.

## API and tests
- All routes validate input with Zod schemas in `src/types/*.types.ts` before touching the DB.
- Paths come from `src/routes/end-points.ts`; routes are registered through `src/lib/route-registry.ts`
  (descriptors → contract manifest). Async handlers are wrapped in `asyncHandler()`.
- Tests: `bun test` (all in `tests/`, mirroring `src/`). HTTP-level tests use `createApp().request(...)` —
  see `tests/app.test.ts`. Real-DB test pattern: `tests/repository/approvalRepository.test.ts`.
- Every frontend `API_ROUTES` path must exist in the route registry
  (`tests/lib/frontend-routes-contract.test.ts`), and the committed `.contracts/api-manifest.json` must be
  current (`bun run contract:check`, in CI).

## What NOT to do
- No schema changes applied by hand — always `src/db/schemas/*.ts` + `bun run db:generate` / `db:migrate`.
- No `any` types in new TypeScript code.
- No raw `throw new Error(...)` in new code — use the `AppError` family.
- No debug `console.log` left in controllers / services.
- No microservices, message queues or distributed systems; no Supabase or Turborepo assumptions
  (product-level limits: `docs/product/vision.md`).
