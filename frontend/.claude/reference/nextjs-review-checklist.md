# Next.js review checklist (frontend/src)

Reference doc, not an agent. Read by the pipeline agent `code-reviewer` (and `performance-auditor` for the
render/performance sections) when a diff touches `frontend/`. Converted from the retired `nextjs-reviewer`
agent on 2026-11-18 (workflow v2, 0.7); the checks are unchanged. Order of concern: correctness risks
first, then performance/render risks, then optimization suggestions. Severity mapping to the pipeline
protocol: High → blocker, Medium → major, Low → minor. `CLAUDE.md` below means `frontend/CLAUDE.md`.

## Scope boundary

Review only within this `frontend/` repository. If a finding actually traces to a backend contract mismatch, name it and note that the backend side is out of your scope — don't attempt to inspect `../backend` source.

## Next.js version facts

`frontend/CLAUDE.md` lists confirmed Next.js 16 breaking changes for this codebase
(async `params`/`searchParams`, `proxy.ts` vs `middleware.ts`, `loading.tsx`'s auto-Suspense
requirement, etc.) — check reviewed code against it. You're read-only, so if you spot a
version-specific issue not yet listed there, call it out in your findings so the caller can
add it rather than adding it yourself.

## Scope

- Focus on `src` code paths only.
- Review by layer: page → view → pages-component → fetchers → queries → store.
- Prioritize behavioral bugs, data-flow contract drift, and security before style.
- Reviewing a table/card-grid list page? Load the `data-table` skill first — it defines the
  `DataTable`/`DataTableColumnHeader`/`DataTablePagination` (or card-grid pagination) reuse
  contract this section checks against.
- Reviewing forms, dialogs, or layout? Load `ui-form-standards` first for the responsive and
  confirm-dialog conventions this section checks against.

## Critical Violations (High)

- Direct Supabase feature-data query inside a frontend feature module.
- Raw `fetch()` or `axios` in feature components/hooks instead of `api.*` from `@/lib/api/client`.
- `"use server"` directive in a feature file.
- Server data fetched via `useState` + `useEffect` instead of TanStack Query.
- `router.refresh()` used to sync data after a mutation instead of query invalidation.
- Hardcoded endpoint strings outside `src/lib/api/routes.ts`.
- Protected feature placed outside `src/app/(protected)/`, or auth-only data reachable on a public route.
- Secrets/tokens read or logged in client components.
- Missing/incorrect key-factory query keys causing stale or cross-feature cache collisions.
- Unhandled mutation error path (no `onError`, silent failure, no user feedback).
- `onSuccess` not branching on `result.success`: a 200 `{ success: false, message }` response runs success side-effects (e.g. sets token) instead of toasting `result.message` and returning.
- A sortable column's id doesn't match the backend's `sortBy` whitelist verbatim (manual
  sorting sends `sorting[0].id` straight to the API — mismatch silently sorts nothing or 400s).
- A table/list page hardcodes rows or has no pagination + skeleton + real fetch.
- A `useEffect` depends on an inline callback prop or a freshly-recomputed object/array whose
  identity changes every render, and that effect's body calls that callback — this re-fires on
  every render and either loops (`Maximum update depth exceeded`) or masks a subtler stale-closure
  bug. Correct pattern: depend on the primitive value that actually changed; hold the callback in
  a `useRef` and call `ref.current(...)`.
- A list endpoint's array-valued filter (e.g. `status`) is typed as a single value when the
  backend accepts a comma-separated list — silently drops the ability to query the multi-status
  "active" states a tracking/queue screen needs.

## Architecture Violations (Medium)

- Page not thin: business/data logic in `page.tsx` instead of the View.
- Page → View → pages-component pattern bypassed (View missing, or page importing leaf components directly).
- A list/queue page grown into an inline split-panel (list + detail in one view) instead of a nested detail route — couples two independently-scoped concerns and blocks deep-linking to a single record.
- Fetchers/queries not colocated under `src/lib/api/[feature]/`.
- Zustand store holding server state that belongs in TanStack Query cache.
- Zod schema/type defined outside `src/types/[feature].ts` or duplicated.
- Provider added outside `src/lib/Providers.tsx`.
- `any` types leaking across component/hook/fetcher boundaries.
- Invalidation using ad-hoc string keys instead of the feature key factory.
- A mutation invalidates its own list/detail query but misses a cache a sibling view depends on (e.g. submitting a PO for approval should invalidate both the approval queue and the PR/PO detail views that render its status).
- Form fields using a floating label, or a label not tied to its input with `htmlFor`, or `FormItem` missing `min-h-19` spacing.
- A destructive/irreversible action (discard, cancel, delete) wired to a plain `Dialog`/`onClick` instead of `AlertDialog`.
- Table/list page duplicates `<TableHeader>`/`<TableBody>`/skeleton JSX instead of reusing
  shared `DataTable`/`DataTableColumnHeader`/`DataTablePagination` (`components/common/`), or a
  card-grid page forks its own pagination bar instead of reusing the existing one.
- Fetcher/nuqs logic baked directly into a generic table component instead of staying in
  the feature's own `lib/api/[feature]/` + table component (see `data-table` skill).
- Table pagination faked client-side (`getPaginationRowModel`) against an endpoint that
  actually supports server-side `page`/`pageSize` params — should be `manualPagination`.

## Performance / Render Review Checks (Medium)

- Waterfall requests: dependent `useQuery` chains that could be parallel or prefetched.
- Missing `enabled` guard causing queries to fire with undefined params.
- Over-broad invalidation refetching unrelated queries.
- Unstable objects/functions passed as props/deps causing avoidable re-renders (missing `useMemo`/`useCallback` only where it matters).
- Large client bundle from importing server-only or heavy libs into `'use client'` trees.
- List rendering without stable keys or without pagination/virtualization on large sets.
- Unbounded list fetch (no limit/pagination) driving a single screen.
- Expensive derivation in render instead of memoized selector.
- `staleTime`/`gcTime` defaults causing chatty refetch for stable data.
- N+1 per-row queries (e.g. a rate/price lookup fired once per list line) where a single
  batched fetch (e.g. the supplier's full item list) could resolve most rows without a request each.

## Responsiveness Review Checks (Medium)

- Wide table not wrapped in a horizontally-scrollable container (check whether `components/ui/table.tsx`'s built-in `overflow-x-auto` wrapper was bypassed).
- Modal/dialog content that doesn't collapse to a single column below `md`, or a fixed pixel width that can overflow a small viewport.
- A page's heading/title rendered after its filter controls in DOM order, so it reads out of order once the layout stacks on mobile (`flex-col` breakpoints put later elements second).
- Card grids or filter bars missing the repo's standard breakpoints (`sm:flex-row`, `sm:grid-cols-2 xl:grid-cols-3`, etc.) — check against `ui-form-standards`' responsive conventions.

## Performance Optimization Suggestions (Low)

When you find a perf/render issue, include:

1. current bottleneck pattern
2. concrete optimization
3. expected impact (re-renders, request count, bundle size, latency)
4. trade-off/risk

Prefer:

- Parallelize independent queries; prefetch on the server/View boundary where possible.
- Add `enabled` guards and precise query keys.
- Narrow invalidation to affected key subtrees.
- Memoize only proven-hot derivations/selectors.
- Add pagination/limit + stable keys for large lists.
- Tune `staleTime`/`gcTime` when data staleness is acceptable.
- Keep heavy deps out of client bundles; lazy-load where staleness/UX allows.

## Per finding, always give

- file and line
- problem
- why it matters
- precise fix pattern
