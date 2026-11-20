---
module: design-system
spec: docs/specs/design-system/spec.md (v2 frozen)
last_verified_commit: ea1d04f
last_verified_on: 2026-11-20
depends_on: []
---

# Design system — as-built map

> What the code **is** (the spec says what it **should be**). Agents read this before touching the module
> and only explore code changed since `last_verified_commit`
> (`git diff ea1d04f..HEAD --stat -- frontend/src/app/globals.css frontend/src/components/ui frontend/src/components/shared frontend/src/components/shell frontend/src/lib/shell frontend/src/lib/status-tone.ts frontend/src/lib/format.ts frontend/src/lib/pagination.ts frontend/src/lib/status-flash.ts frontend/scripts frontend/design`).
> Use symbol names, not line numbers — lines rot.

## Summary
Frontend only. Colour, type, density and motion tokens; one status map; shared list/detail components; the
app shell (sidebar, top bar, breadcrumbs, user menu); purchase orders (list, detail, create/edit) are the
reference module. BR-DS-01..29 built. v1: epic `epic/design-system` (PR #108). v2 (2026-11-20): graphite + indigo, 14 px body, 36 px controls, 44 / 36 px rows, label-above fields — epic `epic/design-system-v2`.

## Code locations
| Area | Path | Key symbols / notes |
|---|---|---|
| Tokens | `frontend/src/app/globals.css` | `:root` / `.dark` tokens, `@theme inline` map, `--motion-*`, `--ease-standard`, `--animate-skeleton` / `--animate-status-flash` + keyframes, `html[data-density]` → `--row-height` / `--table-text-size`, reduced-motion block (zeroes every transition, `!important` → 2 Biome warnings, kept), focus ring: unlayered `:where(*)` outline colour + scoped `:focus-visible` rule |
| Fonts | `frontend/src/app/layout.tsx` | Manrope + Geist Mono (`--font-geist-mono`, `preload: false`); inline density script sets `data-density` before paint |
| Primitives | `frontend/src/components/ui/**` | only allowed motion spellings; `ui/table.tsx` applies the density row height and text size to **every** table (not only DataTable) |
| Status map | `frontend/src/lib/status-tone.ts` | `getStatusTone(doc, status)`; docs `pr`, `po`, `grn`, `grnQa`, `sco`, `challanDue`, `approval`, `prLine`, supplier, item, machine, employee, policy; unknown → neutral "Unknown" |
| Format | `frontend/src/lib/format.ts` | `formatDate`, `formatDateTime` (IST), `formatMoney(paise, {whole})`, `formatQty`, `formatDocNo` |
| Shared | `frontend/src/components/shared/` | `StatusBadge`, `StatCard` (count-up, allow-listed), `PageHeader`, `DetailHeader`, `DocumentFlow`, `FilterBar`, `Pagination`, `EmptyState`, `ErrorState`, `StatusFlashRow` (allow-listed); `lib/pagination.ts` (`PAGE_SIZE_OPTIONS`), `lib/status-flash.ts` |
| Table | `frontend/src/components/common/DataTable.tsx` | `emptyState`, `errorState`, skeleton rows + `aria-busy`, `--table-header` row, `numeric` columns, `hidePagination` |
| Shell | `frontend/src/components/shell/` + `lib/shell/` | `AppShell` / `ShellFrame`, `TopBar`, `Breadcrumbs` (`buildBreadcrumbs`, `useBreadcrumbLast` for the document number), `UserMenu`, `nav-icons.ts`, `density.ts` (`diecast.density`), `sidebar-fold.ts` (`diecast.sidebar.folded`); nav still comes from the server `screens` list |
| PO list | `views/purchase-orders/PurchaseOrdersView.tsx`, `use-po-queue-controls.ts`, `app/(protected)/purchase-orders/loading.tsx` | approved-requisition queue on PageHeader + FilterBar + DataTable + Pagination; URL state via nuqs (needs `loading.tsx`); quick-filter counts = 2 extra list calls |
| PO detail / form | `views/purchase-orders/PurchaseOrderDetailView.tsx`, `pages/purchase-orders/EditPOModal.tsx` | route is keyed by the requisition (`[prId]`); DetailHeader + DocumentFlow; Close / Short-close / Cancel in "More" with confirms; flash only for the document the user changed |
| Checks | `frontend/scripts/standards-rules.ts`, `standards-check.ts`, `contrast-check.ts`, `frontend/design/motion-allowlist.json` | raw-palette + hex (report mode), motion (blocking in CI), `size` (`checkSize`, BR-DS-28: whole JSX tags, any control under 32 px, text under 12 px, `text-xs` outside the badge) and `field-look` (`checkFieldLook`, BR-DS-29), both report mode; contrast (`bun run contrast:check`, in CI) |
| Tests | `frontend/tests/**` (`bun run test`, in CI), `frontend/e2e/design-system*.spec.ts`, `frontend/e2e/support/auth.ts` (one cached login) | e2e runs locally before push and in CI only on PRs into `main` (D-024) |

## Gotchas
- Login rate limiter: e2e must reuse one saved session (`e2e/support/auth.ts`), never log in per test.
- Measure table rows only after loading ends (skeleton rows are replaced; their box reads 0).
- Server nav labels differ from spec wording ("POs (Purchase Orders)"): find nav items by `href`.
- `useSearchParams` / nuqs on a page needs `loading.tsx`, or `next build` fails.
- Fields: label above (`FormLabel` with explicit `htmlFor` inside forms, so the error colour stays; `Label` outside forms) over a 36 px `Input`. `ui/floating-label.tsx` is gone; the `field-look` check flags its return.
- `text-xs` is 12 px: allowed only in `StatusBadge` / `ui/badge` (BR-DS-28); body text is `text-sm`.
- Menus (`dropdown-menu`, `select`) use `--popover`; the forced `dark` class was removed in v2.
- `transition-colors` on focusable elements animated the outline from `currentColor`; the resting outline colour is set to `--ring` for that reason.

## History
| Date | Change | PR |
|---|---|---|
| 2026-11-18 | Epic design-system: foundation, shell, purchase-order adoption | #101, #102, #103 → #108 |
| 2026-11-20 | Epic design-system-v2: graphite + indigo, sizes one step up, 12 px text moved to type roles app-wide, label-above fields, size + field-look checks | epic PR (sub-features merged locally) |
