---
name: design-system
description: "Use whenever you build, change, design or review any screen or UI component in frontend/: which colour, type, density and motion tokens to use, the status → tone map, the shared component catalogue (StatusBadge, PageHeader, DetailHeader, DocumentFlow, FilterBar, Pagination, EmptyState, ErrorState, StatCard, DataTable), the four screen patterns (list, detail, form, dashboard), the motion allow-list, and the do / do-not rules the design-reviewer checks. Triggers: new page, new list, detail screen, form, badge, status colour, button colour, spacing, dark mode, density, animation, transition, skeleton, empty state, error state, design review, screens.md, mock screenshot. DO NOT USE for backend work or for data fetching patterns (see client-data-state)."
---

# Design system — how every screen looks

The rules are the frozen spec `docs/specs/design-system/spec.md` (BR-DS-01..27); exact token values and the
full status table live there and in `src/app/globals.css` — this skill tells you **what to use and how**,
it never repeats the values. Screen patterns: `docs/specs/design-system/design/screens.md`. As-built map:
`docs/modules/design-system.md`. Reference module: purchase orders (`components/views/purchase-orders/`).

## 1. Colour — tokens only (BR-DS-01, 02, 26)
- Use Tailwind utilities generated from tokens: `bg-background`, `bg-card`, `text-foreground`,
  `text-muted-foreground`, `border-border`, `border-input`, `bg-primary text-primary-foreground`,
  `text-brand-accent`, `bg-<tone>-subtle text-<tone>` for `neutral | warning | info | success`,
  `bg-destructive-subtle text-destructive` for danger, `bg-table-header`, `text-sidebar-muted`.
- **Never** a raw palette class (`bg-amber-100`, `text-rose-800`, `emerald-*`, `slate-*`…) or a hex/rgb
  value outside `src/components/ui/**` and `globals.css`. `bun run standards:check` reports them.
- Colour carries weight in **seven places only**: active sidebar item · 2 px accent band under the `h1`
  (PageHeader / DetailHeader do it) · table header row · document-number links (accent, mono) · focus ring
  · StatCard left edge · the one primary button. Plus status tones, selection/position and the brand mark.
  No gradients, no coloured page background, no coloured card fill.
- `--primary` (emerald) = **fill of the main action only**, never text. At most one primary button per page
  header or dialog (BR-DS-06). Secondary actions: `variant="outline"` or `"secondary"`.
- `--brand-accent` (steel blue) = selection, position and links only: selected filter chip, current page,
  current step, avatar, link text. **Never a status and never a StatCard tone** (BR-DS-07).
- Danger tone only for destructive actions, refused / failed / late statuses and error messages (BR-DS-08).
- Every new colour pair must pass `bun run contrast:check` (4.5:1 text, 3:1 borders / rings / charts).
  A new token, tone, weight place or motion place is an **owner decision** first (BR-DS-24): stop and say so.

## 2. Type, numbers, density (BR-DS-18, 19, 16)
- One `h1` per page, and it comes from `PageHeader` or `DetailHeader` — never write `<h1>` yourself (BR-DS-22).
- Document numbers: `font-mono`; numeric columns right-aligned with `tabular-nums` (`numeric` on the
  DataTable column).
- Dates, money, quantities **only** through `src/lib/format.ts`: `formatDate`, `formatDateTime` (IST),
  `formatMoney(paise, { whole? })` (`₹4,82,000.00`; `whole` only on stat cards), `formatQty(value, unit,
  decimals)`, `formatDocNo`. Empty → `–`. Money is paise in, rupees out — never divide by 100 yourself.
- Row height and table text come from `html[data-density]` through `components/ui/table.tsx`; never set a
  row height on a table yourself. Icons: Tabler, 16 px, stroke 1.75.

## 3. Status → badge (BR-DS-03, 04, 05)
- Always `<StatusBadge doc="po" status={row.status} />`. Docs: `pr`, `po`, `grn`, `grnQa`, `sco`,
  `challanDue`, `approval`, `prLine`. Label, tone and icon come from `src/lib/status-tone.ts`.
- New status values go into `status-tone.ts` using an **existing** tone (neutral = not started, warning =
  waiting on someone, info = moving, success = done, danger = refused / failed / late, closed = filed or
  cancelled). Unknown or null status renders a neutral "Unknown" — never throw, never a local colour map.
- Never colour alone: the badge always carries its label and icon.

## 4. Component catalogue (`src/components/shared/`, props in each file)
| Need | Use | Notes |
|---|---|---|
| Page title + actions | `PageHeader` | `title`, `description?`, `actions?`; actions wrap below 640 px |
| Document header | `DetailHeader` | `docNo`, `status` (a `StatusBadge`), `meta` pairs, `actions`, `backHref`, `backLabel`, `loading` |
| PR → PO → GRN chain | `DocumentFlow` | `steps[{label, docNo, href, status, state: done\|current\|todo}]`; one step → not rendered |
| Quick filters | `FilterBar` | `quick[{key,label,count}]`, `value`, `onChange`, `onReset`, `filtersActive`; state lives in the URL (nuqs) in the view |
| Table | `common/DataTable` | gives skeleton rows (`aria-busy`), `emptyState`, `errorState`, `--table-header` row, `numeric` columns |
| Paging | `Pagination` | "1 to 25 of 41"; sizes from `lib/pagination.ts` `PAGE_SIZE_OPTIONS` |
| Nothing to show | `EmptyState` | title says what is missing; at most one action; no illustration |
| Load failed | `ErrorState` | server message in plain words + "Try again" (`onRetry`, `retrying`) |
| Dashboard number | `StatCard` | tone from the status tones, never accent; `countUp` once per mount |
| Row changed by me | `StatusFlashRow` + `lib/status-flash.ts` | flash once, only after the current user's own action |
| Last breadcrumb = doc number | `useBreadcrumbLast(docNo)` (`components/shell`) | the shell draws the only breadcrumb trail |
Shared components take **no permission input**: the view decides with the existing checks and simply does
not render what the user may not use — no disabled ghost, no gap (BR-DS-27).

## 5. Screen patterns (`design/screens.md`)
- **List** = `PageHeader` + `FilterBar` + `DataTable` + `Pagination`; document number first (mono accent
  link), status second, numbers right, dates last. States: 8 skeleton rows · `EmptyState` (with filters:
  "Nothing matches these filters" + Reset) · `ErrorState`. Filter and page state in the URL; a page using
  nuqs needs a `loading.tsx` next to `page.tsx` (no spinner).
- **Detail** = `DetailHeader` + `DocumentFlow` + cards in one column (≤ 1100 px). Destructive actions in a
  "More" menu and always confirmed in a dialog that names the document. Running action: button disabled
  with an "…ing" label.
- **Form** = ≤ 6 fields → dialog, else its own page; two columns from 768 px; every field keeps `min-h-19`;
  actions bottom right: "Cancel" then one primary named for what it does; money / qty right-aligned with
  the unit; submitting → "Saving…".
- **Dashboard** = `StatCard`s (3–4 per row) + at most two short panels; each card loads on its own.
Content area: the shell gives 20 px padding — do not add page padding (`p-6`) inside a view.

## 6. Motion (BR-DS-09..14)
Only these eight places move: dialog/sheet/popover/dropdown enter-exit · toast · sidebar fold · table row
hover · button press/hover · skeleton sweep (only while loading) · status flash (once) · StatCard count-up
(once). Allowed spellings: `transition-colors | transition-opacity | transition-transform |
transition-[width]`, `duration-(--motion-fast|base|slow)`, `ease-standard`, `animate-skeleton`,
`animate-status-flash`. Never: `transition-all`, bare `transition`, `duration-150`, `delay-*`, other
`ease-*`, `animate-spin` or any spinner, route transitions, bounce, decorative or scroll motion. Motion
outside `src/components/ui/**` needs an entry in `frontend/design/motion-allowlist.json` (owner decision).
Reduced motion is handled globally in `globals.css` — do not add per-component checks.

## 7. Focus, dark mode, permissions
- Focus ring comes from `globals.css` (solid 2 px, 2 px offset, `--ring`); never `outline-none` without
  a visible replacement, never a half-transparent `ring-*/50` (BR-DS-20).
- Every screen must work in light and dark (BR-DS-15): use tokens, never `dark:` palette overrides.
- Permission-hidden = not rendered; the header keeps its height.

## 8. Before you hand over (frontend-dev) — and what design-reviewer checks
1. `bun run standards:check -- --strict=mutation-invalidate,motion` and plain `standards:check` (no new
   raw-palette hits in your files); `bun run contrast:check` if you touched tokens.
2. List the screens (routes) you changed under "Screens touched" in your report.
3. design-reviewer (build mode) screenshots each changed screen light + dark × desktop 1440×900 + tablet
   1024×768, checks the rules above and `design/screens.md`, and reports `DES-` findings:
   blocker = spec field/action missing, unreadable in dark, critical a11y; major = pattern or token breach;
   minor = spacing, wording.
