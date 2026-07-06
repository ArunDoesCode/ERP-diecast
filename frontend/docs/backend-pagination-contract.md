# Backend contract: pagination for Setup list endpoints

Status (2026-07-04): shipped for all 3 — `GET /setup/employees`, `GET /setup/roles`,
`GET /setup/pages` all accept the query params below. Frontend uses
`manualPagination`/`manualSorting` on `useReactTable` for all three tables now.

(`modules` and `permissions` are small reference/config data, not paginated.)

## Request (query params)

```
GET /setup/employees?page=1&pageSize=10&sortBy=name&sortDir=asc
```

| param      | type              | default | notes                          |
| ---------- | ----------------- | ------- | ------------------------------ |
| `page`     | number            | `1`     | 1-based                        |
| `pageSize` | number            | `10`    | cap at e.g. 100 server-side    |
| `sortBy`   | string            | —       | whitelist per resource (below) |
| `sortDir`  | `"asc" \| "desc"` | `"asc"` |                                |

Sortable fields (whitelist, reject/ignore anything else):

- `employees`: `name`, `roleId`, `dailyRatePaise`, `isActive`
- `roles`: `name`
- `pages`: `label`, `path`, `moduleId`, `sortOrder`

## Response

Standard backend envelope — every response is `{ success, data, meta? }`:

```ts
type PaginatedResponse<T> = {
  success: true;
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};
```

## Frontend types (to add to `src/types/setup.ts` once backend ships this)

```ts
export type ListParams = {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
};

export type PaginatedResponse<T> = {
  success: true;
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};
```
