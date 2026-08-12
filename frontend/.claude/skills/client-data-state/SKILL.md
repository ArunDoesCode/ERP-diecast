---
name: client-data-state
description: "Use when fetching data, writing a mutation, designing a Zustand store, wiring TanStack Query, writing fetchers or query hooks, using api.get/post/patch/delete, handling useQuery/useMutation/invalidateQueries, or deciding between server state and UI state. Triggers: fetch, mutation, zustand, store, state management, tanstack query, useQuery, useMutation, queryKey, fetcher, api.get, api.post, invalidate, data function, client data, read data, write data, delete, update record. DO NOT USE for UI styling, folder structure, or form layout."
---

# Client Data & State

Full conventions in **[CLAUDE.md](../../../CLAUDE.md)** (repo root). This skill adds repo-specific patterns for
`frontend/` — a standalone Next.js app talking to a separate backend over HTTP only.

## Owns

- Single frontend data path: `api.*` from `@/lib/api/client`
- `lib/api/[feature]/fetchers.ts` and `queries.ts` design
- TanStack Query hooks, query key factories, `initialData` pattern
- Zustand store structure — UI state only, added only when actually needed
- Cache invalidation after mutations
- Toast placement (mutation `onSuccess`/`onError`)

## Never Touches

- Form field wiring / JSX → `ui-form-standards`
- File placement → `structure-guard`
- PWA / offline behavior → `pwa-runtime-ux` (shelved — no PWA infra in repo yet)

## ⚠️ Critical Rules

| Rule                                           | Detail                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| No `"use server"`                              | Backend is a separate service. Frontend only calls it over HTTP via `api.*`.   |
| No axios, no raw `fetch()` in components/hooks | Always `api.get/post/put/patch/delete` from `@/lib/api/client`.                |
| No `useState` + `useEffect` for server data    | Always `useQuery` / `useMutation`.                                             |
| No `router.refresh()` after mutations          | Invalidate the TanStack Query cache instead.                                   |
| Zustand = UI state only                        | Modals, selections, active tabs. Never server data. Don't create a store       |
|                                                 | until a feature actually needs cross-component UI state.                       |
| Errors are always `ApiClientError`             | `import { ApiClientError } from "@/lib/api/client"` — check with `instanceof`. |
| `useEffect` deps must be primitives when syncing an async result into local state | An inline callback prop (`onChange={(v) => setX(v)}`) gets a new identity every render — depending on it directly re-fires the effect every render and can infinite-loop. Depend on the primitive value instead (e.g. `data?.ratePaise`), and call the latest callback via a `useRef`. |

## Real API Client Shape (this repo)

`src/lib/api/client.ts` exports an `api` object, not a single `apiRequest` function:

```ts
export const api = {
  get: <T>(path: string, options?: RequestOptions) => ...,
  post: <T, B = unknown>(path: string, body?: B, options?: RequestOptions) => ...,
  put: <T, B = unknown>(path: string, body?: B, options?: RequestOptions) => ...,
  patch: <T, B = unknown>(path: string, body?: B, options?: RequestOptions) => ...,
  delete: <T, B = unknown>(path: string, body?: B, options?: RequestOptions) => ...,
};

export class ApiClientError extends Error {
  status: number;
}
```

`RequestOptions` supports `{ headers?, skipAuth? }`. Pass `{ skipAuth: true }` for endpoints
called before a token exists (e.g. login). `delete` accepts an optional body — some endpoints
double as "discard" (no body/reason) and "cancel" (mandatory `reason`) depending on document state.

`src/lib/api/routes.ts` is a **lowercase nested object**, not `SCREAMING_CASE.FEATURE.ACTION`:

```ts
export const API_ROUTES = {
  auth: { login: "/auth/login", me: "/auth/me", logout: "/auth/logout" },
  purchaseOrders: {
    list: "/po/getpos",
    detail: (poId: number) => `/po/getpodetails/${poId}`,
    create: "/po/createpo",
    update: "/po/updatepo",
    remove: (poId: number) => `/po/deletepo/${poId}`,
  },
} as const;
```

## Backend Contract Lookup (do this before writing a fetcher's types)

The backend generates a queryable contract for every route — use it instead of guessing field names/types or copying an old fetcher's shape from memory:

```
bun run --cwd ../backend contract:query "<resource or search term>"     # list matching routes + summaries
bun run --cwd ../backend contract:query "<METHOD> /api/<path>"          # full descriptor: request/response schema, auth, pagination
```

If the manifest is missing or looks stale, run `bun run --cwd ../backend contract:generate` first (it's generated on demand, not committed — lives at `../backend/.contracts/api-manifest.json`). Base the fetcher's generic type args and the response type on what the descriptor actually says — a mismatch here is exactly the class of bug this lookup exists to prevent. These are **read-only** shell commands against the sibling backend package; never edit files under `../backend`.

## Fetcher Pattern

Raw async functions in `lib/api/[feature]/fetchers.ts`. No directive, no hooks:

```ts
// lib/api/auth/fetchers.ts
import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";
import type { LoginInput } from "@/types/auth";

// Two-shape response: success carries data, failure carries a message.
// Backend returns HTTP 200 for both, so the mutation must branch on `success`.
export type LoginResponse =
  | {
      success: true;
      message?: string;
      data: {
        accessToken: string;
        user: { id: string; email: string; role: string };
      };
    }
  | { success: false; message: string; data?: null };

export function login(input: LoginInput) {
  return api.post<LoginResponse, LoginInput>(API_ROUTES.auth.login, input, {
    skipAuth: true,
  });
}

export function getMe() {
  return api.get<MeResponse>(API_ROUTES.auth.me);
}
```

## TanStack Query Hooks Pattern

```ts
// lib/api/auth/queries.ts
"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiClientError } from "@/lib/api/client";
import type { LoginInput } from "@/types/auth";
import { getMe, login, logout } from "./fetchers";

// Query key factory — one place, predictable invalidation
export const authKeys = {
  me: () => ["auth", "me"] as const,
};

export function useMeQuery(enabled: boolean) {
  return useQuery({ queryKey: authKeys.me(), queryFn: getMe, enabled });
}

export function useLoginMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: LoginInput) => login(payload),
    onSuccess: async (result) => {
      // Backend may return HTTP 200 with { success: false, message }
      if (!result.success) {
        toast.error(result.message || "Login failed");
        return;
      }

      setAccessToken(result.data.accessToken);
      await queryClient.invalidateQueries({ queryKey: authKeys.me() });
      toast.success(result.message || "Signed in");
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiClientError ? error.message : "Login failed",
      );
    },
  });
}
```

See real implementation: `src/lib/api/auth/{fetchers,queries}.ts`,
`src/lib/api/purchase-orders/{fetchers,queries}.ts`, and
`src/lib/api/purchase-requisitions/{fetchers,queries}.ts`.

### List params with array-valued filters

A list endpoint that accepts a comma-separated `status` filter (e.g. `status=approved,partial_ordered`)
just needs the param typed as `Status | Status[]` — the shared `toQueryString` helper's
`String(value)` already comma-joins arrays natively, no special-casing needed in the fetcher.

## SSR + initialData Pattern

Use when a `page.tsx` fetches data server-side and needs to hand it to a client View
without a loading flash:

```tsx
// page.tsx — server component
const jobs = await getJobs({ status: "in_production" });
return <FeatureView initialJobs={jobs} />;

// FeatureView.tsx — 'use client'
const { data: jobs = initialJobs } = useJobs(
  { status: "in_production" },
  { initialData: initialJobs },
);
```

Not every page needs this — most feature pages in this repo are pure CSR (no SSR fetch) because
there's nothing worth prefetching server-side yet. Add `initialData` once a feature's `page.tsx`
starts fetching data server-side.

## Zustand — UI State Only

`zustand` is a dependency, but **do not scaffold an empty store**. Add
`lib/store/[feature]Store.ts` only when a feature actually needs state shared across
components that TanStack Query / nuqs / local `useState` can't cover (e.g. a selected row
that both a table and a side panel need to read).

```ts
// lib/store/[feature]Store.ts
import { create } from "zustand";

interface FeatureStore {
  selectedId: string | null;
  select: (id: string) => void;
  clear: () => void;
}

export const useFeatureStore = create<FeatureStore>((set) => ({
  selectedId: null,
  select: (id) => set({ selectedId: id }),
  clear: () => set({ selectedId: null }),
}));
```

- Never store query results here — that's TanStack Query's job.
- Always include a clear/reset action.
- `useAuthSessionStore` (role, userId, hasHydrated) is the existing example — reuse it for
  role-gating UI (e.g. hiding a nav link a role's backend calls would 403 on) rather than
  inventing a new session store.

## URL State (nuqs)

nuqs **is** used in this repo (`NuqsAdapter` wired in `src/lib/Providers.tsx`). Use
`useQueryState` for filters/pagination that should survive a refresh or be shareable via URL.
Always `shallow: false` when the value should trigger an SSR re-render, always reset
pagination offset to `0` when a filter changes. Plain `useState`-backed list-controls hooks
(see `use-po-queue-controls.ts`) are also an accepted pattern for filters that don't need to
survive a refresh — don't force nuqs where a local hook already does the job.

## State Placement Decision

| State type                             | Where                                                           |
| --------------------------------------- | ---------------------------------------------------------------- |
| Transient form field                   | Local `useState` / RHF field state                              |
| Server data (any async fetch)          | `useQuery`                                                      |
| Mutation loading state                 | `isPending` from `useMutation`                                  |
| Open modal / selected row / active tab | Zustand store (only if genuinely shared)                        |
| URL filter / pagination                | `useQueryState` from `nuqs`, or a local list-controls hook       |
| Access token                           | `src/lib/auth/token.ts` (localStorage + cookie) — never Zustand |
| Auth role / session identity           | `useAuthSessionStore` — never re-derive from a JWT decode in a component |

## Handoff

- Data function + hook written → `ui-form-standards` to wire into a form.
- File placement → `structure-guard`.
