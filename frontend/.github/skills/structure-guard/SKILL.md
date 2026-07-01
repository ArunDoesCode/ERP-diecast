---
name: structure-guard
description: "Use when deciding where to place a file, naming a component or hook, organizing imports, setting up a new route, understanding the page-to-view pattern, typing a barrel export, or checking folder conventions. Triggers: where to put, which folder, file placement, move file, route layout, naming convention, import order, types barrel, page structure, folder structure, queries.ts, fetchers.ts, views, pages component, store placement. DO NOT USE for form logic, state management, or data fetching."
argument-hint: "Describe the file you need to place or the naming decision you need to make."
---

# Structure Guard

Full conventions in **[nextjs.md](../../../nextjs.md)**. This skill is a decision guide for the
`frontend/` repo — a standalone Next.js app (no monorepo, no `packages/*`).

## Owns

- File placement decisions (which folder, which subfolder)
- Route group layout — `(protected)` vs public routes
- Page → View → Pages-component pattern enforcement
- Component, hook, store, type, fetcher, query naming
- Import order and path alias usage
- `src/types/` shape (flat, per-feature files — not a monorepo barrel)

## Never Touches

- Form or validation logic → `ui-form-standards`
- Data fetching, store implementation → `client-data-state`
- PWA shell, manifest, offline behavior → `pwa-runtime-ux` (currently shelved)

## Repo Reality Check

| Skill docs elsewhere may assume...      | This repo actually has...                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| `packages/validators`, `packages/types`  | **Does not exist.** Zod schemas + types live in `src/types/[feature].ts`.               |
| `lib/api/client.ts` exports `apiFetch`   | Exports `api.get/post/put/patch/delete` + `ApiClientError` (see `client-data-state`).   |
| `middleware.ts`                          | `proxy.ts` at repo root (Next.js 16 renamed this).                                      |
| Route groups `(auth)` / `(dashboard)`    | Single group: `app/(protected)/`. Only unprotected route is `/login` (+ public `/`).    |
| `lucide-react` icons                     | `@tabler/icons-react` (`components.json` → `iconLibrary: "tabler"`).                    |
| `lib/hooks/use[Name].ts`                 | `src/hooks/use[Name].ts` — `components.json` already aliases `hooks: "@/hooks"`.        |

## Folder Map (actual)

```
frontend/
├── proxy.ts                              ← Route guard, protects everything except PUBLIC_PATHS
├── src/
│   ├── app/
│   │   ├── page.tsx                      ← Public landing page
│   │   ├── login/                        ← Only other public route
│   │   │   ├── page.tsx                  ← Thin — renders LoginView
│   │   │   └── loading.tsx
│   │   └── (protected)/
│   │       └── [feature]/
│   │           ├── page.tsx              ← Thin — renders [Feature]View
│   │           ├── loading.tsx           ← Always provide a skeleton
│   │           └── error.tsx             ← 'use client' required
│   ├── components/
│   │   ├── ui/                           ← shadcn primitives — hand-authored to match
│   │   │                                    existing style (`bunx shadcn add` hangs on
│   │   │                                    this repo's custom "radix-mira" style —
│   │   │                                    don't rely on the CLI, copy conventions
│   │   │                                    from existing files instead)
│   │   ├── pages/[feature]/              ← Focused UI pieces for one page (forms, actions)
│   │   └── views/[feature]/              ← Stateful client containers ('use client')
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts                 ← `api.*` wrapper + `ApiClientError`
│   │   │   ├── routes.ts                 ← `API_ROUTES` — lowercase nested object
│   │   │   └── [feature]/
│   │   │       ├── fetchers.ts           ← Raw async via `api.*` (queryFn/mutationFn targets)
│   │   │       └── queries.ts            ← TanStack hooks + query key factory + toasts
│   │   ├── auth/token.ts                 ← Access token (localStorage + cookie) helpers
│   │   ├── store/[feature]Store.ts       ← Zustand — UI state only, add when actually needed
│   │   ├── Providers.tsx                 ← ALL providers live here (QueryClient, Nuqs, Toaster)
│   │   └── utils.ts                      ← cn() + shared utilities
│   ├── hooks/use[Name].ts                ← Custom hooks (matches components.json alias)
│   └── types/
│       └── [feature].ts                  ← Zod schema + inferred type, per feature (flat, no barrel)
```

## Placement Decision Procedure

1. shadcn primitive? → `components/ui/` — hand-author to match existing files, never edit casually.
2. Stateful container for exactly one page? → `components/views/[feature]/[Feature]View.tsx`.
3. Focused UI piece for one page (form, action row, search bar)? → `components/pages/[feature]/`.
4. Custom hook? → `src/hooks/use[Name].ts`.
5. Zustand store? → `lib/store/[feature]Store.ts` — only create when a feature needs
   cross-component UI state (modal open/selected row/active tab). Don't scaffold empty stores.
6. TanStack Query hooks + key factory? → `lib/api/[feature]/queries.ts`.
7. Raw async fetch? → `lib/api/[feature]/fetchers.ts` (backend endpoints only, via `api.*`).
8. Backend endpoint string? → `lib/api/routes.ts` as `API_ROUTES` entry (lowercase nested object).
9. Zod schema + inferred type? → `types/[feature].ts` (e.g. `types/auth.ts`).
10. Provider (QueryClient, Toaster, adapters)? → `lib/Providers.tsx` only — never a second providers file.

## Naming Quick Reference

| Thing             | Convention                                             |
| ------------------ | ------------------------------------------------------- |
| Component file    | `PascalCase.tsx`                                       |
| View file         | `[Feature]View.tsx` in `components/views/[feature]/`   |
| Hook file         | `use[Name].ts` in `src/hooks/`                          |
| Store file        | `[feature]Store.ts` in `lib/store/`                     |
| Fetcher file      | `fetchers.ts`                                           |
| Query hook file   | `queries.ts`                                            |
| Route folder      | `kebab-case/`                                           |
| Query key factory | `[feature]Keys` (e.g. `authKeys`)                       |

## Page → View → Pages-component Pattern

```
app/(protected)/[feature]/page.tsx        (server component, no 'use client', no hooks)
  └─ renders  components/views/[feature]/[Feature]View.tsx   ('use client', holds hooks/state)
       └─ renders  components/pages/[feature]/*.tsx          (focused UI, receives props/callbacks)
```

Reference implementation in this repo: `src/app/login/page.tsx` →
`src/components/views/login/LoginView.tsx` → `src/components/pages/login/LoginForm.tsx`, and
`src/app/(protected)/dashboard/page.tsx` → `src/components/views/dashboard/DashboardView.tsx` →
`src/components/pages/dashboard/DashboardActions.tsx`.

## Import Order

```
React / Next  →  third-party  →  @/components  →  @/lib  →  @/types  →  @/hooks  →  relative
```

- Import components directly from their file (no barrel in `components/`).
- Import types/schemas from `@/types/[feature]`.
- No `@diecastos/*` imports — that package scope doesn't exist in this repo.

## Handoff

- Placement decided → `client-data-state` for fetchers/queries, `ui-form-standards` for form wiring.
