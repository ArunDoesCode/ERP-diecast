---
name: client-data-state
description: "Use when fetching data, writing a mutation, designing a Zustand store, wiring TanStack Query, writing fetchers or query hooks, using api.get/post/patch/delete, handling useQuery/useMutation/invalidateQueries, or deciding between server state and UI state. Triggers: fetch, mutation, zustand, store, state management, tanstack query, useQuery, useMutation, queryKey, fetcher, api.get, api.post, invalidate, data function, client data, read data, write data, delete, update record. DO NOT USE for UI styling, folder structure, or form layout."
argument-hint: "Describe the data operation or state shape you need to implement."
---

# Client Data & State

Full conventions in **[nextjs.md](../../../nextjs.md)**. This skill adds repo-specific patterns for
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

| Rule                                          | Detail                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------- |
| No `"use server"`                              | Backend is a separate service. Frontend only calls it over HTTP via `api.*`. |
| No axios, no raw `fetch()` in components/hooks | Always `api.get/post/put/patch/delete` from `@/lib/api/client`.             |
| No `useState` + `useEffect` for server data     | Always `useQuery` / `useMutation`.                                          |
| No `router.refresh()` after mutations           | Invalidate the TanStack Query cache instead.                                |
| Zustand = UI state only                        | Modals, selections, active tabs. Never server data. Don't create a store    |
|                                                 | until a feature actually needs cross-component UI state.                    |
| Errors are always `ApiClientError`              | `import { ApiClientError } from "@/lib/api/client"` — check with `instanceof`. |

## Real API Client Shape (this repo)

`src/lib/api/client.ts` exports an `api` object, not a single `apiRequest` function:

```ts
export const api = {
  get: <T>(path: string, options?: RequestOptions) => ...,
  post: <T, B = unknown>(path: string, body?: B, options?: RequestOptions) => ...,
  put: <T, B = unknown>(path: string, body?: B, options?: RequestOptions) => ...,
  patch: <T, B = unknown>(path: string, body?: B, options?: RequestOptions) => ...,
  delete: <T>(path: string, options?: RequestOptions) => ...,
};

export class ApiClientError extends Error {
  status: number;
}
```

`RequestOptions` supports `{ headers?, skipAuth? }`. Pass `{ skipAuth: true }` for endpoints
called before a token exists (e.g. login).

`src/lib/api/routes.ts` is a **lowercase nested object**, not `SCREAMING_CASE.FEATURE.ACTION`:

```ts
export const API_ROUTES = {
  auth: { login: "/auth/login", me: "/auth/me", logout: "/auth/logout" },
  files: { presign: "/files/presign" },
} as const;
```

## Fetcher Pattern

Raw async functions in `lib/api/[feature]/fetchers.ts`. No directive, no hooks:

```ts
// lib/api/auth/fetchers.ts
import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";
import type { LoginInput } from "@/types/auth";

export type LoginResponse = {
  success: true;
  data: { accessToken: string; user: { id: string; email: string; role: string } };
};

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
      setAccessToken(result.data.accessToken);
      await queryClient.invalidateQueries({ queryKey: authKeys.me() });
      toast.success("Signed in");
    },
    onError: (error) => {
      toast.error(error instanceof ApiClientError ? error.message : "Login failed");
    },
  });
}
```

See real implementation: `src/lib/api/auth/{fetchers,queries}.ts` and
`src/lib/api/files/{fetchers,queries}.ts`.

## SSR + initialData Pattern

Use when a `page.tsx` fetches data server-side and needs to hand it to a client View
without a loading flash:

```tsx
// page.tsx — server component
const jobs = await getJobs({ status: "in_production" });
return <FeatureView initialJobs={jobs} />;

// FeatureView.tsx — 'use client'
const { data: jobs = initialJobs } = useJobs({ status: "in_production" }, { initialData: initialJobs });
```

Not every page needs this — `/login` and `/dashboard` in this repo are pure CSR (no SSR fetch)
because there's nothing to prefetch server-side yet. Add `initialData` once a feature's
`page.tsx` starts fetching data server-side.

## Zustand — UI State Only

Install is done (`zustand` is a dependency), but **do not scaffold an empty store**. Add
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

## URL State (nuqs)

nuqs **is** used in this repo (`NuqsAdapter` wired in `src/lib/Providers.tsx`). Use
`useQueryState` for filters/pagination that should survive a refresh or be shareable via URL.
Always `shallow: false` when the value should trigger an SSR re-render, always reset
pagination offset to `0` when a filter changes.

## State Placement Decision

| State type                             | Where                          |
| ----------------------------------------- | --------------------------------- |
| Transient form field                   | Local `useState` / RHF field state |
| Server data (any async fetch)          | `useQuery`                       |
| Mutation loading state                 | `isPending` from `useMutation`   |
| Open modal / selected row / active tab | Zustand store (only if genuinely shared) |
| URL filter / pagination                | `useQueryState` from `nuqs`      |
| Access token                           | `src/lib/auth/token.ts` (localStorage + cookie) — never Zustand |

## Handoff

- Data function + hook written → `ui-form-standards` to wire into a form.
- File placement → `structure-guard`.
