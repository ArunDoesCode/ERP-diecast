# Setup Page — Implementation Plan (codebase-accurate)

Route already scaffolded: [page.tsx](<../../../app/(protected)/setup/page.tsx>) → renders
[SetupView.tsx](SetupView.tsx) (currently a placeholder div). Everything below replaces the
placeholder and follows the repo's page → view → pages-component pattern verbatim.

## 0. Gaps vs current codebase (must-do before/alongside feature code)

- `src/components/ui/` has **no** `tabs`, `table`, `dialog`, `alert-dialog`,
  `dropdown-menu`, `select`, `badge`, `checkbox`, `toggle-group` yet. `bunx shadcn add`
  hangs on this repo's custom `radix-mira` registry (verified) — hand-author each one under
  `src/components/ui/` importing primitives from the single `radix-ui` package (already a
  dependency), matching the style of existing [form.tsx](../../ui/form.tsx) /
  [sheet.tsx](../../ui/sheet.tsx) (`radix-ui` named imports, `cn()` from
  `@/lib/utils`, `data-slot` attrs, tabler icons for chevrons/checks).
- No table library installed (no `@tanstack/react-table`) — do not add one. The list
  tables (Employees/Roles/Pages) use a plain hand-authored `<table>` wrapper
  (`ui/table.tsx`) — YAGNI, no data-grid engine needed for reference data this size.
- No `popover.tsx` either — needed for the searchable Employee combobox and the
  module→pages picker below. Hand-author from `radix-ui`'s `Popover` primitive same as
  the rest of `ui/`. No `cmdk`/Command palette dependency — a plain filtered list inside
  the popover is enough for this data size (see §8 Permissions).
- No debounce hook exists — add `src/hooks/use-debounced-value.ts` (mirrors the existing
  `hooks/use-mobile.ts` single-purpose-hook convention).
- No zustand store exists anywhere in the repo yet. This feature is the first one that
  actually needs cross-component UI state (row action in a tab must open a Sheet owned by
  the parent view) — qualifies per repo convention. Add
  `src/lib/store/setupDrawerStore.ts`, nothing more global.
- `nuqs` is already wired in `Providers.tsx` — use it for the active-tab query param
  instead of local `useState`, so the tab survives refresh/back-nav (repo already pays for
  nuqs, no reason not to use it here).
- **Sidebar is currently static** (`lib/navigation/pages.ts`, ~35 stub views import
  `getPageDefinition` for title/module/description). Once this Setup page can manage
  `Page`/`Module` rows in the backend, the sidebar _should_ eventually render off a real
  `/setup/pages`-shaped response instead of the hardcoded array — see §11. Not part of this
  build: the route guard in `proxy.ts` already only trusts the JWT's `allowedPages` path
  list (no static file involved in the actual security gate), so nothing here is unsafe
  today — `pages.ts` is presentation metadata only. Swapping it is a ~35-file refactor
  gated on a backend endpoint that doesn't exist yet (repo rule: backend-first). Tracked,
  not built now.

## 1. File layout

```
src/types/setup.ts                         # interfaces + zod schemas (co-located, repo convention)
src/lib/api/routes.ts                       # + setup namespace (edit existing file)
src/lib/api/setup/fetchers.ts               # api.get/post/patch/delete calls
src/lib/api/setup/queries.ts                # setupKeys + useQuery/useMutation hooks
src/lib/store/setupDrawerStore.ts           # zustand: drawer/dispatcher state only

src/components/ui/tabs.tsx                  # hand-authored (radix-ui Tabs primitive)
src/components/ui/table.tsx                 # hand-authored (plain <table> + cn() slots)
src/components/ui/dialog.tsx                # hand-authored (radix-ui Dialog primitive)
src/components/ui/alert-dialog.tsx          # hand-authored (radix-ui AlertDialog primitive)
src/components/ui/dropdown-menu.tsx         # hand-authored
src/components/ui/select.tsx                # hand-authored
src/components/ui/badge.tsx                 # hand-authored
src/components/ui/checkbox.tsx              # hand-authored
src/components/ui/toggle-group.tsx          # hand-authored
src/components/ui/popover.tsx               # hand-authored (radix-ui Popover primitive)

src/hooks/use-debounced-value.ts             # generic debounce hook (employee search box)

src/components/common/ConfirmDeleteDialog.tsx   # generic, reusable across ALL features
                                                 # props: { open, onOpenChange, onConfirm,
                                                 #          isPending, title, description }
                                                 # (not setup-specific — lives in common/
                                                 #  per repo folder convention)

src/components/views/setup/SetupView.tsx    # 'use client', Tabs shell + drawer wiring (edit existing)

src/components/pages/setup/
  EmployeesTab.tsx
  EmployeeTable.tsx
  EmployeeForm.tsx           # single create+edit form, mode driven by drawer store
  QrTokenPanel.tsx           # generate/download/copy, only rendered when loginMethod === "qr"
  RolesTab.tsx
  RoleTable.tsx
  RoleForm.tsx
  PagesTab.tsx
  PageTable.tsx
  PageForm.tsx
  PermissionsTab.tsx            # top toggle: "Edit by Role" | "View by Employee"
  RolePermissionEditor.tsx      # role Select + module grid + submit (the editable path)
  EmployeeCombobox.tsx          # debounced-filter searchable employee picker (view path)
  EmployeePermissionPreview.tsx # read-only resolved pages for the selected employee's role
  ModulePagesPopover.tsx        # Popover: checkbox list of a module's pages, add/remove
  SetupSheet.tsx                # the single dispatcher Sheet, reads setupDrawerStore,
                                 # renders EmployeeForm | RoleForm | PageForm by entity+mode
```

## 2. Types & schemas — `src/types/setup.ts`

Mirrors the Drizzle shape given, plus RHF/Zod input schemas (repo convention: schemas live
next to the feature's interfaces, not in a separate `validators` package — this is a
standalone repo).

```ts
import { z } from "zod";

export interface Module {
  id: number;
  name: string;
}

export interface Role {
  id: number;
  name: string;
  isSystem: boolean;
}

export interface Page {
  id: number;
  key: string;
  label: string;
  path: string;
  sortOrder: number;
  moduleId: number | null;
}

export interface Employee {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  qrToken: string | null;
  roleId: number;
  dailyRatePaise: number;
  isActive: boolean;
}

export interface RolePage {
  roleId: number;
  pageId: number;
}

// ---- forms ----

export const employeeSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    phone: z.string().optional(),
    dailyRatePaise: z.coerce.number().int().min(0),
    roleId: z.coerce.number().int(),
    loginMethod: z.enum(["password", "qr"]),
    email: z.email("Enter a valid email").optional().or(z.literal("")),
    password: z
      .string()
      .min(6, "Min 6 characters")
      .optional()
      .or(z.literal("")),
  })
  .superRefine((val, ctx) => {
    if (val.loginMethod === "password") {
      if (!val.email)
        ctx.addIssue({
          code: "custom",
          message: "Email is required",
          path: ["email"],
        });
      if (!val.password)
        ctx.addIssue({
          code: "custom",
          message: "Password is required",
          path: ["password"],
        });
    }
  });
export type EmployeeInput = z.infer<typeof employeeSchema>;

export const roleSchema = z.object({
  name: z.string().min(1, "Name is required"),
});
export type RoleInput = z.infer<typeof roleSchema>;

export const pageSchema = z.object({
  key: z.string().min(1, "Key is required"),
  label: z.string().min(1, "Label is required"),
  path: z.string().min(1, "Path is required"),
  sortOrder: z.coerce.number().int().default(0),
  moduleId: z.coerce.number().int().nullable(),
});
export type PageInput = z.infer<typeof pageSchema>;

// keyed by moduleId (string-keyed object, not moduleName — names can be renamed via
// PageForm/PagesTab, ids are stable); submitted for one Role at a time.
export type RolePermissionDiff = Record<
  string,
  { added: number[]; deleted: number[] }
>;
```

## 3. Routes — edit `src/lib/api/routes.ts`

Same `API_Header` + lowercase nested object pattern as `auth`/`files`:

```ts
const API_Header = {
  auth: "/auth",
  files: "/files",
  setup: "/setup",
};

export const API_ROUTES = {
  auth: {
    /* unchanged */
  },
  files: {
    /* unchanged */
  },
  setup: {
    modules: `${API_Header.setup}/modules`,
    employees: `${API_Header.setup}/employees`,
    employee: (id: number) => `${API_Header.setup}/employees/${id}`,
    employeeQr: (id: number) => `${API_Header.setup}/employees/${id}/qr`,
    roles: `${API_Header.setup}/roles`,
    role: (id: number) => `${API_Header.setup}/roles/${id}`,
    pages: `${API_Header.setup}/pages`,
    page: (id: number) => `${API_Header.setup}/pages/${id}`,
    permissionGrants: `${API_Header.setup}/permissions`,
    rolePermissions: (roleId: number) =>
      `${API_Header.setup}/roles/${roleId}/permissions`,
  },
} as const;
```

## 4. Fetchers — `src/lib/api/setup/fetchers.ts`

Thin `api.*` calls only, no react-query here (matches `auth/fetchers.ts`):

```ts
import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";
import type {
  Employee,
  EmployeeInput,
  Module,
  Page,
  PageInput,
  Role,
  RoleInput,
  RolePage,
  RolePermissionDiff,
} from "@/types/setup";

export const getModules = () =>
  api.get<{ data: Module[] }>(API_ROUTES.setup.modules);

export const getEmployees = () =>
  api.get<{ data: Employee[] }>(API_ROUTES.setup.employees);
export const createEmployee = (input: EmployeeInput) =>
  api.post<{ data: Employee }, EmployeeInput>(
    API_ROUTES.setup.employees,
    input,
  );
export const updateEmployee = (id: number, input: EmployeeInput) =>
  api.patch<{ data: Employee }, EmployeeInput>(
    API_ROUTES.setup.employee(id),
    input,
  );
export const deleteEmployee = (id: number) =>
  api.delete(API_ROUTES.setup.employee(id));
export const generateEmployeeQr = (id: number) =>
  api.post<{ data: { qrToken: string } }>(API_ROUTES.setup.employeeQr(id));

export const getRoles = () => api.get<{ data: Role[] }>(API_ROUTES.setup.roles);
export const createRole = (input: RoleInput) =>
  api.post<{ data: Role }, RoleInput>(API_ROUTES.setup.roles, input);
export const updateRole = (id: number, input: RoleInput) =>
  api.patch<{ data: Role }, RoleInput>(API_ROUTES.setup.role(id), input);
export const deleteRole = (id: number) => api.delete(API_ROUTES.setup.role(id));

export const getPages = () => api.get<{ data: Page[] }>(API_ROUTES.setup.pages);
export const createPage = (input: PageInput) =>
  api.post<{ data: Page }, PageInput>(API_ROUTES.setup.pages, input);
export const updatePage = (id: number, input: PageInput) =>
  api.patch<{ data: Page }, PageInput>(API_ROUTES.setup.page(id), input);
export const deletePage = (id: number) => api.delete(API_ROUTES.setup.page(id));

export const getPermissionGrants = () =>
  api.get<{ data: RolePage[] }>(API_ROUTES.setup.permissionGrants);
export const updateRolePermissions = (
  roleId: number,
  diff: RolePermissionDiff,
) =>
  api.post<{ data: RolePage[] }, RolePermissionDiff>(
    API_ROUTES.setup.rolePermissions(roleId),
    diff,
  );
```

## 5. Queries — `src/lib/api/setup/queries.ts`

Key factory + hooks, `'use client'`, toast on success/error via `sonner` (matches
`auth/queries.ts`). One `useMutation` per entity, invalidate the relevant list key on
success. Permissions get the optimistic-update variant:

```ts
export const setupKeys = {
  modules: () => ["setup", "modules"] as const,
  employees: () => ["setup", "employees"] as const,
  roles: () => ["setup", "roles"] as const,
  pages: () => ["setup", "pages"] as const,
  permissionGrants: () => ["setup", "permissions"] as const,
};
```

- `useEmployeesQuery`, `useCreateEmployeeMutation`, `useUpdateEmployeeMutation`,
  `useDeleteEmployeeMutation`, `useGenerateEmployeeQrMutation`
- `useRolesQuery`, `useCreateRoleMutation`, `useUpdateRoleMutation`, `useDeleteRoleMutation`
- `usePagesQuery`, `useCreatePageMutation`, `useUpdatePageMutation`, `useDeletePageMutation`
- `useModulesQuery` (for the Pages form's module `Select` **and** for grouping the module
  grid in Permissions)
- `usePermissionGrantsQuery` — fetches **all** `RolePage[]` once; both the Role editor and
  the Employee read-only preview derive their view by filtering this one array client-side
  (`grants.filter(g => g.roleId === selectedRoleId)`) — no per-role/per-employee endpoint
  needed, this reference data is small (few roles × handful of pages).
- `useUpdateRolePermissionsMutation(roleId)`:
  - `onMutate`: cancel `permissionGrants()`, snapshot previous array, splice in the
    added/deleted page ids for `roleId` immediately (optimistic checkbox state in the
    module popover).
  - `onError`: roll back to the snapshot, `toast.error("Failed to update permissions")`.
  - `onSuccess`: `toast.success("Permissions updated")`.
  - `onSettled`: invalidate `permissionGrants()` to reconcile with server truth.

## 6. Drawer store — `src/lib/store/setupDrawerStore.ts`

Only cross-component UI state this feature needs (row action in a tab → Sheet owned by the
view). Zustand, no persist/middleware needed:

```ts
import { create } from "zustand";
import type { Employee, Page, Role } from "@/types/setup";

type SetupEntity = "employee" | "role" | "page";

type SetupDrawerState =
  | { open: false }
  | { open: true; entity: "employee"; mode: "create" }
  | { open: true; entity: "employee"; mode: "edit"; data: Employee }
  | { open: true; entity: "role"; mode: "create" }
  | { open: true; entity: "role"; mode: "edit"; data: Role }
  | { open: true; entity: "page"; mode: "create" }
  | { open: true; entity: "page"; mode: "edit"; data: Page };

type SetupDrawerStore = {
  drawer: SetupDrawerState;
  openCreate: (entity: SetupEntity) => void;
  openEdit: (entity: SetupEntity, data: Employee | Role | Page) => void;
  close: () => void;
};

export const useSetupDrawerStore = create<SetupDrawerStore>((set) => ({
  drawer: { open: false },
  openCreate: (entity) =>
    set({ drawer: { open: true, entity, mode: "create" } as SetupDrawerState }),
  openEdit: (entity, data) =>
    set({
      drawer: { open: true, entity, mode: "edit", data } as SetupDrawerState,
    }),
  close: () => set({ drawer: { open: false } }),
}));
```

## 7. `SetupView.tsx` (edit existing placeholder)

```tsx
"use client";

import { useQueryState } from "nuqs";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmployeesTab } from "@/components/pages/setup/EmployeesTab";
import { RolesTab } from "@/components/pages/setup/RolesTab";
import { PagesTab } from "@/components/pages/setup/PagesTab";
import { PermissionsTab } from "@/components/pages/setup/PermissionsTab";
import { SetupSheet } from "@/components/pages/setup/SetupSheet";

const SetupView = () => {
  const [tab, setTab] = useQueryState("tab", { defaultValue: "employees" });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="pages">Pages</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
        </TabsList>
        <TabsContent value="employees">
          <EmployeesTab />
        </TabsContent>
        <TabsContent value="roles">
          <RolesTab />
        </TabsContent>
        <TabsContent value="pages">
          <PagesTab />
        </TabsContent>
        <TabsContent value="permissions">
          <PermissionsTab />
        </TabsContent>
      </Tabs>
      <SetupSheet />
    </div>
  );
};

export default SetupView;
```

Each `*Tab.tsx` owns exactly one scoped primary button (`+ New Employee` / `+ New Role` /
`+ New Page`) calling `useSetupDrawerStore().openCreate(entity)` — no global create dropdown,
per the "no 3 buttons" rule.

## 8. Tab-by-tab notes (kept from original spec, mapped to real files)

### EmployeesTab / EmployeeTable / EmployeeForm

- Table columns: Name, Role (`Badge`), Daily Rate (format paise → currency in a small
  `formatPaise()` helper in `lib/utils.ts`, don't invent a new util file for one function),
  Status, kebab `DropdownMenu` (Edit / Delete).
- `EmployeeForm`: RHF + `zodResolver(employeeSchema)`, same shape as `LoginForm.tsx`
  (`Form`/`FormField`/`FormItem`/`FormControl`/`FormMessage`, `FloatingLabelInput` where it
  fits, `ToggleGroup` for login method). Conditionally render email/password fields vs
  `QrTokenPanel` based on `form.watch("loginMethod")`.
- `QrTokenPanel`: calls `useGenerateEmployeeQrMutation`, shows `Skeleton` while pending,
  then the token + "Download" (canvas/QR lib decision deferred — out of scope for this
  plan, flag with `ponytail:` when implementing) + "Copy Raw Token" (`navigator.clipboard`).
- Role `Select` in the same form sets `roleId` — no separate assign-role screen (per spec).

### RolesTab / RoleTable / RoleForm

- `isSystem` badge (`<Badge variant="secondary">System</Badge>`), hide Delete in the
  kebab menu when `isSystem`, disable the Name field + show a warning line in edit mode.

### PagesTab / PageTable / PageForm

- Key disabled on edit (`disabled={mode === "edit"}` on the form field, not a separate prop
  drilling scheme). Module `Select` sourced from `useModulesQuery`.

### PermissionsTab

Resolved with the user: permissions stay **Role-scoped** (`RolePage`, matches the given
schema — Employees inherit access via `roleId`, standard RBAC, few rows). The tab has two
modes via a `ToggleGroup` at the top: **Edit by Role** (default) and **View by Employee**
(read-only).

**Edit by Role** (`RolePermissionEditor.tsx`):

1. `Select` of Roles (few items, no search needed — plain `Select`, not a combobox).
2. Once a role is picked, render a grid/list of **Modules** (from `useModulesQuery`) as
   cards/buttons — this module grouping is UI-only, purely for organizing which pages to
   show, not a separate grantable entity.
3. Clicking a module opens `ModulePagesPopover.tsx` (a `Popover`, not a second `Sheet` —
   keeps the role picker visible underneath): checkbox list of that module's `Page`s,
   pre-checked from `usePermissionGrantsQuery` filtered to `roleId + moduleId`. Toggling
   updates in-memory local state only (`Map<pageId, boolean>` in the editor, not submitted
   yet) — this lets the admin flip through several modules before committing.
4. A single **Submit** button on `RolePermissionEditor` diffs the local state against the
   original grants and calls `useUpdateRolePermissionsMutation(roleId)` once with the
   `RolePermissionDiff` payload — `{ [moduleId]: { added: [pageId...], deleted: [pageId...] } }`
   — only for modules that actually changed (empty diffs omitted, not sent as `{added:[],deleted:[]}`
   noise).

**View by Employee** (`EmployeeCombobox.tsx` + `EmployeePermissionPreview.tsx`):

- `EmployeeCombobox`: `Popover` + `Input`, filters the already-fetched
  `useEmployeesQuery()` list client-side through `useDebouncedValue(search, 250)` — no new
  API call per keystroke. (Flag `ponytail:` if the employee list ever grows into the
  thousands: switch to a server-side `?search=` query param on `getEmployees` at that
  point, not before.)
- On select, resolve `employee.roleId` → reuse the exact same grants-filtered-by-role
  view as the editor, but every `Checkbox` is `disabled` and there's no Submit — just a
  "Edit this role's permissions →" link that switches the top toggle to Edit-by-Role with
  that role pre-selected. No separate read-only data shape needed, same derived view.

## 9. Shared: `SetupSheet.tsx` + `ConfirmDeleteDialog.tsx`

- `SetupSheet` reads `useSetupDrawerStore()`, renders the `Sheet` open state from
  `drawer.open`, switches on `drawer.entity` to pick `EmployeeForm | RoleForm | PageForm`,
  passes `mode`/`data` straight through. On `Sheet`'s `onOpenChange(false)`, if the active
  form's `formState.isDirty`, open an `AlertDialog` ("Discard unsaved changes?") before
  actually closing — don't close immediately.
- **Add/edit as one form, no `useEffect` sync**: don't fetch-then-`form.reset(data)` in an
  effect — that's the classic RHF stale-defaultValues bug (race between mount and fetch,
  double-renders). Instead key each form by its target so React remounts it fresh whenever
  the drawer target changes, and compute `defaultValues` inline, synchronously, from the
  `mode`/`data` already sitting in `setupDrawerStore` (no extra fetch — the row data came
  from the table's own list query, which is already in the cache):

  ```tsx
  <EmployeeForm
    key={drawer.mode === "edit" ? `edit-${drawer.data.id}` : "create"}
    mode={drawer.mode}
    defaultValues={
      drawer.mode === "edit" ? toEmployeeInput(drawer.data) : undefined
    }
  />
  ```

  The `key` change forces a clean remount (fresh `useForm()` call) instead of a stale form
  instance carrying over old field values — no `useEffect`, no manual reset call, no sync
  bugs. Same pattern for `RoleForm`/`PageForm`.

- `ConfirmDeleteDialog` lives in `components/common/` (not `pages/setup/`) since every
  future feature's kebab-menu Delete will reuse it verbatim: `{ open, onOpenChange, onConfirm,
isPending, title, description }`. Each `*Table.tsx` owns its own delete mutation and just
  passes the confirm callback in.

## 10. Build order (smallest independent units first)

1. `types/setup.ts` + `routes.ts` edit — no UI, typecheck only.
2. Hand-author missing `ui/` primitives (tabs, table, badge, checkbox first — needed by
   every tab); dialog/alert-dialog/dropdown-menu/select/toggle-group/popover next.
   `hooks/use-debounced-value.ts` alongside popover (both only needed for Permissions).
3. `lib/api/setup/{fetchers,queries}.ts`.
4. `common/ConfirmDeleteDialog.tsx` (needed by all three list tabs).
5. `lib/store/setupDrawerStore.ts`.
6. Employees vertical slice end-to-end (table → form → sheet wiring, incl. the
   key-remount pattern from §9) — validates the whole pattern before copy-pasting to
   Roles/Pages.
7. Roles, Pages tabs (near-identical shape to Employees, smaller diff each).
8. Permissions tab: `RolePermissionEditor` + `ModulePagesPopover` first (the editable,
   higher-value path), `EmployeeCombobox` + `EmployeePermissionPreview` after (read-only,
   additive).
9. Wire `SetupSheet` + `SetupView` tabs together, delete this file.

Each step above is a `@cavecrew-builder`/self-sized diff (≤2 files) except step 6 (first
full vertical slice) and step 2 (multiple new ui primitives), which should go through
`@Nextjs Builder` and get a `@Nextjs Reviewer` pass before copy-pasting the pattern to
Roles/Pages.

## 11. Appendix — sidebar off the backend instead of `lib/navigation/pages.ts`?

Short answer: **directionally correct, don't do it as part of this build.**

- Today `pages.ts` serves two different jobs bundled into one static array: (a) sidebar
  grouping/labels (`getSidebarSections`, consumed by [Sidebar.tsx](../../common/Sidebar.tsx)),
  and (b) per-stub-page display metadata (`getPageDefinition`, consumed by
  `ModulePageShell` in ~35 not-yet-built feature views). Only (a) is what you're asking
  about; (b) is scaffolding for pages that don't have real content yet.
- The actual security gate ([proxy.ts](../../../../proxy.ts)) **already doesn't touch
  `pages.ts` at all** — it decodes `allowedPages: string[]` straight out of the JWT and does
  a path-prefix check. So today's setup is already "safe" in the sense you mean; `pages.ts`
  is a display-layer duplication problem, not a security one.
- Once this Setup page's Pages/Modules tabs exist, the backend genuinely becomes the
  source of truth for `{ path, label, module, sortOrder }` — at that point yes, change
  `/auth/me` (or a dedicated `/setup/pages/mine`) to return the full `Page[]` (+ resolved
  `Module.name`) for the caller's role instead of just bare path strings, and have
  `Sidebar.tsx` group directly off that response. `getSidebarSections`/`getPageDefinition`
  and the static array can then be deleted.
- Why not now: no backend endpoint exists yet for it (repo rule: backend-first, don't get
  ahead of the API), and it's a ~35-file mechanical refactor (every stub view's
  `getPageDefinition` call) that's independent of getting the Setup CRUD itself working.
  Do the Setup feature first: it's the thing that makes the backend data trustworthy
  enough to point the sidebar at. Track the sidebar swap as a fast-follow once `/setup/pages`
  is live and seeded.
