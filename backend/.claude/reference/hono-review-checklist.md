# Hono review checklist (backend/src)

Reference doc, not an agent. Read by the pipeline agent `code-reviewer` (and `performance-auditor` for the
performance sections) when a diff touches `backend/`. Converted from the retired `hono-reviewer` agent on
2026-11-18 (workflow v2, 0.7); the checks are unchanged. Order of concern: correctness risks first, then
performance risks, then optimization suggestions. Severity mapping to the pipeline protocol:
High → blocker, Medium → major, Low → minor.

## Scope

- Focus on backend/src code paths.
- Review by layer: controller -> service -> repository -> route registration.
- Prioritize behavioral bugs, contract drift, and security before style.

## Correctness Checklist (flag as High when it doesn't hold)

Verify each of these for every touched route — flag a High finding wherever the real code departs from it:

- Controller relies on the async handler + centralized error middleware for error flow.
- Controller stays thin — parses input, calls the service, shapes the response; business logic lives in the service.
- Controller calls only the service layer; DB/ORM access stays inside the repository.
- Service returns business-shaped data; HTTP response/status handling stays in the controller.
- Repository returns raw typed data with no HTTP concerns.
- Route paths come from `src/routes/end-points.ts` constants, not hardcoded strings.
- Every route has `requirePermission("<key>")` (or `requireAnyPermission`) with the right key from `src/lib/permissions.ts`; no role-name checks in route code.
- Every async controller handler is wrapped by the async handler.
- Every route descriptor carries OpenAPI metadata.
- Every error response uses the uniform shape produced by the global error handler.
- Every list/index endpoint has mandatory server-side pagination, with `page`/`pageSize` defaulting to `1`/`10` rather than optional/undefined — invoke `Skill` with `skill: "pagination-contract"` to check this. An unbounded list response is a HIGH finding, not a performance nit.
- Repository types are derived straight from Drizzle schema, not hand-duplicated.
- Every new/changed route has a matching `registry.register(...)` call in `src/lib/route-registry.ts` (`bun test`'s drift check should catch a missing one, but flag it directly if seen) — the frontend agent queries this registry's generated manifest (`.contracts/api-manifest.json` via `bun run contract:query`) instead of reading backend source, so an unregistered or stale-registered route is invisible to it. Flag missing/incorrect registration as HIGH.

## Architecture Checklist (flag as Medium when it doesn't hold)

- Zod validation is sourced from `src/types/*.types.ts`, not duplicated locally in a controller or service.
- Zod schemas that mirror a Drizzle table derive from it via `drizzle-zod` (`createSelectSchema`/`createInsertSchema`/`createUpdateSchema`), not hand-declared field-by-field — unless a specific field deliberately diverges from the column's nullability, with a comment explaining why.
- Endpoint paths, schemas, and error codes each have exactly one source of truth.
- Route registration goes through `register()` in `src/lib/route-registry.ts`.
- Controllers return a consistent success shape.
- Every value across controller/service/repository boundaries is precisely typed.
- Service and repository contracts stay in their own lane: service typed against Zod-inferred request/response contracts, repository typed against Drizzle-derived DB shapes.

## Performance Review Checks (Medium)

- N+1 query patterns or repetitive repository calls in loops.
- Full table scans caused by unbounded list endpoints (note: missing pagination itself is now a HIGH critical violation above — this section covers scans that remain even with pagination in place, e.g. unindexed filters).
- Missing pagination/limit/default sorting in list APIs.
- Over-fetching columns when narrow select projection is possible.
- Sequential independent awaits that could be parallelized safely.
- Repeated expensive transformations in controller instead of service or DB projection.
- Missing memoized/shared clients causing repeated setup overhead.
- Slow-path auth/role checks duplicated per handler instead of middleware.
- Chatty endpoint design causing many round trips for one screen.

## Performance Optimization Suggestions (Low)

When you find a performance issue, include:

1. current bottleneck pattern
2. concrete optimization
3. expected impact (latency, query count, memory, throughput)
4. trade-off/risk

Optimization patterns to prefer:

- Add limit + cursor/offset pagination with explicit max limit.
- Collapse N+1 queries into single query or batched fetch.
- Select only required columns.
- Move filter/sort/aggregate work to DB.
- Parallelize independent async operations via Promise.all when safe.
- Reuse shared clients/utilities in src/lib.
- Introduce cache only when data staleness is acceptable and invalidation path is clear.

## Per finding, always give

- file and line
- problem
- why it matters
- precise fix pattern (described precisely enough that a developer agent can apply it directly)
