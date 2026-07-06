<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Next.js 16 facts confirmed for this repo (from `.../docs/01-app/02-guides/upgrading/version-16.md`)

- `proxy.ts` replaces `middleware.ts`/`middleware()` (deprecated name) — already adopted here, don't reintroduce a `middleware.ts`.
- `params`/`searchParams` in `page.tsx`/`layout.tsx`/`route.ts` are **always** `Promise<...>` now — sync access is fully removed (not just deprecated like v15). Must `await` them. Already correct in `[...segments]/page.tsx`.
- Turbopack is the default for both `next dev` and `next build` — no `--turbopack` flag needed (already reflected in `package.json` scripts).
- A route segment's `loading.tsx` auto-wraps `page.tsx` in a `<Suspense>` boundary — required for any page whose tree calls `useSearchParams()` (directly or via `nuqs`'s `useQueryState`) to prerender statically, otherwise build fails with "missing-suspense-with-csr-bailout". See `(protected)/setup/loading.tsx`.
- ESLint Flat Config default doesn't apply here — this repo lints with Biome (`biome check`), not ESLint.
- Not yet used but breaking if adopted later — check the upgrading doc first: `next/image` defaults changed (`qualities` now `[75]` only, `imageSizes` dropped `16`, `minimumCacheTTL` now 4h, local images with query strings need `images.localPatterns.search`); `revalidateTag` now requires a second `cacheLife` profile argument.
<!-- END:nextjs-agent-rules -->
