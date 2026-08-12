# Codebase Audit and Remediation Plan

Date: 2026-07-21  
Scope: frontend changes worked on today (tracked + untracked files under src)

## Executive summary

Today introduced a substantial Purchase Requisitions feature slice and UI shell updates. The architecture direction is mostly correct (page -> view -> page-components + API fetchers/queries), but there are 3 medium-to-high correctness risks and several complexity/performance debt signals.

Priority order:

1. Correctness and contract consistency in PR list filtering + pagination.
2. Correctness in PR edit payload semantics for existing line items.
3. API route-source consistency in token refresh path.
4. Render-performance cleanup in large dynamic forms.
5. Repetition and maintainability cleanup in inventory managers.

## What was audited

High-churn and infrastructure-impact files were reviewed, especially:

- PR view and PR modal flow
- PR fetchers/queries and API route definitions
- shared API client behavior changes
- protected layout and repeated inventory manager UI changes

Reference files:

- [src/components/views/purchase-requisitions/PurchaseRequisitionsView.tsx](../src/components/views/purchase-requisitions/PurchaseRequisitionsView.tsx)
- [src/components/pages/purchase-requisitions/PurchaseRequisitionModals.tsx](../src/components/pages/purchase-requisitions/PurchaseRequisitionModals.tsx)
- [src/lib/api/purchase-requisitions/fetchers.ts](../src/lib/api/purchase-requisitions/fetchers.ts)
- [src/lib/api/purchase-requisitions/queries.ts](../src/lib/api/purchase-requisitions/queries.ts)
- [src/lib/api/client.ts](../src/lib/api/client.ts)
- [src/lib/api/routes.ts](../src/lib/api/routes.ts)
- [src/app/(protected)/layout.tsx](<../src/app/(protected)/layout.tsx>)

## Findings and solutions

### 1) High risk: refresh endpoint is hardcoded

Location:

- [src/lib/api/client.ts](../src/lib/api/client.ts#L31)

Problem:

- Auth refresh path uses a string literal instead of central API routes.

Impact:

- If backend path/prefix changes, refresh can fail globally while other calls still work.
- Creates route drift risk and violates single source of truth for endpoints.

Solution:

- Replace hardcoded path with API_ROUTES.auth.refresh from routes constants.
- Keep all endpoint paths in [src/lib/api/routes.ts](../src/lib/api/routes.ts).

Implementation steps:

1. Add or confirm refresh route in API_ROUTES.auth.
2. Import API_ROUTES in api client.
3. Change refresh call to use API_ROUTES.auth.refresh.
4. Run auth smoke test (expired token -> one refresh -> original request retry).

Acceptance criteria:

- No string literal refresh path in api client.
- Refresh still succeeds with rotating token flow.

---

### 2) Medium risk: PR status/type filtering is client-side but pagination meta is server-side

Location:

- [src/components/views/purchase-requisitions/PurchaseRequisitionsView.tsx](../src/components/views/purchase-requisitions/PurchaseRequisitionsView.tsx#L80)
- [src/components/pages/purchase-requisitions/PurchaseRequisitionsPagination.tsx](../src/components/pages/purchase-requisitions/PurchaseRequisitionsPagination.tsx#L120)

Problem:

- Records are filtered in-memory after one paginated server response.
- Displayed total/page controls come from unfiltered backend meta.

Impact:

- Empty/partial pages after filter changes.
- Misleading totals and user confusion.
- Potentially missed records that exist on other pages.

Solution:

- Push status and type filters into backend query params.
- Include filters in query key so cache lines are deterministic per filter set.
- Keep client filtering only for local display-only transforms (not business filters).

Implementation steps:

1. Extend list params type to include status and type.
2. Pass status/type from view to list query.
3. Ensure fetcher query string includes these params.
4. Confirm backend honors these params and returns filtered total/meta.
5. Remove client-side status/type filtering branch in view.

Fallback if backend not ready:

- Label filter as current page only and align total text with visible rows.

Acceptance criteria:

- Changing status/type updates server query and cache key.
- Pagination meta reflects filtered dataset.
- No mismatch between visible cards and total count.

Related contract doc:

- [docs/backend-pagination-contract.md](backend-pagination-contract.md)

---

### 3) Medium risk: existing PR line item selector can appear editable but backend payload may ignore item changes

Location:

- [src/components/pages/purchase-requisitions/PurchaseRequisitionModals.tsx](../src/components/pages/purchase-requisitions/PurchaseRequisitionModals.tsx#L622)
- [src/components/pages/purchase-requisitions/PurchaseRequisitionModals.tsx](../src/components/pages/purchase-requisitions/PurchaseRequisitionModals.tsx#L784)

Problem:

- For persisted rows with id, itemId is dropped in update payload logic.
- UI currently allows selecting item in edit mode.

Impact:

- Silent no-op risk: user changes selected item, save appears successful, backend does not apply change.

Solution options (pick one explicitly):

- Option A (safer): disable item selector for persisted rows and communicate non-editability.
- Option B (if backend supports): include changed itemId for persisted rows and validate server-side.

Selected approach:

- Option B selected. Backend `update` flow supports `itemId` updates for existing PR item rows.

Implementation steps:

1. Confirm backend rule for changing itemId on existing PR item rows.
2. Apply matching UI behavior (disable or send).
3. Add success/error messaging that reflects actual backend behavior.
4. Add regression test scenario for edit existing row.

Acceptance criteria:

- UI affordance matches backend capability.
- No silent ignored edit path.

---

### 4) Medium performance debt: per-row form.watch usage in dynamic table rows

Location:

- [src/components/pages/purchase-requisitions/PurchaseRequisitionModals.tsx](../src/components/pages/purchase-requisitions/PurchaseRequisitionModals.tsx#L474)
- [src/components/pages/purchase-requisitions/PurchaseRequisitionModals.tsx](../src/components/pages/purchase-requisitions/PurchaseRequisitionModals.tsx#L873)

Problem:

- form.watch is used inside mapped row rendering.

Impact:

- Can trigger broad re-renders as row count increases.
- Modal can feel sluggish with larger PR item lists.

Solution:

- Use useWatch per row/field and isolate row rendering.
- Optionally extract row into memoized child component.

Selected approach:

- Implemented scoped `useWatch` through a dedicated `ItemUomCell` so UOM reads are localized per row.

Implementation steps:

1. Replace form.watch(item uom) calls with useWatch at row-level.
2. Extract ItemRow component to reduce parent re-render blast radius.
3. Verify add/remove/edit row interaction latency.

Acceptance criteria:

- Editing one row does not re-render all rows unnecessarily.
- No behavior regression in UOM auto-fill.

---

### 5) Low maintainability debt: repeated Back to Inventory block in 5 managers

Location:

- [src/components/pages/inventory/InventoryItemsManager.tsx](../src/components/pages/inventory/InventoryItemsManager.tsx#L411)
- [src/components/pages/inventory/InventoryLocationsManager.tsx](../src/components/pages/inventory/InventoryLocationsManager.tsx#L352)
- [src/components/pages/inventory/InventoryMachinesManager.tsx](../src/components/pages/inventory/InventoryMachinesManager.tsx#L353)
- [src/components/pages/inventory/InventoryMovementsManager.tsx](../src/components/pages/inventory/InventoryMovementsManager.tsx#L483)
- [src/components/pages/inventory/InventoryServicesManager.tsx](../src/components/pages/inventory/InventoryServicesManager.tsx#L347)

Problem:

- Same back button structure duplicated across multiple files.

Impact:

- Change amplification and style drift risk.

Solution:

- Extract a small shared component (for example InventoryBackButton) or shared page-shell action.

Selected approach:

- Implemented shared `InventoryBackButton` in the same inventory pages folder and replaced all 5 duplicated blocks.

Acceptance criteria:

- One source of truth for inventory back-navigation UI.

## Complexity assessment

Updated complexity status:

1. PR modal helper responsibilities reduced: shared defaults/row-table/UOM cell/option merge moved to `purchase-requisition-modal-shared.tsx`; modal remains large but less duplicated.
2. PR view state orchestration reduced: filter/search/pagination/sort state and reset logic moved into `use-pr-list-controls.ts`.
3. API client simplified: refresh token dedup + cross-tab lock moved into `refresh-token.ts`; `client.ts` now focused on request/retry/error flow.

Remaining hotspot:

1. `PurchaseRequisitionModals.tsx` still combines create and edit modal UI in one file; further split into `Create*`/`Edit*` shells with shared row-field renderer is next major reduction.

Complexity-reduction targets:

- Split PR modal into create/edit subcomponents plus shared row editor.
- Keep container component thin: state orchestration only.
- Keep token refresh orchestration isolated from generic API request logic.

## Objective debt signals from checks

Biome check status:

- Failed with a large pre-existing baseline (162 errors, 31 warnings), including formatting issues in touched files.

Typecheck status:

- Failed due to generated Next validator references to missing route files under .next artifacts.

Implication:

- Existing baseline noise hides new regressions.

Recommended stabilization:

1. Clean or regenerate .next typing artifacts before tsc runs in CI.
2. Run targeted check commands for changed files during feature work.
3. Add a small CI gate: changed-files biome check + full check in nightly/main.

## Recommended execution plan

Phase 1: correctness first (same day)

1. Fix hardcoded refresh route.
2. Align PR status/type filtering with server pagination contract.
3. Resolve persisted-row itemId edit behavior mismatch.

Phase 2: performance and maintainability (next)

1. Replace form.watch in row maps with scoped useWatch.
2. Extract inventory back button shared component.
3. Split oversized PR modal component.

Phase 3: hygiene and guardrails

1. Reduce formatting/lint baseline debt.
2. Add focused regression tests for PR create/edit/filter flows.
3. Document PR list filter/pagination contract in API docs if missing.

## Verification checklist

Manual validation:

1. PR list: switch filter field among PR number, status, type and paginate across pages.
2. PR edit: modify existing row values, save, reopen, verify persisted data.
3. PR submit and cancel: ensure state transitions and toasts are accurate.
4. Token refresh: force 401 and verify single refresh path recovers requests.

Technical validation:

1. bun run biome check src/components/views/purchase-requisitions src/components/pages/purchase-requisitions src/lib/api/purchase-requisitions src/lib/api/client.ts src/lib/api/routes.ts
2. bun run tsc --noEmit

## Notes for future contributors

- Keep business filters server-side when endpoint is paginated.
- Keep endpoint strings centralized in API_ROUTES.
- Avoid large all-in-one form modules once a feature crosses create/edit + dynamic rows.
- Add new gotchas to [docs/gotchas.md](gotchas.md) after root cause is confirmed.

## Addendum: Setup and Suppliers Audit (2026-07-22)

Scope:

- setup routes, views, page components, and setup API hooks/fetchers
- suppliers routes, views, page components, and suppliers API hooks/fetchers

Reference files:

- [src/app/(protected)/setup/page.tsx](<../src/app/(protected)/setup/page.tsx>)
- [src/app/(protected)/suppliers/page.tsx](<../src/app/(protected)/suppliers/page.tsx>)
- [src/app/(protected)/suppliers/[supplierId]/page.tsx](<../src/app/(protected)/suppliers/[supplierId]/page.tsx>)
- [src/components/views/setup/SetupView.tsx](../src/components/views/setup/SetupView.tsx)
- [src/components/views/suppliers/SuppliersView.tsx](../src/components/views/suppliers/SuppliersView.tsx)
- [src/components/views/suppliers/SupplierDetailsView.tsx](../src/components/views/suppliers/SupplierDetailsView.tsx)
- [src/components/pages/setup/EmployeeTable.tsx](../src/components/pages/setup/EmployeeTable.tsx)
- [src/components/pages/setup/RoleTable.tsx](../src/components/pages/setup/RoleTable.tsx)
- [src/components/pages/setup/PageTable.tsx](../src/components/pages/setup/PageTable.tsx)
- [src/components/pages/setup/RolePermissionEditor.tsx](../src/components/pages/setup/RolePermissionEditor.tsx)
- [src/components/pages/suppliers/SupplierOfferingsSection.tsx](../src/components/pages/suppliers/SupplierOfferingsSection.tsx)
- [src/lib/api/setup/fetchers.ts](../src/lib/api/setup/fetchers.ts)
- [src/lib/api/setup/queries.ts](../src/lib/api/setup/queries.ts)
- [src/lib/api/suppliers/fetchers.ts](../src/lib/api/suppliers/fetchers.ts)
- [src/lib/api/suppliers/queries.ts](../src/lib/api/suppliers/queries.ts)

### Findings and solutions (Setup + Suppliers)

### 6) Medium risk: supplier detail/list routes lack explicit query error states

Location:

- [src/components/views/suppliers/SupplierDetailsView.tsx](../src/components/views/suppliers/SupplierDetailsView.tsx#L63)
- [src/components/views/suppliers/SupplierDetailsView.tsx](../src/components/views/suppliers/SupplierDetailsView.tsx#L74)
- [src/components/views/suppliers/SuppliersView.tsx](../src/components/views/suppliers/SuppliersView.tsx#L52)

Problem:

- Loading states exist, but no dedicated error branch for failed query states.

Impact:

- Failed responses can degrade into partially rendered shells.
- Detail actions may remain visible even when master payload is unavailable.

Solution:

- Add early `isError` branches with retry affordance.
- Gate edit and offerings actions behind valid supplier master payload.

Selected approach:

- Implemented explicit error + retry branches in suppliers list/detail views and guarded detail rendering/actions behind valid supplier payload.

Acceptance criteria:

- Supplier list/detail show explicit recoverable error UI when API fails.
- No edit/offering action is enabled without valid detail data.

---

### 7) Medium risk: invalid supplier route param throws generic error instead of 404

Location:

- [src/app/(protected)/suppliers/[supplierId]/page.tsx](<../src/app/(protected)/suppliers/[supplierId]/page.tsx#L14>)

Problem:

- Invalid id currently throws a generic `Error`.

Impact:

- Wrong route semantics and poorer UX versus App Router not-found flow.

Solution:

- Use `notFound()` from `next/navigation` for invalid/non-positive ids.

Selected approach:

- Implemented `notFound()` route semantics for invalid/non-positive `supplierId` params.

Acceptance criteria:

- Invalid supplier ids land on not-found path, not error boundary.

---

### 8) Medium performance debt: offerings items/services queries run in parallel even for inactive tab

Location:

- [src/components/pages/suppliers/SupplierOfferingsSection.tsx](../src/components/pages/suppliers/SupplierOfferingsSection.tsx#L801)
- [src/components/pages/suppliers/SupplierOfferingsSection.tsx](../src/components/pages/suppliers/SupplierOfferingsSection.tsx#L806)
- [src/lib/api/suppliers/queries.ts](../src/lib/api/suppliers/queries.ts#L157)

Problem:

- Both item and service queries are mounted and fetched regardless of active tab.

Impact:

- Unnecessary network and cache churn.
- Extra render work on hidden content.

Solution:

- Add active-tab `enabled` guards to only fetch visible dataset.
- Alternative: split tab panes into separately mounted components.

Selected approach:

- Implemented both: query hooks now accept `enabled` guards and offerings were split into tab-specific pane components so inactive tab does not fetch.

Acceptance criteria:

- Only active tab query runs.
- Tab switch triggers fetch for newly active dataset.

---

### 9) Medium technical debt: suppliers offerings table/pagination duplicates shared table stack

Location:

- [src/components/pages/suppliers/SupplierOfferingsSection.tsx](../src/components/pages/suppliers/SupplierOfferingsSection.tsx#L131)
- [src/components/pages/suppliers/SupplierOfferingsSection.tsx](../src/components/pages/suppliers/SupplierOfferingsSection.tsx#L874)

Problem:

- Custom table and pagination logic is hand-rolled instead of using shared DataTable components.

Impact:

- Behavior drift risk (loading, empty states, pagination UX).
- Larger maintenance surface.

Solution:

- Migrate offerings lists to `useReactTable` + shared [src/components/common/DataTable.tsx](../src/components/common/DataTable.tsx), [src/components/common/DataTableColumnHeader.tsx](../src/components/common/DataTableColumnHeader.tsx), and [src/components/common/DataTablePagination.tsx](../src/components/common/DataTablePagination.tsx).

Selected approach:

- Migrated item and service offerings list rendering to `useReactTable` + shared DataTable stack.

Acceptance criteria:

- Offerings pages use shared table components with consistent pagination/empty/loading behavior.

---

### 10) Medium performance debt: RoleTable computes employee counts from full employee list client-side

Location:

- [src/components/pages/setup/RoleTable.tsx](../src/components/pages/setup/RoleTable.tsx#L50)
- [src/components/pages/setup/RoleTable.tsx](../src/components/pages/setup/RoleTable.tsx#L60)

Problem:

- Role table pulls full employees list and filters per role to compute counts.

Impact:

- Poor scaling with larger employee datasets.
- Extra cross-query coupling between role and employee tables.

Solution:

- Move employee count aggregation to backend role list payload or a dedicated aggregate endpoint.
- Keep RoleTable based on role response only.

Acceptance criteria:

- Role table renders counts without fetching full employees dataset.

---

### 11) Medium performance debt: repeated pages filtering in permission editor

Location:

- [src/components/pages/setup/RolePermissionEditor.tsx](../src/components/pages/setup/RolePermissionEditor.tsx#L160)
- [src/components/pages/setup/RolePermissionEditor.tsx](../src/components/pages/setup/RolePermissionEditor.tsx#L190)

Problem:

- `pages.filter(...)` recomputed repeatedly across diff computation and module card rendering.

Impact:

- Avoidable `O(modules * pages)` work each render.

Solution:

- Build `pagesByModule` map once with `useMemo`, then reuse in diff and render paths.

Acceptance criteria:

- Module/page lookup no longer performs repeated full-array scans per render path.

---

### 12) Medium complexity debt: supplier offerings section is overgrown multi-responsibility component

Location:

- [src/components/pages/suppliers/SupplierOfferingsSection.tsx](../src/components/pages/suppliers/SupplierOfferingsSection.tsx#L786)

Problem:

- One file owns two list datasets, two forms, lookup queries, mutations, dialog state, and pagination logic.

Impact:

- High cognitive load and fragile future edits.
- Harder focused testing.

Solution:

- Split into container + `ItemsOfferingsPane` + `ServicesOfferingsPane` + shared dialog-state hook.
- Keep each pane owning only one dataset and one form flow.

Selected approach:

- Implemented split into focused modules:
  - `SupplierOfferingsSection` (thin container)
  - `SupplierItemsOfferingsPane`
  - `SupplierServicesOfferingsPane`
  - `use-supplier-offerings-state` (shared dialog/list state)
  - `SupplierOfferingsDialog` (form flows)

Acceptance criteria:

- Component responsibilities separated with clearer boundaries and reduced blast radius.

### Setup/Suppliers clean checks

- Page -> view composition remains clean on setup/suppliers routes.
- Setup/suppliers feature modules consistently use `api.*` + `API_ROUTES` (no direct fetch).
- Query key factories and invalidation patterns are generally sound in setup/suppliers hooks.

### Setup/Suppliers objective check notes

- Focused `biome check` still reports a broad pre-existing formatting baseline in audited areas.
- `tsc --noEmit` still fails due to stale `.next` validator references to non-existent routes, not due to new setup/suppliers type errors.

### Setup/Suppliers verification checklist

Manual:

1. Force supplier list/detail API failure and verify explicit retry/error states.
2. Visit invalid supplier id route and verify not-found behavior.
3. Validate offerings tab fetch behavior (inactive tab should not fetch).
4. Validate role table performance with larger employee counts.
5. Validate permission editing responsiveness with larger page/module sets.

Technical:

1. `bun run biome check src/app/(protected)/setup src/app/(protected)/suppliers src/components/views/setup src/components/views/suppliers src/components/pages/setup src/components/pages/suppliers src/lib/api/setup src/lib/api/suppliers src/types/setup.ts src/types/suppliers.ts`
2. `bun run tsc --noEmit`
