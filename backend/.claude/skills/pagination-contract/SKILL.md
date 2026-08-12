---
name: pagination-contract
description: >
  Mandatory server-side pagination contract for every list/index endpoint in the DiecastOS
  Hono backend. Use whenever adding or reviewing a `GET /<resource>` list endpoint. Trigger:
  list endpoint, index endpoint, GET all, paginate, pagination, sortBy, sortDir, table data api.
---

# Pagination contract (mandatory, no opt-out)

Every list endpoint **always** returns a paginated response. There is no "return everything"
mode — omitting query params still returns page 1 with the default page size, never the full
unbounded table. This is a standing product decision, not per-feature.

## Request (query params)

| param      | type              | default | notes                                                         |
| ---------- | ----------------- | ------- | ------------------------------------------------------------- |
| `page`     | number            | `1`     | 1-based                                                       |
| `pageSize` | number            | `10`    | hard cap `100` (reject/clamp above, never bypass)             |
| `sortBy`   | string            | —       | whitelist per resource, reject anything else (Zod enum → 400) |
| `sortDir`  | `"asc" \| "desc"` | `"asc"` |                                                               |

Zod schema shape (one per resource, in `src/types/<feature>.types.ts`):

```ts
export const xListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum([...whitelist]).optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});
```

Controller parses via `Object.fromEntries(new URL(c.req.url).searchParams)`.

## Response

Keep the repo's existing success-wrapper convention — wrap the payload in `{success, data, meta}`, not a raw `{data, meta}` shape:

```ts
type PaginatedResponse<T> = {
  success: true;
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number; // Math.max(1, Math.ceil(total / pageSize))
  };
};
```

## Repository requirements

- `list(params)` always applies `.limit(pageSize).offset((page-1)*pageSize)` unconditionally, on every call.
- `orderBy` must include a **PK tiebreaker** after the requested sort column (e.g. `.orderBy(orderFn(sortColumn), asc(table.id))`) to keep pagination stable across pages on low-cardinality sort columns.
- Run the `count()` total query in parallel with the rows query via `Promise.all` — 2 queries total, no N+1.
- Invalid `sortBy` (not in the whitelist enum) → Zod throws → let it surface as a 400 via the global error handler.

## Service requirements

- Compute `totalPages = Math.max(1, Math.ceil(total / pageSize))`.
- No HTTP concerns — return `{ data, meta }`, controller wraps with `{ success: true, ... }`.

## Reviewer check

Verify each of these holds for every list endpoint — flag **HIGH** (not just a performance nit) wherever it doesn't:

- Response is bounded and paginated, with `page`/`pageSize`/`meta` present.
- `page`/`pageSize` default to `1`/`10`, not `undefined`/optional.
- Sort order includes a PK tiebreaker.
- Response uses the repo's `{success, data, meta}` wrapper, not a raw `{data, meta}` shape.

## Manifest visibility

`sortBy` whitelist and `sortDir` show up automatically in the generated contract (`.contracts/api-manifest.json`, via `bun run contract:generate`) as each route's `pagination.sortableFields` — the frontend agent queries this with `bun run contract:query` instead of reading the Zod schema directly. Getting the whitelist right here is what the frontend agent sees; don't leave it out.
