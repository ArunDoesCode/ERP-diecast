# Backend layout reference (as-built file tree)

Moved from `backend/CLAUDE.md` on 2026-11-18 (workflow v2, item 0.6). Look-up material — not loaded on
every call. Per-module code locations are in `docs/modules/<module>.md`; prefer those and CodeGraph.

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
│   └── lib/                        ← auth-middleware, token, errors, async-handler, env, http, qr-token, route-registry, …
├── tests/                          ← all *.test.ts, mirroring src/ (routes, service, repository, lib, types, scripts) + setup-env.ts (bun test preload: forces DATABASE_URL_TEST)
├── docker-compose.yaml              ← local Postgres 15 for dev (see "Database" below)
├── biome.json                       ← lint + format config (Biome, replaces ESLint/Prettier)
└── CLAUDE.md                        ← this file
```

## Tech stack notes
Frontend (`../frontend`) is a separate Next.js repo. It talks to this backend only through
the Hono API — it does not have its own Supabase client and should not gain one. If you're
editing frontend code, treat `frontend/CLAUDE.md` (if present) or the frontend repo's own
conventions as authoritative for that side; this file only governs `backend/`.

## Frontend (separate repo)

`frontend/` is a standalone Next.js app, not part of this repo's package manager or build.
It consumes this backend exclusively through the Hono API (`lib/api/client.ts` there) using a
JWT access token — it does not have a Supabase client and should not gain one. If a frontend
change needs new backend behavior, add it here first, then wire the frontend to call it.

### Actual schema structure (as of 2026-07-22)
```
src/db/schemas/
├── 01_auth.ts                     — roles, modules, permissions, rolePermissions, screens, authAuditLog, refreshTokens, documentNumberCounters (employees* = FK only)
├── 02_procurement-catalog.ts      — itemMaster, serviceMaster, machines
├── 02_procurement-suppliers.ts    — supplierMaster, supplierItems, supplierServices
├── 02_procurement-purchasing.ts   — purchaseRequests(+items), purchaseOrders(+items), GRN, subcontracting
├── 02_procurement-approval.ts     — approvalPolicies, approvalRequests, approvalTrails
├── 02_procurement.ts              — barrel re-export of the four 02_procurement-* files above
├── 03_hcm.ts                      — employees (full definition), attendance/payroll fields
├── 04_company.ts                  — companySettings (one row: plant name, address, GSTIN, state)
└── index.ts                       — re-exports everything for drizzle-kit
```

\*`employees` is actually defined in `03_hcm.ts`; `01_auth.ts` only references it by FK.

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
│   ├── setup.ts               ← /setup — modules, employees, roles, screens, permissions (`setup.roles.manage` / `setup.employees.manage`)
│   ├── supplier.ts            ← /supplier — supplier master, supplier items, supplier services
│   ├── pr.ts                  ← /pr — purchase requisitions
│   ├── po.ts                  ← /po — purchase orders (create, send, confirm, reminder/escalate/delay, invoice, close)
│   ├── grn.ts                 ← /grn — goods receipts, QA decision, bypass, correction
│   ├── approval.ts            ← /approval — policies, requests, act, trail, current-by-document
│   ├── sco.ts                 ← /sco — subcontracting orders, challans, receipts + QA, close, reports
│   └── company.ts             ← /company — company settings (plant details for the job-work challan)
├── controller/                 ← one file per feature (plus employee/module/page/permission/role for setup; sco split into order/challan/receipt/report)
├── service/                    ← same split as controller/
├── repository/                 ← same split; approvalRepository.test.ts is the real-DB test pattern
├── types/                      ← Zod request schemas per feature (*.types.ts)
└── lib/
    ├── auth-middleware.ts       ← requireAuth, requirePermission, requireAnyPermission, loadActor (actor cache)
    ├── permissions.ts           ← permission key + screen catalog (code owns it, synced to DB)
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

## Known debt (clean up when you touch the file, never copy)
- Audit columns (`createdBy`, `createdAt`, `lastUpdatedBy`, `lastUpdatedAt`) are missing on some older tables — backfill opportunistically.
- `references((): any => ...)` in `01_auth.ts` / `03_hcm.ts` is a circular-FK-type escape hatch, not an approved pattern — fix with `AnyPgColumn` return typing when touched.
- Raw `throw new Error(...)` still exists in `authService.ts`, `assetService.ts`, `employeeRepository.ts`.
- Some existing files still use `any`.

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
