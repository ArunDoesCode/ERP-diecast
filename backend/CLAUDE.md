# DiecastOS — Agent Context File

You are working on **DiecastOS**, a purpose-built ERP for aluminium die casting factories in India.
Read this entire file before writing any code or making any suggestion.

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

---

## Monorepo structure

```
diecastos/                        ← repo root
├── apps/
│   ├── web/                      ← Next.js 16 (App Router)
│   └── api/                      ← Hono on Bun runtime
├── packages/
│   ├── types/                    ← Supabase-generated DB types (never edit manually)
│   ├── validators/               ← Shared Zod schemas (used in web + api)
│   └── ai/                       ← Claude prompt constants
├── supabase/
│   └── migrations/               ← SQL migration files — source of truth for schema
├── schema/                       ← Original SQL files (reference only, superseded by migrations/)
├── biome.json                    ← Linting + formatting (replaces ESLint + Prettier)
├── turbo.json                    ← Turborepo task config
└── CLAUDE.md                     ← This file
```

---

## Tech stack — LOCKED

Do not suggest alternatives without a strong reason.

| Layer           | Technology                                 | Notes                                        |
| --------------- | ------------------------------------------ | -------------------------------------------- |
| Frontend        | Next.js 16 (App Router)                    | `proxy.ts` not `middleware.ts`               |
| Backend         | Hono on Bun                                | REST API, not serverless functions           |
| Database + Auth | Supabase (PostgreSQL)                      | Cloud, Mumbai region                         |
| Realtime        | Hono-managed stream/socket                 | Backend brokers updates to frontend          |
| File storage    | Supabase Storage                           | SolidWorks files, QA photos                  |
| Styling         | Tailwind CSS + shadcn/ui                   | Custom components built on shadcn primitives |
| Package manager | Bun                                        | Also used for testing (`bun test`)           |
| Monorepo        | Turborepo                                  | Task orchestration + remote cache            |
| Linting         | Biome                                      | Single tool, zero ESLint/Prettier            |
| WhatsApp        | WATI API                                   | Daily briefings, alerts                      |
| AI              | Anthropic Claude API (`claude-sonnet-4-6`) | Structured JSON output only                  |
| Payments        | Razorpay                                   | GST-compliant invoicing                      |
| Deployment      | Vercel (web) + Railway (api)               | Not yet configured — local dev only for now  |

---

## Database — Drizzle ORM + PostgreSQL

### Schema discipline

- Schema lives in `src/db/schemas/` — split into logical files by domain
- Schema is the single source of truth; Drizzle generates migrations
- **Every table must have who columns:** `createdBy` (FK to employees.id), `createdAt`, and for mutable entities `lastUpdatedBy` + `lastUpdatedAt`
- All monetary values stored as **bigint in paise** (never floats)

### Schema structure

```
src/db/schemas/
├── 00_enums.ts          — roleEnum (owner|back_office|floor_supervisor|qa_inspector|die_designer|operator)
├── 01_auth.ts           — roles, employees, pages, rolePages, refreshTokens, JWT auth
├── 02_sales.ts          — customers, enquiries, quotations, salesOrders
├── 03_dies.ts           — dies (library), dieVariants, die design metadata
├── 04_machines.ts       — machines, machineTypes, maintenanceLogs
├── 05_jobs.ts           — jobs, jobSteps (append-only ledger), jobMaterials
├── 06_dispatch.ts       — dispatchChallans, deliveries, logistics
├── 07_purchasing.ts     — suppliers, purchaseOrders, GRN, vendorPayments
├── 08_finance.ts        — customerInvoices, vendorBills, payments, ledger
└── 09_hcm.ts            — employees (extended), attendance, payrollRuns, leaves
└── schema.ts            — re-export all schemas for drizzle-kit
```

### Deployment workflow

```bash
# 1. Make schema changes in src/db/schemas/*.ts
# 2. Run typecheck
bun run typecheck

# 3. Push to Supabase PostgreSQL
bun drizzle-kit push

# 4. If needed, generate migrations for version control
bun drizzle-kit generate:pg
```

### Key architectural decisions

- **JWT auth with 6 roles:** employees table stores role, auth tokens verify role and allowed pages
- **Email/password login for desk workers** (owner, back_office, floor_supervisor, qa_inspector, die_designer)
- **QR token login for operators** (operator role, floor workers, no password)
- **createdBy audit on all tables** — tracks who created/modified each record
- **Job steps are append-only immutable ledger** — never update jobSteps, only insert new ones
- **Business logic in Hono API routes** — not in database triggers
- No RLS (row-level security) yet — using role middleware at API layer

---

## Supabase access boundary

Supabase database and auth/storage operations are handled in backend services.
Frontend code should consume Hono endpoints only for app flows.

---

## Frontend Data Access Policy

| Situation                                  | Use                        |
| ------------------------------------------ | -------------------------- |
| Frontend app reads and writes              | Hono API                   |
| Any business logic                         | Hono API                   |
| Aggregated dashboard data                  | Hono API                   |
| Auth/session APIs used by frontend         | Hono API                   |
| Realtime delivery to frontend              | Hono-managed stream/socket |
| File upload / signed URL for frontend      | Hono API                   |
| Worker QR sign-off (sets session variable) | Hono API                   |
| Payroll calculation                        | Hono API                   |

Frontend should not call Supabase directly for feature data flows.

---

## RBAC — roles and enforcement

**Six roles:** `owner` | `back_office` | `floor_supervisor` | `qa_inspector` | `die_designer` | `operator`

Role stored in `employees.roleId` (FK to roles table). JWT tokens embed role and allowed page keys.

**Auth strategies:**

- **Desk workers** (owner, back_office, floor_supervisor, qa_inspector, die_designer): email + password login → JWT
- **Floor operators** (operator): QR token scan → JWT (no password, no email required)

**Three enforcement layers — all three must be present:**

```
Layer 1: Hono requireRole()  — API level, per route (must-have)
Layer 2: Next.js proxy.ts    — UI level, redirects wrong roles
Layer 3: DB (future)         — RLS policies after Phase 1
```

```typescript
// Every Hono route must declare its allowed roles
import { requireRole } from "../middleware/requireRole";

router.get("/payroll", requireRole("owner", "back_office"), handler);
router.post("/jobs", requireRole("owner", "back_office"), handler);
router.post(
  "/station/complete",
  requireRole("operator", "floor_supervisor"),
  handler,
);
```

Never retrofit RBAC. Every new route gets `requireRole()` on day one.

**JWT token structure:**

```typescript
{
  userId: number,      // employees.id
  role: Role,          // from employees.roleId → roles.name
  allowedPages: string[],  // page keys user can access
  iat: timestamp,
  exp: timestamp
}
```

---

## Next.js rendering decisions

| Page                   | Strategy       | Reason                         |
| ---------------------- | -------------- | ------------------------------ |
| `/login`               | SSR            | Auth state server-side         |
| `/owner/dashboard`     | SSR + Realtime | Server load, then live updates |
| `/owner/jobs/[id]`     | SSR            | Fast initial load              |
| `/station/[stationId]` | CSR            | PWA, offline-first             |
| `/delivery/[id]`       | CSR            | Camera + GPS need browser APIs |
| `/back-office/*`       | SSR            | Form pages, server validate    |
| `/back-office/clients` | ISR 60s        | Rarely changes                 |

PPR is experimental — do not use yet.

---

## API structure (Hono)

```
apps/api/src/
├── index.ts                  ← app entry, mount routers
├── routes/
│   ├── jobs.ts
│   ├── workers.ts
│   ├── payroll.ts
│   ├── enquiries.ts
│   ├── inventory.ts
│   ├── finance.ts
│   ├── qa.ts
│   └── station/              ← worker PWA endpoints
│       ├── complete-step.ts
│       └── sync.ts           ← offline queue flush
├── middleware/
│   ├── auth.ts               ← verify JWT, attach user to context
│   └── requireRole.ts        ← role enforcement
└── lib/
    ├── supabase.ts           ← service role client (admin)
    └── wati.ts               ← WhatsApp API client
```

All routes validate input with Zod from `@diecastos/validators` before touching DB.
No `any` types. No inline Supabase instantiation. No raw user input in Claude prompts.

---

## Frontend structure (Next.js)

```
apps/web/
├── proxy.ts                  ← Next.js 16 (replaces middleware.ts)
├── app/
│   ├── (auth)/
│   │   └── login/
│   ├── (dashboard)/
│   │   ├── layout.tsx        ← role-based shell switcher
│   │   ├── owner/
│   │   ├── back-office/
│   │   ├── supervisor/
│   │   └── qa/
│   ├── station/
│   │   └── [stationId]/      ← Worker station PWA
│   └── delivery/
│       └── [jobId]/          ← Delivery worker PWA
├── components/
│   ├── owner/
│   ├── worker/               ← UX-constrained (see below)
│   ├── shells/               ← One shell per role
│   └── ui/                   ← shadcn primitives
└── lib/
    ├── supabase/
    │   ├── client.ts         ← browser client (anon key)
    │   └── server.ts         ← server component client
    └── hooks/
        └── useJobBoard.ts    ← Backend-driven invalidation/subscription
```

---

## Worker UX constraints — NON-NEGOTIABLE

These apply to everything in `components/worker/` and all `/station/*` pages.

- **No keyboard input** — every input is a tap or large numpad
- **Maximum 3 choices per screen** — split into two screens if more needed
- **Minimum 56px tap targets** — workers wear gloves
- **Hindi UI** — all text in Hindi for worker + QA screens
- **Offline-capable** — IndexedDB queue, sync on reconnect
- **Photo as evidence** — camera button on QA screens, no written description
- **QR login** — no password, no typing
- **Confirmation not entry** — system pre-fills, worker confirms or adjusts one number

If a worker-facing feature requires reading a sentence or typing anything, the design is wrong.

---

## AI features — rules

All Claude API calls:

- Use `claude-sonnet-4-6` model
- Return structured JSON only
- System prompts stored in `packages/ai/src/prompts/` as typed constants
- Never interpolate raw user input into prompts — always sanitise and structure first
- Never add AI features before operational data is clean and consistent

**Planned AI features (Phase 2+ only):**

- 6am daily owner briefing → WhatsApp via WATI
- Anomaly alert if step exceeds 150% average duration
- Quote assistant — parse client PDF → pre-fill enquiry form
- QA defect clustering — weekly pattern summary

---

## Factory process — map every feature to this

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

Any step can pause, branch, loop back, or run in parallel. Never model jobs as a linear sequence.
`job_steps.status` enum: `pending | active | done | blocked | rework`

---

## Build order — current phase

```
✅ 0. Monorepo scaffolded, migrations pushed to Supabase cloud
[ ] 1. Auth + RBAC shell
[ ] 2. Job board (read only, owner dashboard, Realtime)
[ ] 3. Worker station PWA (QR, step sign-off, offline queue)
[ ] 4. Job creation (back-office creates jobs + steps)
[ ] 5. QA logging
[ ] 6. Enquiry + quotation
[ ] 7. Inventory
[ ] 8. HCM + payroll
[ ] 9. Finance + invoices
[ ] 10. AI briefing layer
```

**MVP = steps 1–3 working end-to-end on real devices.**

---

## What NOT to do

- No microservices, message queues, or distributed systems
- No React Native or separate mobile app — PWA only, one codebase
- No keyboard input on worker screens
- No Docker (using cloud Supabase)
- No free-text in Claude prompts from user input
- No schema changes via Supabase dashboard — migrations only
- No service role key in any frontend code
- No AI features before steps 1–7 are live with real data
- No `any` types in TypeScript
- No inline Supabase client instantiation — import from `lib/supabase/`
- Do not suggest Phase 3+ features during Phase 1 build

---

## Key files to read before touching related code

| Area             | File                                    |
| ---------------- | --------------------------------------- |
| DB schema        | `src/db/schemas/` (all files, in order) |
| Database client  | `src/db/client.ts`                      |
| Auth middleware  | `src/lib/auth-middleware.ts`            |
| Auth routes      | `src/routes/auth.ts`                    |
| JWT tokens       | `src/lib/token.ts`                      |
| Type definitions | `src/lib/types.ts`                      |
| Environment      | `src/lib/env.ts`                        |

---

## Agent routing (repo-specific)

Default agent handles backend implementation in this folder.

For **cross-repo work spanning monorepo**, use parent repo CLAUDE.md agents:

- Frontend-only work in `apps/web`: use `nextjs-builder` or `nextjs-reviewer`
- Full-stack work: handle backend here first, then frontend integration

---

## Architecture — backend

### Database client

```typescript
// src/db/client.ts
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "../lib/env";

export const db = drizzle(env.DATABASE_URL);
```

### Auth flow

1. **Login/Register:** email + password (desk) or QR token (operator)
2. **Token signing:** `signAccessToken()` + `signRefreshToken()` in [src/lib/token.ts](src/lib/token.ts)
3. **Route protection:** `requireRole()` middleware enforces RBAC
4. **Session:** JWT embedded in httpOnly cookie + returned in response

### Middleware stack

- `auth.ts` — JWT verification, user context attachment
- `requireRole()` — role-based access control per route

---

---

## Commands reference

```bash
# Dev
bun run dev                          # start backend server (Hono)

# Test
bun test                             # run all tests

# Lint
biome check .                        # lint this folder
biome format --write .               # format this folder

# Database
bun drizzle-kit push                 # apply schema changes to Supabase
bun drizzle-kit generate:pg          # generate migration files
bun run typecheck                    # verify schema compiles

# Install
bun install                          # installs dependencies
```

---

## Key files to read before touching related code

| Area              | File                                                    |
| ----------------- | ------------------------------------------------------- |
| DB schema         | `supabase/migrations/` (all files, in order)            |
| Shared types      | `packages/types/src/database.types.ts`                  |
| Shared validators | `packages/validators/src/index.ts`                      |
| Auth middleware   | `apps/api/src/middleware/auth.ts`                       |
| Role middleware   | `apps/api/src/middleware/requireRole.ts`                |
| Supabase clients  | `apps/web/lib/supabase/` and `apps/api/lib/supabase.ts` |
| AI prompts        | `packages/ai/src/prompts/`                              |
| Worker components | `apps/web/components/worker/`                           |
