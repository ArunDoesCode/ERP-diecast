@AGENTS.md

# ERP Diecast — Frontend

Standalone Next.js 16 App Router app. Talks to a separate Hono/Bun backend (`../backend`)
over HTTP only — no monorepo, no shared `packages/*`, no server actions.

## Stack

- Next.js 16 (App Router, Turbopack default) — see `AGENTS.md` above for confirmed
  version-16 breaking changes.
- TanStack Query (server state) + Zustand (UI state only) + nuqs (URL state).
- shadcn/ui primitives, hand-authored to match this repo's custom "radix-mira" style —
  `bunx shadcn add` hangs against this repo's registry; copy existing `components/ui/*`
  conventions instead (see the `shadcn` skill for the general add/search/compose workflow).
- react-hook-form + Zod, `@tabler/icons-react` (not lucide-react), Biome for lint/format
  (not ESLint).

## Architecture (page → view → pages-component)

```
app/(protected)/[feature]/page.tsx        (server component, no 'use client', no hooks)
  └─ renders  components/views/[feature]/[Feature]View.tsx   ('use client', holds hooks/state)
       └─ renders  components/pages/[feature]/*.tsx          (focused UI, receives props/callbacks)
```

```
src/
├── app/
│   ├── page.tsx                      ← Public landing page
│   ├── login/                        ← Only other public route
│   └── (protected)/[feature]/
│       ├── page.tsx                  ← Thin
│       ├── [id]/page.tsx             ← Nested detail route (static routes win over a
│       │                                sibling [dynamicSegment] at the same level)
│       ├── loading.tsx               ← Needed when the tree uses useSearchParams/nuqs
│       └── error.tsx                 ← 'use client' required
├── components/
│   ├── ui/                           ← shadcn primitives, hand-authored
│   ├── pages/[feature]/              ← Focused UI pieces (forms, cards, action rows)
│   └── views/[feature]/              ← Stateful client containers
├── lib/
│   ├── api/
│   │   ├── client.ts                 ← `api.get/post/put/patch/delete` + `ApiClientError`
│   │   ├── routes.ts                 ← `API_ROUTES` — lowercase nested object
│   │   └── [feature]/{fetchers,queries}.ts
│   ├── store/[feature]Store.ts       ← Zustand, UI state only, add when actually needed
│   └── Providers.tsx                 ← ALL providers live here, single entrypoint
├── hooks/use[Name].ts
└── types/[feature].ts                ← Zod schema + inferred type, per feature, no barrel
```

Full decision guide: the `structure-guard` skill. Data/fetch patterns: `client-data-state`.
Forms/dialogs/responsive layout: `ui-form-standards`. Any table/card-grid list page:
`data-table`.

## Non-negotiables

- No `"use server"` anywhere in `src` — the backend is a separate HTTP service.
- No axios, no raw `fetch()` in feature components/hooks — always `api.*` from `@/lib/api/client`.
- No `useState` + `useEffect` for server data — always `useQuery`/`useMutation`.
- No `router.refresh()` after a mutation — invalidate the query cache instead.
- No hardcoded endpoint strings outside `src/lib/api/routes.ts`.
- Zustand holds UI state only (modal open, selected row, active tab) — never server data.
- A queue/list page and its detail are separate views/routes — never an inline split-panel.

## Backend contract lookup (do this before writing a fetcher's types)

The backend publishes a generated, queryable contract for every route. Use it instead of
guessing a payload shape or recalling one from memory — a stale recollection here is exactly
the class of bug this exists to prevent:

```
bun run --cwd ../backend contract:query "<resource or search term>"     # e.g. "purchase order"
bun run --cwd ../backend contract:query "<METHOD> /api/<path>"          # full request/response/auth/pagination descriptor
```

`../backend/.contracts/api-manifest.json` is committed and CI fails if it is stale
(`contract:check`). A backend test also fails if any `API_ROUTES` path has no backend route
(`backend/tests/lib/frontend-routes-contract.test.ts`) — so add/rename paths here only to match
a real backend route.
These are **read-only** shell commands against the sibling backend package; never edit files
under `../backend` from this project.

Backend route paths follow its own convention (`/pr/getprs`, `/po/createpo`,
`/po/getpodetails/:id`, comma-separated `status` filters like `status=approved,partial_ordered`),
not generic REST nouns — never guess an alternate path.

## Hard-won gotchas (don't rediscover these)

- **`useEffect` + inline callback prop = infinite render loop.** A pattern like
  `useEffect(() => { onChange(x) }, [data, onChange])` where `onChange` is an inline arrow
  function (`(v) => setState(...)`) gets a new identity every render, so the effect re-fires
  every render, which re-renders the parent, forever (`Maximum update depth exceeded`). Fix:
  depend only on the primitive value that actually changed, and call the latest callback via
  a `useRef` (`const ref = useRef(onChange); ref.current = onChange; useEffect(() => { ref.current(x) }, [primitiveValue])`).
- **`components/ui/table.tsx`'s `Table` already wraps in `overflow-x-auto`** — never add a
  second scroll wrapper, and never skip it thinking a table is "simple enough" not to need it.
- **A custom `min-w-[...]` on `DialogContent` doesn't get clamped by the base `sm:max-w-sm`**
  — CSS spec guarantees `min-width` wins over a conflicting `max-width`, so a wide desktop
  modal with an explicit `min-w-[min(56rem,calc(100vw-2rem))]` still renders full-width on
  mobile-safe bounds via the base class's `max-w-[calc(100%-2rem)]`. This is intentional, not
  a bug to "fix" by removing the min-width.
- **List endpoints with a multi-status filter accept a comma-separated string, not an array
  param repeated.** Type the frontend param as `Status | Status[]` — the shared
  `toQueryString` helper's `String(value)` already comma-joins an array natively.
- **A static route and a sibling dynamic segment can coexist** (`purchase-orders/tracking/page.tsx`
  next to `purchase-orders/[prId]/page.tsx`) — Next.js resolves the static path first. No
  special-casing needed in the dynamic route's page.

## Agents & skills

Claude Code subagents live in [`.claude/agents/`](.claude/agents/README.md) — `ponytail`
(orchestrator), `nextjs-builder`/`nextjs-reviewer` (feature build/deep review), and the
`cavecrew-*` trio (fast locate/surgical-edit/quick-review). They exist only in this project
(not installed globally) and are scoped to never read or write outside this repository except
via the read-only backend contract-lookup commands above.

Skills live in [`.claude/skills/`](.claude/skills/): `structure-guard`, `client-data-state`,
`ui-form-standards`, `data-table`, `shadcn`, `karpathy-guidelines`, `pwa-runtime-ux` (shelved
— no PWA infra yet), and `cavecrew` (delegation decision guide).

Workflow-level agents and skills (`spec-analyst`, `test-writer`, `spec-reviewer`, `/spec`,
`/freeze`, `/slice`, `/bug`, `/wrap`) live in the repo-root `.claude/` — see `docs/WORKFLOW.md`.
