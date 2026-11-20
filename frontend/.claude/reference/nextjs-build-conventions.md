# Next.js build conventions (frontend/src)

Reference doc, not an agent. Read by the pipeline agent `frontend-dev` (and by `/slice`, `/bug`) before
writing frontend code. Converted from the retired `nextjs-builder` agent on 2026-11-18 (workflow v2, 0.7);
the conventions are unchanged. `CLAUDE.md` below means `frontend/CLAUDE.md`.

## Scope boundary

Work only within this `frontend/` repository (this directory and its subtree) — never read or write files under `../backend` or any sibling project. The one exception is running `bun run --cwd ../backend contract:query`/`contract:generate` via `Bash`, which is a **read-only** contract lookup against the sibling backend package, not a file edit — do that, never touch backend source directly. If a task genuinely requires a backend change, say so and stop; that belongs to `backend-dev`.

## Next.js version facts

Read `frontend/CLAUDE.md` before writing any App Router code — it has a distilled,
confirmed list of Next.js 16 breaking changes that actually apply to this codebase
(async `params`/`searchParams`, `proxy.ts`, `loading.tsx`'s auto-Suspense, etc.), sourced
from `node_modules/next/dist/docs/`. If a feature you build surfaces a new Next.js
version-specific fact/gotcha not already listed there, add a one-line bullet to `CLAUDE.md`
— don't leave it undocumented for the next session to rediscover.

## Scope

- Implement the requested feature/code change with minimal diff.
- Keep existing architecture, naming, and folder conventions from `CLAUDE.md` / `structure-guard`.
- No broad rewrites unless the user asks.

## Hard Boundaries

- NO `"use server"` directives in feature files.
- NO axios.
- NO direct Supabase feature-data queries in frontend modules.
- NO raw `fetch()` in feature components/hooks.
- NO `useState` + `useEffect` for server data fetching.
- NO `router.refresh()` after mutations.
- NO hardcoded endpoint strings outside `src/lib/api/routes.ts`.
- NO `useEffect` that depends on an inline callback prop (new identity every render) to sync
  an async result into state — depend on the primitive value and call the callback via a
  `useRef`, or it infinite-loops (`Maximum update depth exceeded`).

## Repo-specific Rules

- Protected routes live in `src/app/(protected)/`.
- Only unprotected route is `/login` (plus public `/`).
- Each page/feature gets its own API folder:
  - `src/lib/api/[feature]/fetchers.ts`
  - `src/lib/api/[feature]/queries.ts`
- Page flow:
  - `page.tsx` (thin) → View in `src/components/views/[feature]/` → page components in `src/components/pages/[feature]/`.
- A queue/list page and its detail view are **separate** views/routes — don't grow a list page
  into an inline split-panel; add a nested route (`[id]/page.tsx`, or a static sibling like
  `tracking/page.tsx` alongside a `[dynamicSegment]` — Next.js resolves the static path first).
- All providers stay in `src/lib/Providers.tsx`.
- Zod schemas and inferred types live in `src/types/[feature].ts` (no `packages/validators`).
- API client is `api.*` from `@/lib/api/client` (`get/post/put/patch/delete`) with `ApiClientError`.

## Skills — Load ONE Primary Per Request

| Request type                                | Primary skill       | Add second only if                                      |
| -------------------------------------------- | -------------------- | ---------------------------------------------------------- |
| File/folder placement                        | `structure-guard`    | —                                                          |
| Form, toast, UI styling, dialogs             | `ui-form-standards`  | Placement unclear → `structure-guard`                     |
| Data fetch, mutation, store, TanStack Query   | `client-data-state`  | Form also involved → `ui-form-standards`                  |
| Table, card-grid list page, pagination, sort  | `data-table`         | Fetcher/query design also needed → `client-data-state`    |
| PWA runtime/offline behavior                  | `pwa-runtime-ux`     | Only if the user explicitly asks for PWA setup            |
| shadcn component add/fix/style/compose        | `shadcn`             | Form involved → `ui-form-standards`                       |

## Backend Contract Lookup (mandatory, before writing types/fetchers)

The backend publishes a generated contract for every route — query it instead of guessing or recalling a prior session's payload shape. Never hand-derive a request/response type from memory when the backend can tell you directly.

```
bun run --cwd ../backend contract:query "<resource or search term>"     # e.g. "purchase order" — lists matching routes + one-line summaries
bun run --cwd ../backend contract:query "<METHOD> /api/<path>"          # e.g. "POST /api/pr/createpr" — full descriptor: request/response schema, auth roles, pagination fields
```

The manifest `../backend/.contracts/api-manifest.json` is committed and checked in CI (`contract:check`). If it looks stale (backend changed recently), `bun run --cwd ../backend contract:generate` refreshes it — in a pipeline run the run's `contract.md` and the committed manifest are the input; a missing endpoint means BLOCKED, not guessing.

Use the queried descriptor to write `src/types/[feature].ts` and the fetcher's generic type args in step 1 and 3 below — don't invent field names/types that aren't in the descriptor. Route paths follow this backend's own convention (`/pr/getprs`, `/po/createpo`, comma-separated `status` filters, etc.), not generic REST nouns — never guess an alternate path.

## Implementation Order Per Feature

0. Query the backend contract (above) for every endpoint this feature touches.
1. Define schema/type in `src/types/[feature].ts` (Zod + inferred TS type, or plain TS type mirroring the contract).
2. Add route constants in `src/lib/api/routes.ts` if missing.
3. Add fetchers in `src/lib/api/[feature]/fetchers.ts` via `api.*` only.
4. Add query hooks + key factory in `src/lib/api/[feature]/queries.ts`.
5. Add a Zustand store in `src/lib/store/[feature]Store.ts` only if genuinely needed.
6. Add focused UI components in `src/components/pages/[feature]/`.
7. Add a View in `src/components/views/[feature]/[Feature]View.tsx` (`'use client'`).
8. Keep the page thin in `src/app/(protected)/[feature]/page.tsx` (or a nested `[id]/page.tsx`).
9. Add `loading.tsx` and `error.tsx` for new protected route pages (only `loading.tsx` when the tree uses `useSearchParams`/nuqs and needs the auto-Suspense boundary).

## Quality Gates Before Finishing

- [ ] Request/response types in `src/types/[feature].ts` match the backend contract from `bun run --cwd ../backend contract:query`, not guessed/recalled
- [ ] No `"use server"` in new files
- [ ] No axios and no raw `fetch()` in feature code
- [ ] API calls use `api.*` + `API_ROUTES`
- [ ] No `useState` + `useEffect` for server data
- [ ] Mutations expose/use `isPending` for submit disable state
- [ ] Toasts handled in `useMutation` `onSuccess`/`onError`
- [ ] `onSuccess` branches on `result.success` (200 + `{ success: false, message }`) and toasts `result.message`
- [ ] Form fields: label above (`FormLabel`/`Label` with `htmlFor` = input `id`), no floating labels; every `FormItem` has `min-h-19`
- [ ] Any table/list page has pagination, a loading skeleton, and real data fetching
      (`data-table` skill) — reuses `DataTable`/`DataTableColumnHeader`/`DataTablePagination` or
      the card-grid pagination equivalent, no hand-rolled table/skeleton markup
- [ ] Query keys use feature key factory (no ad-hoc strings)
- [ ] Invalidation uses key factory
- [ ] New route pages follow page → view → pages-component pattern
- [ ] `src/lib/Providers.tsx` remains single provider entrypoint
- [ ] `npx tsc --noEmit -p .` and `npx biome check <touched files>` both clean
