# DiecastOS Backend — Agent Context File

You are working on the **backend** for DiecastOS, a purpose-built ERP for aluminium die casting factories in India.
Read this entire file before writing any code or making any suggestion.

This file was rewritten on 2026-07-22 to match the actual repo state — the previous
version described an earlier planned architecture (Turborepo monorepo, Supabase cloud,
job-floor-first build order) that is not what exists here. If you find another drift
like that again, fix this file, don't work around it.

---

## What this product is

Vertical SaaS ERP for small-to-mid aluminium die casting factories in India.
Built around a real factory visit. One paying customer first → reference → sell to 400+ similar factories.

**Owner's problems in severity order:**

1. No real-time floor visibility
2. Data entry failure (workers won't fill forms)
3. Siloed information across finance, ops, HR, sales
4. Payroll opacity — ₹18L/month with no output tracking
5. Die IP disorganised — 15 years of designs, unsearchable
6. Reactive machine maintenance only
7. Single supervisor dependency

The full factory-floor vision (job tracking, dies, dispatch, floor PWA) is the long-term
target. **Current build focus is the procurement slice** (suppliers → purchase requisitions
→ purchase orders → GRN → approvals). Do not assume job/floor/dispatch code exists — it
doesn't yet.

---

## Repo layout (this is NOT a monorepo)

`backend/` (this repo) and `frontend/` are two **separate sibling folders** under
`ERP-diecast/`, each with their own `package.json`, dependencies, and tooling. There is
no Turborepo, no `apps/`, no shared `packages/*`.

```
backend/                           ← this repo
├── src/
│   ├── index.ts                   ← entry: connects DB, serves createApp()
│   ├── app.ts                     ← createApp(): middleware, mainRouter, onError (tests use it)
│   ├── routes/                    ← Hono routers, one per feature (auth, asset, setup, supplier, pr, po, grn, approval)
│   ├── controller/                ← parses input (Zod), calls service, shapes response
│   ├── service/                   ← business logic, orchestrates repository calls
│   ├── repository/                ← Drizzle queries only, no business logic
│   ├── types/                     ← Zod schemas + inferred types, per feature
│   ├── db/
│   │   ├── client.ts               ← drizzle-orm/postgres-js client
│   │   ├── schemas/                ← Drizzle table defs, split by domain (see below)
│   │   └── migrations/             ← drizzle-kit generated migrations
│   ├── lib/                        ← auth-middleware, token, errors, async-handler, env, http, qr-token, route-registry, …
│   └── test/setup-env.ts           ← bun test preload: forces DATABASE_URL_TEST
├── docs/                            ← audit/remediation notes (see docs/backend-audit-remediation-*.md)
├── docker-compose.yaml              ← local Postgres 15 for dev (see "Database" below)
├── biome.json                       ← lint + format config (Biome, replaces ESLint/Prettier)
└── CLAUDE.md                        ← this file
```

---

## Tech stack — as actually installed

Do not suggest alternatives without a strong reason.

| Layer            | Technology                          | Notes                                                      |
| ---------------- | ----------------------------------- | ---------------------------------------------------------- |
| Backend          | Hono on Bun                         | REST API                                                   |
| Database         | PostgreSQL 15, **local via Docker** | `docker-compose.yaml` → `postgres:15`, not Supabase cloud  |
| ORM              | Drizzle ORM + drizzle-kit (v1)      | Schema in `src/db/schemas/`, migrations generated from it  |
| Auth             | Custom JWT (`jose`) + own tables    | No Supabase Auth, no `@supabase/*` dependency in this repo |
| Password hashing | `Bun.password.hash` / `.verify`     | For desk-worker email/password login                       |
| Operator login   | Raw hex QR token + hashed digest    | `src/lib/qr-token.ts`, no password                         |
| Validation       | Zod (v4)                            | Every controller parses input before calling a service     |
| Package manager  | Bun                                 | `bun run <script>`                                         |
| Lint/format      | Biome                               | `bun run lint` / `lint:fix` / `format`                     |

Frontend (`../frontend`) is a separate Next.js repo. It talks to this backend only through
the Hono API — it does not have its own Supabase client and should not gain one. If you're
editing frontend code, treat `frontend/CLAUDE.md` (if present) or the frontend repo's own
conventions as authoritative for that side; this file only governs `backend/`.

---

## Database — Drizzle ORM + PostgreSQL

### Local dev setup

```bash
docker compose up -d        # dev Postgres :5432 + test Postgres :5433 (see docker-compose.yaml)
bun run db:push             # push current schema to the dev DB (drizzle-kit push)
bun run db:test:prepare     # push schema + page-access seed to the test DB
bun run db:studio           # drizzle-kit studio, browse the DB
```

`DATABASE_URL` in `.env` points at the local Docker Postgres in dev. There is currently
no production database — this project is dev-only, no deployed environment yet.

**Tests never touch the dev DB.** `bunfig.toml` preloads `src/test/setup-env.ts`, which replaces
`DATABASE_URL` with `DATABASE_URL_TEST` before any module loads, and refuses to run if that variable
is missing, equals `DATABASE_URL`, or names a database that doesn't end in `_test`
(`src/lib/test-db-url.ts`). The `postgres-test` container is in-memory (tmpfs), so after a container
restart run `bun run db:test:prepare` again. Tests still clean up their own fixtures (prefix names,
delete in `afterAll`) — the test DB is shared by every test file in a run.

### Schema discipline

- Schema lives in `src/db/schemas/` — split into logical files by domain, re-exported from `index.ts`
- Schema is the single source of truth; Drizzle generates migrations from it
- Every table should have audit columns: `createdBy` (FK to `employees.id`), `createdAt`, and for mutable entities `lastUpdatedBy` + `lastUpdatedAt` — this is aspirational for older tables, enforce it going forward
- Monetary values are stored as **integer paise** (never floats) — see `subtotalPaise`, `totalAmountPaise` etc. in `02_procurement-purchasing.ts`
- Avoid `any` in schema column definitions. The `references((): any => ...)` pattern in `01_auth.ts`/`03_hcm.ts` is a known circular-FK-type escape hatch, not an approved pattern — fix with `AnyPgColumn` return typing when touched, don't copy it into new tables

### Actual schema structure (as of 2026-07-22)

```
src/db/schemas/
├── 01_auth.ts                     — roles, employees* (FK only), pages, rolePages, refreshTokens
├── 02_procurement-catalog.ts      — itemMaster, serviceMaster, machines
├── 02_procurement-suppliers.ts    — supplierMaster, supplierItems, supplierServices
├── 02_procurement-purchasing.ts   — purchaseRequests(+items), purchaseOrders(+items), GRN, subcontracting
├── 02_procurement-approval.ts     — approvalPolicies, approvalRequests, approvalTrails
├── 02_procurement.ts              — barrel re-export of the four 02_procurement-* files above
├── 03_hcm.ts                      — employees (full definition), attendance/payroll fields
└── index.ts                       — re-exports everything for drizzle-kit
```

\*`employees` is actually defined in `03_hcm.ts`; `01_auth.ts` only references it by FK.

### Deployment workflow (dev-only right now)

```bash
# 1. Make schema changes in src/db/schemas/*.ts
# 2. Typecheck
bun run typecheck

# 3. Push straight to your local dev DB (no production yet, no backfill ceremony needed)
bun run db:push

# 4. If you want a committed migration file too
bun drizzle-kit generate
```

### Key architectural decisions

- **JWT auth, roles are DB rows, not a hardcoded enum** — `roles` table, FK'd from `employees.roleId`. Known role values in code today: `owner`, `back_office`, `floor_supervisor`, `qa_inspector`, `die_designer`, `operator`, `super-admin` (see `src/lib/token.ts` `Role` type)
- **Email/password login for desk workers**, **QR token login for operators** (no password) — both real, both implemented
- **`createdBy` audit on tables** — enforce on new tables, backfill old ones opportunistically
- **Business logic lives in services** — not in DB triggers, not in controllers
- **No RLS** — role enforcement is entirely at the API middleware layer (see RBAC below)
- **Errors must be typed `AppError` subclasses** (`src/lib/errors.ts`: `BadRequestError`, `NotFoundError`, `ConflictError`, `UnauthorizedError`, `ForbiddenError`, base `AppError`). Raw `throw new Error(...)` still exists in some older files (`authService.ts`, `assetService.ts`, `employeeRepository.ts`) — treat as debt to clean up when you touch those files, don't add new ones

---

## RBAC — roles and enforcement

Roles are rows in the `roles` table (see `01_auth.ts`), referenced by FK from `employees.roleId`.
The `Role` TypeScript union in `src/lib/token.ts` currently covers:
`owner` | `back_office` | `floor_supervisor` | `qa_inspector` | `die_designer` | `operator` | `super-admin`

**Auth strategies:**

- **Desk workers** (owner, back_office, floor_supervisor, qa_inspector, die_designer, super-admin): email + password login → JWT
- **Floor operators** (operator): QR token scan → JWT (no password, no email required)

**Enforcement — every route file currently does this correctly, keep it that way:**

```typescript
// Every Hono route file applies both requireAuth and requireRole
import { requireAuth, requireRole } from "../lib/auth-middleware";

router.use("*", requireAuth, requireRole("super-admin", "back_office"));
```

Never retrofit RBAC. Every new route gets `requireAuth` + `requireRole()` on day one — check
`src/routes/*.ts` for the existing pattern before adding a new router.

**JWT payload shape (see `src/lib/token.ts`):**

```typescript
{
  userId: number | string,
  userName: string,
  role: Role,
  allowedPages: string[],
}
```

---

## API structure (Hono) — as it actually exists

```
src/
├── index.ts                  ← entry: connectDb(), serve(createApp()), graceful shutdown
├── app.ts                    ← createApp(): logger, CORS, body limit, /health, /api → mainRouter, onError
├── routes/
│   ├── index.ts               ← mainRouter, mounts everything below under MAIN_ROUTES
│   ├── end-points.ts          ← END_POINTS path constants per router
│   ├── auth.ts                ← /auth — register, login, refresh, logout, me
│   ├── asset.ts               ← /asset — items, services, machines, locations, inventory movements
│   ├── setup.ts               ← /setup — modules, employees, roles, pages, permissions (super-admin only)
│   ├── supplier.ts            ← /supplier — supplier master, supplier items, supplier services
│   ├── pr.ts                  ← /pr — purchase requisitions
│   ├── po.ts                  ← /po — purchase orders (create, send, confirm, reminder/escalate/delay, invoice, close)
│   ├── grn.ts                 ← /grn — goods receipts, QA decision, bypass, correction
│   └── approval.ts            ← /approval — policies, requests, act, trail, current-by-document
├── controller/                 ← one file per feature (plus employee/module/page/permission/role for setup)
├── service/                    ← same split as controller/
├── repository/                 ← same split; approvalRepository.test.ts is the real-DB test pattern
├── types/                      ← Zod request schemas per feature (*.types.ts)
└── lib/
    ├── auth-middleware.ts       ← requireAuth, requireRole
    ├── async-handler.ts         ← asyncHandler() wrapper, logs + rethrows on error
    ├── route-registry.ts        ← register() route descriptors → contract manifest (+ drift test)
    ├── response-schemas.ts      ← shared response envelopes for descriptors
    ├── document-number.ts       ← PR/PO/GRN document numbering
    ├── rate-limiter.ts          ← auth rate limiting
    ├── token.ts                 ← sign/verify access + refresh JWTs
    ├── errors.ts                ← AppError family
    ├── http.ts                  ← refresh-cookie helpers
    ├── qr-token.ts              ← operator QR token generation
    ├── test-db-url.ts           ← DATABASE_URL_TEST guard used by the test preload
    └── env.ts                   ← typed env access
```

Tests: `bun test` (co-located `*.test.ts`). HTTP-level tests use `createApp().request(...)` —
see `src/app.test.ts`. Every frontend `API_ROUTES` path must exist in the route registry
(`src/lib/frontend-routes-contract.test.ts`), and the committed `.contracts/api-manifest.json`
must be current (`bun run contract:check`, in CI).

There is no `jobs.ts`, `workers.ts`, `payroll.ts`, `enquiries.ts`, `qa.ts`, or `station/` yet —
those belong to a later phase of the product vision, not the current codebase.

All routes validate input with Zod schemas colocated in `src/types/*.types.ts` before touching
the DB. Avoid `any` types in new code (some existing files still have it — don't add more).

---

## Frontend (separate repo)

`frontend/` is a standalone Next.js app, not part of this repo's package manager or build.
It consumes this backend exclusively through the Hono API (`lib/api/client.ts` there) using a
JWT access token — it does not have a Supabase client and should not gain one. If a frontend
change needs new backend behavior, add it here first, then wire the frontend to call it.

---

## Factory process — long-term vision (map future features to this)

```
01. Client enquiry       → client sends 3D model, drawings, docs
02. Quotation            → versioned price negotiation, delivery date
03. Job creation         → enquiry → job; new die or existing from library
04. Die design           → SolidWorks, owner + design team
05. CNC programming      → machinist codes die into CNC system
06. Die machining        → CNC carves die (hours to days)
07. Machine setup        → casting machine selected, die loaded, stock checked
08. Trial casting        → Trial-0, Trial-1; QA validates die + piece quality
09. Batch casting        → full production run in small batches
10. Trimming/shaping     → flash removed; initial visual QA; scrap or remelt
11. QA sort              → defects separated, categorised by type
12. Finishing            → shot blasting or CNC surface finish
13. Final QA             → pass / rework / reject per piece
14. Packing              → boxes packed, packing list generated
15. Dispatch             → transport arranged, delivery confirmed
16. Invoice + payment    → GST invoice, advance/partial/final payment tracking
```

The current build (procurement: suppliers → PR → PO → GRN → approvals) is the tooling
that supports steps feeding into "07. Machine setup" and "16. Invoice + payment" — it is
a slice of this vision, not the whole thing. Any step can pause, branch, loop back, or run
in parallel. Never model jobs as a linear sequence once job-tracking is actually built.


## What NOT to do

- No microservices, message queues, or distributed systems
- No React Native or separate mobile app — PWA only, once that phase starts
- No keyboard input on worker screens (once built)
- No schema changes applied by hand to the DB — always through `src/db/schemas/*.ts` + `bun run db:push` / migrations
- No `any` types in new TypeScript code
- No raw `throw new Error(...)` in new code — use the `AppError` family in `src/lib/errors.ts`
- No debug `console.log` left in controllers/services — remove before considering a change done
- No AI features before procurement + floor data (once built) is clean and consistent
- Do not assume Supabase, Turborepo, or a frontend monorepo — none of that exists in this repo

---

## Key files to read before touching related code

| Area              | File                                           |
| ----------------- | ---------------------------------------------- |
| DB schema         | `src/db/schemas/` (all files, in order)        |
| Database client   | `src/db/client.ts`                             |
| Auth middleware   | `src/lib/auth-middleware.ts`                   |
| Auth routes       | `src/routes/auth.ts`                           |
| JWT tokens        | `src/lib/token.ts`                             |
| Errors            | `src/lib/errors.ts`                            |
| Async handler     | `src/lib/async-handler.ts`                     |
| Type definitions  | `src/lib/types.ts`                             |
| Environment       | `src/lib/env.ts`                               |
| Audit/remediation | `docs/backend-audit-remediation-2026-07-21.md` |
