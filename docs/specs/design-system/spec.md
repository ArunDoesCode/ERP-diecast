---
module: design-system
status: draft            # draft | frozen (set only by /freeze)
version: 0
frozen_on:
owner: Arun
depends_on: []
brief: docs/plans/agentic-workflow-v2.md   # Phase 3 (3.1–3.5); no separate brief
research:
---

# Design system

> Agent layer. The owner reads `OWNER.md` and opens `preview.html`. Screens: `design/screens.md`.
> Choices made without the owner: `assumptions.md`. `preview.html` is the visual reference: when
> this file and the preview disagree, this file wins and the preview gets fixed.
> Values below are **palette A**. Where the owner picks B, use the B column of "Palette switch".

## Summary
One set of colour, type and motion tokens, one status map and ten shared components for the
frontend (Next.js 16, Tailwind v4, shadcn radix-mira, Manrope, Tabler icons, next-themes).
Users: purchase, stores and planning staff on desktops, long sessions, dense tables. Tone: calm,
industrial, precise. Done = every protected view uses the tokens and shared components, light and
dark both pass contrast, and motion exists only in the eight allowed places.
No backend change, no new library, no business rule of any module changes.

## Tokens — colour
Add to `frontend/src/app/globals.css` (`:root` and `.dark`) and map each in `@theme inline` as
`--color-<name>`. `H` = neutral hue (A 250, B 65). Tokens not listed keep today's value.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `oklch(0.982 0.005 H)` | `oklch(0.17 0.012 H)` | Page |
| `--foreground` | `oklch(0.21 0.018 H)` | `oklch(0.95 0.006 H)` | Text |
| `--card`, `--popover` | `oklch(1 0 0)` | `oklch(0.215 0.014 H)`, `oklch(0.24 0.015 H)` | Cards, tables; dialogs, menus, toasts |
| `--card-foreground`, `--popover-foreground` | = foreground | = foreground | Text on them |
| `--primary` | `oklch(0.508 0.118 165.612)` (kept) | `oklch(0.432 0.095 166.913)` (kept) | Fill of the main action; never text colour |
| `--primary-foreground` | `oklch(0.979 0.021 166.113)` (kept) | same (kept) | Text on primary |
| `--secondary` | `oklch(0.955 0.008 H)` | `oklch(0.27 0.014 H)` | Secondary button fill |
| `--secondary-foreground` | `oklch(0.25 0.018 H)` | `oklch(0.95 0.006 H)` | Text on it |
| `--muted` | `oklch(0.962 0.006 H)` | `oklch(0.26 0.014 H)` | Table header, skeleton |
| `--muted-foreground` | `oklch(0.49 0.02 H)` | `oklch(0.72 0.015 H)` | Secondary text, column heads |
| `--accent` | `oklch(0.95 0.01 H)` | `oklch(0.28 0.016 H)` | Hover surface (shadcn meaning, unchanged role) |
| `--accent-foreground` | `oklch(0.25 0.018 H)` | `oklch(0.95 0.006 H)` | Text on hover surface |
| `--border` | `oklch(0.91 0.008 H)` | `oklch(1 0 0 / 10%)` | Lines |
| `--input` | `oklch(0.87 0.01 H)` | `oklch(1 0 0 / 16%)` | Field and outline-button border |
| `--ring` | `oklch(0.62 0.1 165)` | `oklch(0.6 0.1 165)` | Focus ring |
| `--success` | `oklch(0.5 0.125 150)` | `oklch(0.8 0.14 152)` | Tone text, dot, solid fill |
| `--success-foreground` | `oklch(0.985 0.02 150)` | `oklch(0.2 0.05 152)` | Text on solid success |
| `--success-subtle` | `oklch(0.95 0.04 152)` | `oklch(0.29 0.055 152)` | Badge and icon-chip tint |
| `--warning` | `oklch(0.5 0.11 70)` | `oklch(0.83 0.13 82)` | as above |
| `--warning-foreground` | `oklch(0.99 0.02 85)` | `oklch(0.22 0.05 80)` | |
| `--warning-subtle` | `oklch(0.955 0.05 88)` | `oklch(0.31 0.055 75)` | |
| `--info` | `oklch(0.5 0.11 228)` | `oklch(0.79 0.1 228)` | as above |
| `--info-foreground` | `oklch(0.985 0.015 228)` | `oklch(0.2 0.04 232)` | |
| `--info-subtle` | `oklch(0.95 0.03 228)` | `oklch(0.29 0.05 232)` | |
| `--neutral` | `oklch(0.45 0.02 H)` | `oklch(0.78 0.012 H)` | as above |
| `--neutral-foreground` | `oklch(0.985 0.003 H)` | `oklch(0.2 0.01 H)` | |
| `--neutral-subtle` | `oklch(0.94 0.008 H)` | `oklch(0.29 0.012 H)` | |
| `--destructive` | `oklch(0.53 0.2 27)` (changed) | `oklch(0.76 0.14 22)` (changed) | Danger tone, delete actions |
| `--destructive-foreground` | `oklch(0.985 0.01 27)` | `oklch(0.2 0.05 25)` | new |
| `--destructive-subtle` | `oklch(0.955 0.025 25)` | `oklch(0.29 0.06 22)` | new |
| `--brand-accent` | `oklch(0.47 0.085 262)` | `oklch(0.78 0.085 262)` | Second brand colour: selected filter, current step, current page, avatar, link text |
| `--brand-accent-foreground` | `oklch(0.98 0.01 262)` | `oklch(0.2 0.03 262)` | Text on solid accent |
| `--brand-accent-subtle` | `oklch(0.948 0.025 262)` | `oklch(0.3 0.045 262)` | Tint behind accent text |
| `--chart-1` | `oklch(0.58 0.13 165)` | `oklch(0.72 0.14 165)` | Emerald |
| `--chart-2` | `oklch(0.55 0.12 252)` | `oklch(0.7 0.12 252)` | Blue |
| `--chart-3` | `oklch(0.64 0.14 70)` | `oklch(0.78 0.13 78)` | Amber |
| `--chart-4` | `oklch(0.55 0.13 305)` | `oklch(0.7 0.13 305)` | Violet |
| `--chart-5` | `oklch(0.6 0.15 20)` | `oklch(0.72 0.14 20)` | Rose |
| `--sidebar` | `oklch(0.962 0.01 H)` | `oklch(0.2 0.014 H)` | Sidebar (soft) |
| `--sidebar-foreground` | `oklch(0.3 0.02 H)` | `oklch(0.9 0.008 H)` | |
| `--sidebar-muted` | `oklch(0.49 0.02 H)` | `oklch(0.7 0.015 H)` | Group labels (new) |
| `--sidebar-primary` | `oklch(0.508 0.118 165.612)` | `oklch(0.696 0.17 162.48)` (kept) | Brand mark, active marker |
| `--sidebar-accent` | `oklch(0.925 0.045 165)` | `oklch(0.3 0.05 165)` | Active item tint (from primary) |
| `--sidebar-accent-foreground` | `oklch(0.36 0.09 166)` | `oklch(0.86 0.11 165)` | Active item text |
| `--sidebar-border` | `oklch(0.9 0.01 H)` | `oklch(1 0 0 / 10%)` | |

**Palette switch (owner card 1).** B changes only: `H` 65; `--brand-accent` light
`oklch(0.5 0.115 45)` / dark `oklch(0.78 0.1 55)`; `-foreground` `oklch(0.985 0.012 60)` /
`oklch(0.21 0.04 50)`; `-subtle` `oklch(0.955 0.028 55)` / `oklch(0.3 0.045 50)`; `--chart-2`
`oklch(0.56 0.12 45)` / `oklch(0.72 0.12 50)`; `--chart-3` `oklch(0.55 0.12 252)` /
`oklch(0.7 0.12 252)`; `--chart-5` `oklch(0.58 0.15 350)` / `oklch(0.72 0.13 350)`.

**Strong sidebar (owner card 3, option B).** Light: `--sidebar oklch(0.255 0.03 H)` (B: chroma
0.018), `-foreground oklch(0.9 0.012 H)`, `-muted oklch(0.72 0.015 H)`, `-accent oklch(0.37 0.065 165)`,
`-accent-foreground oklch(0.94 0.07 165)`, `-border oklch(1 0 0 / 8%)`. Dark: `--sidebar
oklch(0.125 0.012 H)`, `-accent oklch(0.27 0.05 165)`.

Each tone is three tokens. Text or dot in the tone = `--<tone>` on `--<tone>-subtle` or on a card.
Solid fill = `--<tone>` with `--<tone>-foreground`. Measured: lowest text pair 4.96 (light), 5.88
(dark); lowest chart colour on card 3.5; A and B, soft and strong sidebar all pass.

## Tokens — type, density, shape
Font: Manrope (`--font-sans`, loaded today). Mono: load Geist Mono through `next/font` so
`--font-geist-mono` (already named in `@theme`) resolves. Numbers use `tabular-nums`.

| Role | Size / line | Weight | Where |
|---|---|---|---|
| Page title | 20 / 28 | 700 | `PageHeader`, `DetailHeader` (the only `h1`) |
| Section title | 15 / 22 | 700 | Card and dialog titles, empty state |
| Body | 13 / 20 | 400 | Forms, descriptions |
| Table cell | density token | 400 | `DataTable` |
| Label | 12 / 16 | 600 | Column heads, field labels, stat labels, buttons |
| Badge | 11 / 20 | 600 | `StatusBadge` |
| Stat value | 26 / 34 | 700 | `StatCard` |
| Document number | 0.92 em | 500 | mono, in tables and headers |

| Density | Row height | Table text | Set by |
|---|---|---|---|
| comfortable (default, card 2 B) | 36 px | 13 px | `data-density` on `<html>` |
| compact (today's size) | 30 px | 12 px | user switch, kept in `localStorage` |
| touch (card 5, later) | 44 px | 14 px | not built now |

Radius stays `--radius: 0.625rem`. Badges are pills. Icons: Tabler, 16 px, stroke 1.75.

## Tokens — motion
| Token | Value | Use |
|---|---|---|
| `--motion-fast` | 120 ms | Hover, press, every exit |
| `--motion-base` | 180 ms | Enter of dialog, sheet, popover, toast |
| `--motion-slow` | 260 ms | Sidebar fold |
| `--motion-emphasis` | 600 ms | Status flash, count-up (once) |
| `--ease-out` | `cubic-bezier(0.2, 0, 0, 1)` | The only curve |

**Allow-list — the only places motion may exist**
| # | Place | What moves | Token |
|---|---|---|---|
| 1 | Dialog, sheet, popover, dropdown | opacity, scale 0.96 → 1 (sheet: slide from its edge) | in base, out fast |
| 2 | Toast | opacity, 8 px slide up | in base, out fast |
| 3 | Sidebar fold | width | slow |
| 4 | Table row hover | background colour | fast |
| 5 | Button press and hover | 1 px down while pressed, background colour | fast |
| 6 | Skeleton | shimmer sweep, 1.4 s linear, only while loading | fixed |
| 7 | Status change highlight | row background from `--success-subtle` to none, once | emphasis |
| 8 | Number count-up | `StatCard` value from 0 to value, once per page load | emphasis |

Colour-only transitions on focus rings, inputs and links count under 5 (fast, no movement).

**Never:** page or route transitions, bounce or spring curves, any loop other than 6, scroll-triggered
motion, decorative motion, staggered list entrances, motion on badges, icons or charts.

**Reduced motion:** under `prefers-reduced-motion: reduce` all five duration tokens are `0ms`, the
skeleton is a flat `--muted` block, the status flash is skipped, count-up shows the final value.

Files allowed to use `transition-*`, `animate-*`, `duration-*` are listed in
`frontend/design/motion-allowlist.json`; this spec adds `src/components/shared/StatCard.tsx` and
`src/components/shared/StatusFlashRow.tsx` (or the row wrapper that implements 7). All other
motion lives in `src/components/ui/**`.

## Status → tone
One map in `frontend/src/lib/status-tone.ts`. Tones: `neutral`, `warning`, `info`, `success`,
`danger`, `closed` (outline, hollow dot, muted text).

| Tone | Meaning |
|---|---|
| neutral | Not started, or no judgement |
| warning | Waiting on someone, or needs attention |
| info | Moving, partly done |
| success | Approved, accepted, complete |
| danger | Refused, failed, late |
| closed | Finished and filed, or cancelled |

| Document | Status | Label | Tone |
|---|---|---|---|
| PR | `draft` | Draft | neutral |
| PR | `pending_approval` | Pending approval | warning |
| PR | `approved` | Approved | success |
| PR | `rejected` | Rejected | danger |
| PR | `partial_ordered` | Partly ordered | info |
| PR | `fully_ordered` | Fully ordered | success |
| PR | `cancelled` | Cancelled | closed |
| PO | `draft` | Draft | neutral |
| PO | `pending_approval` | Pending approval | warning |
| PO | `approved` | Approved | success |
| PO | `dispatched` | Dispatched | info |
| PO | `partial_received` | Partly received | info |
| PO | `fully_received` | Fully received | success |
| PO | `invoiced` | Invoiced | success |
| PO | `closed` | Closed | closed |
| PO | `cancelled` | Cancelled | closed |
| GRN | `draft` | Draft | neutral |
| GRN | `pending_qa` | Pending QA | warning |
| GRN | `accepted` | Accepted | success |
| GRN | `partial_accepted` | Partly accepted | warning |
| GRN | `rejected` | Rejected | danger |
| GRN QA | `pending` | Pending | warning |
| GRN QA | `passed` | Passed | success |
| GRN QA | `failed` | Failed | danger |
| GRN QA | `waived` | Waived | neutral |
| SCO | `draft` | Draft | neutral |
| SCO | `pending_approval` | Pending approval | warning |
| SCO | `require_more_info` | Sent back | warning |
| SCO | `approved` | Approved | success |
| SCO | `rejected` | Rejected | danger |
| SCO | `material_issued` | Material issued | info |
| SCO | `material_received` | Material received | success |
| SCO | `closed` | Closed | closed |
| SCO | `cancelled` | Cancelled | closed |
| Challan due | `ok` | On time | success |
| Challan due | `warning` | Due soon | warning |
| Challan due | `overdue` | Overdue | danger |

Delete after adoption: the style maps in `lib/pr-status-badge.ts`, `lib/po-status-badge.ts`,
`lib/grn-status-badge.ts` and `lib/sco-format.ts`. Their non-style helpers (`canCancelPurchaseOrder`,
`PO_TERMINAL_STATUSES`, `formatDaysLeft`, …) move unchanged to a module file; no behaviour change.

## Shared components
All in `frontend/src/components/shared/` except `format.ts` and `status-tone.ts` (`src/lib/`).
Each is a focused UI piece (props in, callbacks out, no data fetching).

| Component | Props sketch | Accepted when |
|---|---|---|
| `StatusBadge` | `doc: "pr"\|"po"\|"grn"\|"grnQa"\|"sco"\|"challanDue"`, `status: string \| null`, `className?` | Renders label and tone from the map; dot + text; `closed` tone is outline; unknown or null → neutral "Unknown"; no palette class in the file |
| `PageHeader` | `title`, `description?`, `actions?: ReactNode`, `breadcrumbs?: {label, href?}[]` | One `h1`; actions right-aligned, wrap under the title below 640 px; at most one primary button |
| `DetailHeader` | `docNo`, `title?`, `status: ReactNode`, `meta?: {label, value}[]`, `actions?`, `backHref` | Mono document number + `StatusBadge` on one line; meta as label/value pairs; back link; same action rules as `PageHeader` |
| `DocumentFlow` | `steps: {label, docNo?, href?, status?: ReactNode, state: "done"\|"current"\|"todo"}[]` | Shows the PR → PO → GRN (→ invoice) chain; current step has the accent border; `todo` is dashed with plain text; steps with `href` are links; wraps on narrow screens |
| `FilterBar` | `quick?: {key, label, count?}[]`, `value`, `onChange`, `children?` (extra filters), `onReset?` | Selected quick filter uses accent tint; counts in tabular numbers; state lives in the URL (nuqs) in the view, not here; "Reset" shows only when a filter is active |
| `StatCard` | `label`, `value: number \| string`, `tone?`, `icon?`, `hint?`, `href?`, `loading?`, `countUp?: boolean` | Icon chip in tone tint; value 26 px tabular; `countUp` only when `value` is a number and only once per mount; `loading` shows skeleton; whole card is a link when `href` is set |
| `EmptyState` | `icon?`, `title`, `description?`, `action?: ReactNode` | Centred in the table or card area; title says what is missing; at most one action; no illustration |
| `ErrorState` | `title?`, `message`, `onRetry?` | Shows the server message in plain words and a "Try again" button when `onRetry` is given; uses danger tone for the icon only |
| `Pagination` | `page`, `pageSize`, `total`, `onPageChange`, `onPageSizeChange?` | "1 to 25 of 41"; previous / next / page numbers; current page in accent tint; hidden when `total <= pageSize`; replaces `common/DataTablePagination.tsx` and `pages/suppliers/SuppliersPagination.tsx` |
| `format.ts` | `formatDate(iso)`, `formatDateTime(iso)`, `formatMoney(paise, {whole?})`, `formatQty(value, unit, decimals)`, `formatDocNo(value)` | Dates `28 Nov 2026` in IST; money `₹4,82,000.00` with Indian grouping, `whole` drops paise; null or undefined → `–`; no other file calls `toLocaleDateString`, `toLocaleString` or `Intl.NumberFormat` (27 call sites in 20 files today) |

`components/common/DataTable.tsx` stays; it gains density row height, the muted header row,
skeleton rows while loading, and slots for `EmptyState` / `ErrorState`.
`components/common/ModulePageShell.tsx` (placeholder page) is rebuilt from `PageHeader` + `EmptyState`.

## Shell
| Part | Change |
|---|---|
| Sidebar header | Brand mark (emerald square with icon) + "DiecastOS"; the "Role: …" text moves to the user menu |
| Sidebar items | Every item gets a Tabler icon; group labels in `--sidebar-muted`; active item = `--sidebar-accent` tint, bold text, 3 px `--sidebar-primary` marker on the left edge |
| Sidebar fold | Folds to icons only (52 px); labels become tooltips; state kept in `localStorage` |
| Top bar (new, 44 px) | Fold button, breadcrumbs from the route, search box (visible stub, disabled, hint "/"), user menu |
| User menu | Avatar with initials (accent fill); menu holds name, role, light/dark switch, density switch, logout |
| Content area | `max-w` none for list pages, 20 px padding; page background `--background`, tables and cards on `--card` |
| Dark mode | `next-themes` stays; default follows the system |

Icons by route: Home `IconLayoutDashboard` · Requisitions `IconFileText` · Approvals `IconChecklist`
· Purchase orders `IconShoppingCart` · Suppliers `IconUsers` · Goods receipt `IconPackage` ·
Inventory `IconStack2` · Subcontracting `IconArrowsExchange` · Employee directory `IconId` ·
Setup `IconSettings`.

## Rules
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-DS-01 | Colour comes only from tokens. No raw Tailwind palette class (`bg-amber-100`, `text-rose-800`, …) and no hex outside `src/components/ui/**` and `globals.css`. | A view adds `text-emerald-700` → frontend standards check fails (61 such uses exist today) |
| BR-DS-02 | Every text pair is at least 4.5:1 and every chart colour at least 3:1 on its surface, in light and dark. | `--warning` on `--warning-subtle` light → 5.4, passes; a token edit that drops it to 4.2 → rejected |
| BR-DS-03 | A status has one label and one tone everywhere, taken from `status-tone.ts`. | PO `dispatched` on the list, detail, tracking and approvals pages → blue "Dispatched" on all four |
| BR-DS-04 | An unknown or missing status renders a neutral "Unknown" badge and never throws. | Server sends `on_hold` (not in the map) → grey "Unknown", page still renders |
| BR-DS-05 | Colour is never the only signal: a badge always carries its text label; `closed` tone is also an outline. | Greyscale screenshot → every status still readable |
| BR-DS-06 | `--primary` is used only as the fill of the main action and for the active-menu marker; at most one primary button per page header or dialog. | Page header with "Export" and "New purchase order" → only the second is primary |
| BR-DS-07 | `--brand-accent` marks selection and position only (selected filter, current step, current page, avatar, link text). It is never a status tone. | A view uses accent for "Dispatched" → review finding |
| BR-DS-08 | Danger tone is used only for destructive actions, refused or late statuses and error messages. | "Cancel order" confirm button → danger; "Export" → never |
| BR-DS-09 | Motion exists only in the eight allow-list places and only with the motion tokens and `--ease-out`. | A card gets `transition-all duration-500` → standards check fails |
| BR-DS-10 | Nothing on the never-list ships: no route transition, bounce or spring, loop (except the skeleton while loading), scroll-triggered or decorative motion. | Navigating PR list → PR detail → content appears with no animation |
| BR-DS-11 | With `prefers-reduced-motion: reduce` all durations are 0 ms, the skeleton does not sweep, the flash is skipped, count-up shows the final value. | Given the OS setting is on, when a dialog opens, then it appears at once |
| BR-DS-12 | The status flash runs once, on the row whose status the current user just changed, never on background refresh. | Given the PO list is open, when the user approves PO-2026-0190, then that row tints for 600 ms once; a refetch 30 s later → no flash |
| BR-DS-13 | Count-up runs only on `StatCard` in the dashboard pattern, once per page load, never on refetch, tables or forms. | Home page loads with 23 open orders → counts to 23 once; query refetch → value swaps with no animation |
| BR-DS-14 | The skeleton sweep runs only while data is loading and stops when data, empty or error state shows. | Query resolves after 800 ms → sweep stops, rows render |
| BR-DS-15 | Every screen works in light and dark; no element keeps a light-mode colour in dark mode. | PO list in dark → badges use dark subtle tints, not bright pastel |
| BR-DS-16 | Default table density is comfortable; the user's choice is kept per browser and applies to every table. | Given the user picked Compact, when they reload or open GRN, then rows are 30 px |
| BR-DS-17 | Every list view is `PageHeader` + `FilterBar` + `DataTable` + `Pagination`, with `EmptyState`, `ErrorState` and skeleton rows for its three non-data states. | Supplier list with no suppliers → "No suppliers yet" + "New supplier", not an empty table |
| BR-DS-18 | Dates, money and quantities are formatted only through `format.ts`. | PO total 48200000 paise → `₹4,82,000.00`; null date → `–` |
| BR-DS-19 | Document numbers use the mono font; numeric columns are right-aligned with tabular numbers. | Qty and Value columns line up digit under digit |
| BR-DS-20 | Every interactive element shows a 2 px focus ring in `--ring` on keyboard focus. | Tab through the PO list → each link, chip and button shows the ring |
| BR-DS-21 | Every sidebar item has a Tabler icon; the active item is shown by tint, bold text and marker together. | On `/purchase-orders` → only "Purchase orders" is tinted |
| BR-DS-22 | Each page has exactly one `h1` (from `PageHeader` or `DetailHeader`) and breadcrumbs that match the route. | PO detail → "Purchase / Purchase orders / PO-2026-0187" |
| BR-DS-23 | Success toasts close after 4 s; error toasts stay until closed; at most three are visible. | Save fails → red-edged toast stays until the user closes it |
| BR-DS-24 | A new tone, a new motion place or a change to a token value is an owner decision recorded in `docs/decisions.md` before code. | Dev wants a hover lift on cards → stop, raise an issue |
| BR-DS-25 | Adoption changes look only: no route, permission, API call, validation or business rule changes in the same commit. | PR that adopts `StatusBadge` in GRN also changes a GRN action rule → rejected |

Checks: BR-DS-01 and BR-DS-09 by `frontend/scripts/standards-check.ts` (plan 1.4 b, c);
BR-DS-02 by a small token contrast script run in CI; BR-DS-03, 04, 18 by unit tests on
`status-tone.ts` and `format.ts`; the rest by design-reviewer screenshots (light + dark).

## Adoption order
One commit per step; each step leaves every page working.

| Step | What | Views touched |
|---|---|---|
| 1 | Tokens in `globals.css`, Geist Mono, motion tokens, reduced-motion rule | none (whole app shifts colour slightly) |
| 2 | `status-tone.ts` + `StatusBadge`; replace the four badge helpers (15 files) | PR, PO, GRN, SCO, approvals |
| 3 | `format.ts`; replace 27 call sites | all |
| 4 | Shell: sidebar icons + brand + active tint, top bar, user menu, density switch | `(protected)/layout.tsx`, `common/Sidebar.tsx` |
| 5 | `PageHeader`, `FilterBar`, `Pagination`, `EmptyState`, `ErrorState`; `DataTable` density and states | purchase orders (list + tracking) as the reference |
| 6 | `DetailHeader`, `DocumentFlow` | purchase order detail as the reference |
| 7 | Roll out list + detail patterns | purchase requisitions → approvals → GRN → subcontracting (+ open challans) |
| 8 | Roll out | inventory → suppliers → employee directory → setup |
| 9 | `StatCard` (component only) | none; first used by the home dashboard feature |
| 10 | Switch standards checks 1.4 b and c from report to blocking | — |

## Not now
- Home dashboard content and the approvals count badge in the sidebar (needs count queries; pilot feature).
- Touch density mode and shop-floor screens (owner card 5).
- What the top-bar search finds. Print and PDF layouts. Phone layout. Login and public landing page.
- A charts library and real charts. Logo design. Languages other than English.
- The `design-system` skill, `ui-ux-designer` and `design-reviewer` agents, Playwright smoke (plan 3.6–3.9).

## Open questions
Must be empty at freeze. All six are owner cards in `OWNER.md`.
| # | Question | Goes to |
|---|---|---|
| 1 | Palette A or B | card 1 |
| 2 | Default table density | card 2 |
| 3 | Sidebar soft or strong | card 3 |
| 4 | Motion allow-list approval | card 4 |
| 5 | Touch density now or later | card 5 |
| 6 | Home page cards now or later | card 6 |

## Changelog
- 2026-11-18 v0 — draft
