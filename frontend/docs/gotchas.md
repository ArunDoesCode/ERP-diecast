# Frontend gotchas / learning notes

Running log of real bugs hit in this repo and the fix pattern, so we don't repeat them.
Add to this file when you hit a new one — don't create a separate doc per bug.

## Auth

### Concurrent 401s racing a one-time-use refresh token

Backend refresh tokens are rotating (each `POST /auth/refresh` deletes the old token row
and issues a new one). If N requests expire around the same time and each independently
calls `refreshAccessToken()`, they all send the same still-cookie'd refresh token — only
the first succeeds, the rest fail since it was already rotated away.

**Fix**: share one in-flight refresh promise across all callers (`refreshAccessTokenOnce()`
in [client.ts](../src/lib/api/client.ts)) so concurrent 401s await the same call instead of
racing. Don't revert to a plain per-call refresh — it reintroduces the race.

That module-level promise only covers a single tab's JS memory — two tabs expiring around
the same moment would still race each other's `/auth/refresh` call against the same
cookie (confirmed in practice: `"Refresh token invalid"` on the losing tab). Fixed by
wrapping the refresh in `navigator.locks.request(...)` (Web Locks API — native, no new
dependency, serializes the callback across same-origin tabs). Once serialized, the queued
tab first checks if `getAccessToken()` already changed from the token that triggered its
401 — if another tab's refresh already rotated it while waiting for the lock, reuse that
token instead of firing a second, doomed-to-fail `/auth/refresh` call.

### Access token stored twice (localStorage + cookie) is not a security layer

Both copies are non-`httpOnly`/JS-readable. The cookie exists only so `proxy.ts` (edge
middleware) can gate routes — it can't read localStorage. Don't treat the cookie as an
XSS mitigation; the refresh token (httpOnly, backend-set) is the actual security boundary.

## Forms — shadcn `Select`

### "Select is changing from uncontrolled to controlled"

Passing `value={field.value ? String(field.value) : undefined}` flips the `value` prop
from `undefined` (uncontrolled) to a string (controlled) the moment a value is picked —
React warns and the component's behavior becomes undefined.

**Fix**: always pass a **defined** string. Use an empty string or a sentinel constant
(e.g. `PageForm.tsx`'s `NO_MODULE_VALUE`) for "nothing selected", never `undefined`.
Applies to any controlled Radix `Select`/similar primitive driven by React Hook Form.

## Comboboxes / live-typing + Radix Popover

### `PopoverTrigger asChild` wrapping a live-typing `Input` fights manual open state

Radix's trigger has its own click-to-toggle-`open` handler. Combined with manual
`onFocus`/`onChange` also setting `open`, typing/focus can behave unpredictably (lost
keystrokes, box not opening).

**Fix**: for a debounced search-as-you-type box, skip `Popover` entirely — a plain
`relative` wrapper + conditionally-rendered absolutely-positioned panel, opened via
`onFocus`/closed via `onBlur`, with result buttons using `onMouseDown={e =>
e.preventDefault()}` (so the click registers before blur closes the panel). See
[EmployeeCombobox.tsx](../src/components/pages/setup/EmployeeCombobox.tsx). Fewer moving
parts, no trigger-vs-manual-state conflict.

## TanStack Table (server-side pagination/sorting)

### Sortable column `id` must match the backend's `sortBy` whitelist verbatim

`manualSorting: true` sends `sorting[0].id` straight to the API as the `sortBy` param. If
the backend sorts by `roleId` but the column id is `"role"` (because the cell displays a
resolved name via `accessorFn`), sorting silently does nothing or 400s. Rename the column
id to the raw backend field (e.g. `"roleId"`, `"moduleId"`), keep the display resolution
in `cell`/`accessorFn` only.

### Derived/computed columns can't be server-sortable

A column whose value is computed client-side (e.g. RoleTable's "Employee Count",
cross-referenced from a separate full employee list) isn't in the backend's `sortBy`
enum. Set `enableSorting: false` rather than letting it look sortable and silently no-op.

### Don't bake fetcher/nuqs into a generic render component

`components/common/DataTable.tsx` is render-only (`{table, isLoading}` props) —
header/body/skeleton/pagination from a TanStack `Table` instance. The feature's own table
component always owns `useReactTable()`, the query hook call, and pagination/sorting
state. Collapsing fetch+URL-state+render into one "smart" component breaks per-feature
control of query keys/staleTime/toast placement and violates the `ui/` (shadcn-CLI-owned,
presentational) vs `common/` (shared app logic) boundary. See `data-table` skill.

### Skeleton column count — derive it, don't duplicate it

`DataTable`'s loading skeleton reads `table.getVisibleLeafColumns().length`, not a
separate `columns` prop — columns are already known to `table` before data arrives, so
there's nothing to pass twice.

## Response envelope / list endpoints

### Every backend response is `{ success: true, data, meta? }` — no exceptions

`setup/fetchers.ts` had types missing `success` on several endpoints (bug, not an
intentional "some endpoints are raw `{data}`" convention — confirmed by backend). Always
type responses as `{ success: true; data: T }` (or `PaginatedResponse<T>` with `meta` for
paginated lists), even if the `.data` access pattern doesn't change.

### Bare (no-params) list fetchers must keep returning the FULL list

When a list endpoint (`getEmployees`, `getRoles`, `getPages`) gains pagination params,
keep the **no-params call** returning everything — cross-reference consumers
(`EmployeeCombobox`'s old client-filter, `RoleTable`'s employee-count-per-role,
`EmployeePermissionPreview`/`RolePermissionEditor`'s permission matrix) call the hook bare
and need every row, not one page. Don't silently paginate a hook every existing caller
depends on. (Flagged as an unverified assumption each time — worth confirming with
backend if counts ever look wrong.)

## React state persistence across conditional unmount

A component rendered inside a ternary/conditional (e.g. `{mode === "employee" ? <X/> :
<Y/>}`) fully unmounts when the branch changes — any `useState` local to it resets. If a
value needs to survive switching away and back (like `RolePermissionEditor`'s selected
role, or `EmployeeCombobox`'s search text in `PermissionsTab`), lift that state to the
parent that stays mounted and pass it down as a controlled prop, rather than storing it
locally in the component that gets torn down.

## TanStack Query infinite/search queries

### Gate the query on the debounced value, not on mount

`useEmployeeSearchQuery` uses `enabled: trimmed.length > 0` so opening/focusing the
combobox doesn't fire a request before the user types anything — only a non-empty
(trimmed) search term triggers a fetch.

### `useDebouncedValue`'s initial state avoids a redundant delay on remount

`useDebouncedValue(value, delay)` initializes its internal state to `value` immediately
(`useState(value)`), so if a component remounts with an already-non-empty persisted
search string, the debounced value is correct on the very first render — no extra
250ms wait "reappears" just because the component was recreated.
