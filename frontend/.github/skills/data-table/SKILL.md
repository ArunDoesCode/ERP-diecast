---
name: data-table
description: "Use when building or reviewing any list/table page: TanStack Table setup, sortable columns, pagination (client or server), skeleton loading states, or wiring a fetcher+query hook to a table. Triggers: data table, table pagination, sortable column, useReactTable, ColumnDef, manualPagination, manualSorting, skeleton rows, DataTable, DataTableColumnHeader, DataTablePagination, list endpoint, paginated response, page/pageSize/sortBy/sortDir. DO NOT USE for forms, non-tabular UI, or one-off static tables with no sort/paginate need."
argument-hint: "Describe the entity/list being rendered and whether the backend endpoint supports page/pageSize/sortBy/sortDir params."
---

# Data Table (TanStack Table: sort, paginate, skeleton)

Every list page in this repo must have: pagination, a loading skeleton, and real data fetching
(no hardcoded/mock rows). This skill is the reusable pattern — don't hand-roll table markup
or pagination controls per feature; reuse the 3 shared render components below.

## Shared components (already built — reuse, don't duplicate)

- `components/common/DataTable.tsx` — render-only. Props: `{ table: Table<TData>; isLoading?: boolean }`.
  Draws header/body from the `table` instance, a 3-row skeleton (column count read from
  `table.getVisibleLeafColumns()`, not a separate prop) while `isLoading`, a "No results." row
  when empty, and `<DataTablePagination table={table} />` underneath.
- `components/common/DataTableColumnHeader.tsx` — sortable header button (`<Column>` + `title`).
  Renders a plain `<div>{title}</div>` when `!column.getCanSort()`.
- `components/common/DataTablePagination.tsx` — `prev [1] [2] ... [n] next` with ellipsis for
  large page counts, driven purely by `table.getState().pagination` / `setPageIndex` /
  `previousPage` / `nextPage`. Works for both client- and server-driven tables.

**Never** put any of this in `components/ui/table.tsx` — that file is shadcn-CLI-owned
(`bunx shadcn add table --diff`), presentational primitives only. **Never** bake the fetcher
call or nuqs into the generic `DataTable` — that collapses server-state/URL-state/render
concerns into one component and breaks per-feature control of query keys, staleTime, and
toast placement. The feature's own table component (e.g. `EmployeeTable`) always owns its
`useReactTable()` call, its query hook call, and its pagination/sorting state — `DataTable`
only draws it.

## Decision: does the backend support pagination for this endpoint?

Ask this before writing anything. Check for a query schema on the backend (e.g.
`employeeListQuerySchema` accepting `page`/`pageSize`/`sortBy`/`sortDir`).

- **Yes → server-side** (real API call per page/sort change). Use this whenever the backend
  supports it, even for small lists — it's the correct default going forward.
- **No → client-side** (fetch everything once, sort/paginate in the browser via
  `getSortedRowModel()`/`getPaginationRowModel()`). Only acceptable for genuinely small,
  bounded reference data (a handful to a few dozen rows) while waiting on backend support.
  Don't fake query params a backend endpoint ignores.

If unsure, ask the user for the backend zod query schema rather than guessing param names or
defaults.

## Server-side pattern (preferred)

1. **Types** (`src/types/[feature].ts`) — mirror the backend schema exactly:

   ```ts
   export type XSortField = "field1" | "field2"; // must match backend enum values verbatim
   export type ListParams<TSortField extends string> = {
     page?: number;
     pageSize?: number;
     sortBy?: TSortField;
     sortDir?: "asc" | "desc";
   };
   export type PaginationMeta = {
     page: number;
     pageSize: number;
     total: number;
     totalPages: number;
   };
   export type PaginatedResponse<T> = {
     success: true;
     data: T[];
     meta: PaginationMeta;
   };
   ```

2. **Fetcher** (`lib/api/[feature]/fetchers.ts`) — the function takes **optional** params:
   `getXs(params?)`. No params = full unpaginated list (existing cross-reference consumers —
   dropdowns, count-by-id lookups, permission matrices — call it bare and need every row, not
   one page). Params = paginated call. Share one `toQueryString(params?)` helper across every
   list fetcher in the feature instead of duplicating `URLSearchParams` building per endpoint.

3. **Query hook** (`lib/api/[feature]/queries.ts`):

   ```ts
   export const xKeys = {
     list: (params?: XListParams) =>
       params
         ? (["feature", "xs", params] as const)
         : (["feature", "xs"] as const),
   };

   export function useXsQuery(params?: XListParams) {
     return useQuery({
       queryKey: xKeys.list(params),
       queryFn: () => getXs(params),
       placeholderData: params ? keepPreviousData : undefined, // no loading flash between pages
     });
   }
   ```

   Bare `invalidateQueries({ queryKey: xKeys.list() })` calls still invalidate the paginated
   variant too (TanStack's default prefix match) — no change needed at mutation call sites.

4. **Table component** — owns everything, takes no data props:

   ```tsx
   const [pagination, setPagination] = useState<PaginationState>({
     pageIndex: 0,
     pageSize: 10,
   });
   const [sorting, setSorting] = useState<SortingState>([]);
   const sortColumn = sorting[0];

   const query = useXsQuery({
     page: pagination.pageIndex + 1,
     pageSize: pagination.pageSize,
     sortBy: sortColumn?.id as XSortField | undefined,
     sortDir: sortColumn?.desc ? "desc" : "asc",
   });

   const table = useReactTable({
     data: query.data?.data ?? [],
     columns,
     getCoreRowModel: getCoreRowModel(),
     manualSorting: true,
     manualPagination: true,
     pageCount: query.data?.meta.totalPages ?? 1,
     onSortingChange: (updater) => {
       setSorting(updater);
       setPagination((prev) => ({ ...prev, pageIndex: 0 })); // reset to page 1 on sort change
     },
     onPaginationChange: setPagination,
     state: { sorting, pagination },
   });

   return <DataTable table={table} isLoading={query.isLoading} />;
   ```

5. **Column id ↔ backend sortBy contract**: a sortable column's `id` (or `accessorKey`) MUST
   equal one of the backend's whitelisted `sortBy` values verbatim — manual sorting sends
   `sorting[0].id` straight to the API. E.g. if the backend sorts by `roleId` (not a resolved
   display name), the column id is `"roleId"`, even though the cell renders a resolved role
   name via `accessorFn`. Any column whose displayed value is client-computed and NOT in the
   backend's sortBy whitelist (counts, joins, derived strings) must set `enableSorting: false`
   — don't let a column look sortable when the backend can't actually sort by it.

6. **Parent "Tab"/list-page component** stays thin: just renders `<XTable />` and a "+ New"
   button. No `isLoading`/empty-state/prop-passing there — the table component owns its own
   query and loading state now (via `DataTable`'s skeleton).

## Client-side pattern (small, unpaginated backend endpoint)

Same shared `DataTable`/`DataTableColumnHeader`/`DataTablePagination`, but:

```tsx
const table = useReactTable({
  data,
  columns,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
  onSortingChange: setSorting,
  state: { sorting },
});
```

No `manualSorting`/`manualPagination`, no query params, no `pageCount` override — TanStack
computes everything from the full `data` array already in memory.

## Skeleton rows

Never hand-write skeleton markup per table. `DataTable` renders exactly 3 skeleton rows
(fixed) × `table.getVisibleLeafColumns().length` cells whenever `isLoading` is true — this
works before any data/columns are resolved because column defs (not data) drive `table`.

## Checklist before calling a table "done"

- [ ] Real API call backs the table (no mock/hardcoded rows) — server or client per the
      decision above, matching what the backend actually supports.
- [ ] Uses `DataTable` + `DataTableColumnHeader` + `DataTablePagination` — no duplicated
      `<TableHeader>`/`<TableBody>`/skeleton JSX in the feature component.
- [ ] Sortable column ids match backend sortBy enum verbatim (server-side only).
- [ ] Derived/computed columns not in the backend's sortBy whitelist have `enableSorting: false`.
- [ ] Bare (no-params) query calls still work for existing full-list consumers (dropdowns,
      counts, permission matrices) — don't silently paginate a hook every caller depends on.
- [ ] Parent Tab/list-page component is thin — no prop-drilled data, no duplicate loading state.
