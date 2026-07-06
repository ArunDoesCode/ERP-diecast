# ERP Diecast Frontend Standards

> Stack: Next.js App Router | React 19 | TypeScript 5 | Tailwind CSS 4 | shadcn/ui (radix-mira)
> URL state: nuqs | Server state: TanStack Query | UI state: Zustand (when needed)
> Forms: React Hook Form + Zod | Toasts: Sonner
> HTTP: `api.*` wrapper from `src/lib/api/client.ts` (backend-first)
> Package manager: bun

This document is the repo-specific source of truth for `frontend/`.

## Core rules

1. Protected routes live under `src/app/(protected)/`.
2. Only unprotected route is `/login` (plus public landing page `/`).
3. Each page/feature gets its own API folder: `src/lib/api/[feature]/`.
4. API calls and TanStack hooks live in `src/lib/api/[feature]/queries.ts` and `fetchers.ts`.
5. Components are split page-wise under `src/components/pages/[feature]/`.
6. `page.tsx` renders a View in `src/components/views/[feature]/`.
7. View renders page components from `src/components/pages/[feature]/`.
8. All providers live in `src/lib/Providers.tsx`.

## Folder structure

```
frontend/
├── proxy.ts
├── src/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── login/
│   │   │   ├── page.tsx
│   │   │   └── loading.tsx
│   │   └── (protected)/
│   │       └── [feature]/
│   │           ├── page.tsx
│   │           ├── loading.tsx
│   │           └── error.tsx
│   ├── components/
│   │   ├── ui/
│   │   ├── pages/[feature]/
│   │   └── views/[feature]/
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts
│   │   │   ├── routes.ts
│   │   │   └── [feature]/
│   │   │       ├── fetchers.ts
│   │   │       └── queries.ts
│   │   ├── auth/token.ts
│   │   ├── store/[feature]Store.ts
│   │   ├── Providers.tsx
│   │   └── utils.ts
│   ├── hooks/use[Name].ts
│   └── types/[feature].ts
```

## Routing and protection

- Route group folders do not change URL paths.
- `src/app/(protected)/dashboard/page.tsx` maps to `/dashboard`.
- Route guard is implemented in `proxy.ts`.
- `proxy.ts` must protect all non-public routes, not just one hardcoded prefix.

Use allowlist-style public routes:

```ts
const PUBLIC_PATHS = ["/", "/login"];
```

Everything else is treated as protected unless explicitly excluded.

## Page -> View -> Page components

Use this pattern for every feature route:

```tsx
// src/app/(protected)/feature/page.tsx
import { FeatureView } from "@/components/views/feature/FeatureView";

export default function FeaturePage() {
  return <FeatureView />;
}
```

```tsx
// src/components/views/feature/FeatureView.tsx
"use client";
// hooks, query calls, mutations, local UI state
// render focused UI pieces from components/pages/feature
```

```tsx
// src/components/pages/feature/FeatureForm.tsx
"use client";
// focused form/widget only
```

## API client standard

Always call backend through `api.*` from `src/lib/api/client.ts`.

```ts
import { api } from "@/lib/api/client";

await api.get<T>("/path");
await api.post<T, B>("/path", body);
await api.patch<T, B>("/path", body);
```

Rules:

- No axios.
- No raw `fetch()` in feature components/hooks.
- Use `API_ROUTES` constants from `src/lib/api/routes.ts`.
- Keep route constants in lowercase nested shape (`API_ROUTES.auth.login`).

## Feature API folder pattern

Each page/feature gets one API folder:

```
src/lib/api/[feature]/
├── fetchers.ts   // raw async calls via api.*
└── queries.ts    // useQuery/useMutation hooks + keys
```

Example:

```ts
// fetchers.ts
import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";

export function getMe() {
  return api.get<MeResponse>(API_ROUTES.auth.me);
}
```

```ts
// queries.ts
export const authKeys = { me: () => ["auth", "me"] as const };
```

## TanStack Query rules

- Use `useQuery` / `useMutation` for all server state.
- Do not use `useState + useEffect` to fetch server data.
- Invalidate by key factory after mutations.
- Do not call `router.refresh()` to sync mutation results.
- Toasts for mutation success/error belong in mutation hooks (`queries.ts`).

## Forms standard

Forms use React Hook Form + Zod + shadcn form primitives.

- Schema + inferred type live in `src/types/[feature].ts`.
- Form UI lives in `src/components/pages/[feature]/`.
- Submit calls feature mutation from `src/lib/api/[feature]/queries.ts`.
- Button disabled state uses mutation `isPending`.

Example schema location:

```ts
// src/types/auth.ts
export const loginSchema = z.object({ ... });
export type LoginInput = z.infer<typeof loginSchema>;
```

## Zustand usage

Zustand is available, but optional.

Use it only for shared UI state such as:

- modal open/close state
- selected row/entity across sibling components
- local UI wizard step

Do not use Zustand for:

- server data from backend
- access token/session payload
- data already represented in URL state (nuqs)

## nuqs usage

nuqs is active via `NuqsAdapter` in `src/lib/Providers.tsx`.

Use for shareable URL state (filters/pagination/search params).

- Reset offset/page when filters change.
- Use typed parsers where needed.

## Providers

All global providers belong to `src/lib/Providers.tsx`.

Current expected content:

- `NuqsAdapter`
- `QueryClientProvider`
- `Toaster`

Do not create extra provider wrappers in route segments.

## UI and icons

- shadcn components in `src/components/ui/`.
- `components.json` uses `iconLibrary: "tabler"`.
- Prefer `@tabler/icons-react` for icons.
- `cn()` utility comes from `src/lib/utils.ts`.

## What does not exist in this repo

Do not write standards that assume:

- monorepo `packages/validators` or `packages/types`
- `@diecastos/*` imports
- server actions as core feature path
- PWA runtime infra (manifest/service worker/next-pwa)

PWA skill is shelved until explicitly requested.

## Reference implementations in repo

- Login chain:
  - `src/app/login/page.tsx`
  - `src/components/views/login/LoginView.tsx`
  - `src/components/pages/login/LoginForm.tsx`
  - `src/lib/api/auth/{fetchers,queries}.ts`
  - `src/types/auth.ts`

- Dashboard chain:
  - `src/app/(protected)/dashboard/page.tsx`
  - `src/components/views/dashboard/DashboardView.tsx`
  - `src/components/pages/dashboard/DashboardActions.tsx`
  - `src/lib/api/files/{fetchers,queries}.ts`

- Route protection:
  - `proxy.ts`
