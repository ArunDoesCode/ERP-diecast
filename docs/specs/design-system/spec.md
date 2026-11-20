---
module: design-system
status: frozen           # draft | frozen (set only by /freeze)
version: 1
frozen_on: 2026-11-18
owner: Arun
depends_on: []
brief: docs/plans/agentic-workflow-v2.md   # Phase 3 (3.1–3.5); no separate brief
research:
---

# Design system

> Agent layer. The owner reads `OWNER.md` and opens `preview.html`. Screens: `design/screens.md`.
> Choices made without the owner: `assumptions.md`. `preview.html` is the visual reference: when
> this file and the preview disagree, this file wins and the preview gets fixed.

## Summary
One set of colour, type and motion tokens, one status map, nine shared components and one formatter for the
frontend (Next.js 16, Tailwind v4, shadcn radix-mira, Manrope, Tabler icons, next-themes).
Users: purchase, stores and planning staff on desktops, long sessions, dense tables. Tone: calm,
industrial, precise: emerald primary, steel-blue accent, cool grey neutrals (hue 250).
Done = tokens, shared components and shell are in place, purchase orders (list, detail, form) use
them as the reference module, light and dark both pass contrast, and motion exists only in the
eight allowed places. No backend change, no new library, no business rule of any module changes.

> Flow, Who can do what, Security, data and API sections: n/a — frontend-only module with no routes,
> no data and no states of its own. Permission-hidden states follow BR-DS-27.

## Tokens — colour
Add to `frontend/src/app/globals.css` (`:root` and `.dark`). In the `@theme inline` block map
`--color-<name>: var(--<name>)` for each new token (new = not in `globals.css` today: the tone,
`--brand-accent*`, `--destructive-*`, `--table-header`, `--sidebar-muted` tokens). Tokens not listed
keep today's value.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `oklch(0.982 0.005 250)` | `oklch(0.17 0.012 250)` | Page |
| `--foreground` | `oklch(0.21 0.018 250)` | `oklch(0.95 0.006 250)` | Text |
| `--card`, `--popover` | `oklch(1 0 0)` | `oklch(0.215 0.014 250)`, `oklch(0.24 0.015 250)` | Cards, tables; dialogs, menus, toasts |
| `--card-foreground`, `--popover-foreground` | = foreground | = foreground | Text on them |
| `--primary` | `oklch(0.508 0.118 165.612)` (kept) | `oklch(0.432 0.095 166.913)` (kept) | Fill of the main action; never text colour |
| `--primary-foreground` | `oklch(0.979 0.021 166.113)` (kept) | same (kept) | Text on primary |
| `--secondary` | `oklch(0.955 0.008 250)` | `oklch(0.27 0.014 250)` | Secondary button fill |
| `--secondary-foreground` | `oklch(0.25 0.018 250)` | `oklch(0.95 0.006 250)` | Text on it |
| `--muted` | `oklch(0.962 0.006 250)` | `oklch(0.26 0.014 250)` | Skeleton, quiet fills |
| `--muted-foreground` | `oklch(0.49 0.02 250)` | `oklch(0.72 0.015 250)` | Secondary text, column heads |
| `--accent` | `oklch(0.95 0.01 250)` | `oklch(0.28 0.016 250)` | Hover surface (shadcn meaning, unchanged role) |
| `--accent-foreground` | `oklch(0.25 0.018 250)` | `oklch(0.95 0.006 250)` | Text on hover surface |
| `--table-header` | `oklch(0.95 0.018 262)` | `oklch(0.27 0.03 264)` | Table header row tint (new) |
| `--border` | `oklch(0.91 0.008 250)` | `oklch(1 0 0 / 10%)` | Decorative lines |
| `--input` | `oklch(0.64 0.015 250)` | `oklch(0.56 0.02 250)` | Field and outline-button border (3:1 on every surface) |
| `--ring`, `--sidebar-ring` | `oklch(0.55 0.12 262)` | `oklch(0.72 0.1 262)` | Focus ring (content, sidebar) |
| `--success` | `oklch(0.5 0.125 150)` | `oklch(0.8 0.14 152)` | Tone text, icon, solid fill |
| `--success-foreground` | `oklch(0.985 0.02 150)` | `oklch(0.2 0.05 152)` | Text on solid success |
| `--success-subtle` | `oklch(0.95 0.04 152)` | `oklch(0.29 0.055 152)` | Badge and icon-chip tint |
| `--warning` | `oklch(0.5 0.11 70)` | `oklch(0.83 0.13 82)` | as above |
| `--warning-foreground` | `oklch(0.99 0.02 85)` | `oklch(0.22 0.05 80)` | |
| `--warning-subtle` | `oklch(0.955 0.05 88)` | `oklch(0.31 0.055 75)` | |
| `--info` | `oklch(0.5 0.11 228)` | `oklch(0.79 0.1 228)` | as above |
| `--info-foreground` | `oklch(0.985 0.015 228)` | `oklch(0.2 0.04 232)` | |
| `--info-subtle` | `oklch(0.95 0.03 228)` | `oklch(0.29 0.05 232)` | |
| `--neutral` | `oklch(0.45 0.02 250)` | `oklch(0.78 0.012 250)` | as above |
| `--neutral-foreground` | `oklch(0.985 0.003 250)` | `oklch(0.2 0.01 250)` | |
| `--neutral-subtle` | `oklch(0.94 0.008 250)` | `oklch(0.29 0.012 250)` | |
| `--destructive` | `oklch(0.53 0.2 27)` (changed) | `oklch(0.76 0.14 22)` (changed) | Danger tone, delete actions |
| `--destructive-foreground` | `oklch(0.985 0.01 27)` | `oklch(0.2 0.05 25)` | new |
| `--destructive-subtle` | `oklch(0.955 0.025 25)` | `oklch(0.29 0.06 22)` | new |
| `--brand-accent` | `oklch(0.42 0.14 262)` | `oklch(0.7 0.12 264)` | Second brand colour: selection, position, links (BR-DS-07) |
| `--brand-accent-foreground` | `oklch(0.975 0.012 262)` | `oklch(0.18 0.04 264)` | Text on solid accent |
| `--brand-accent-subtle` | `oklch(0.93 0.03 262)` | `oklch(0.31 0.08 264)` | Status-change flash only |
| `--chart-1` | `oklch(0.6 0.12 165)` | `oklch(0.86 0.14 165)` | Emerald |
| `--chart-2` | `oklch(0.4 0.12 252)` | `oklch(0.58 0.12 252)` | Blue |
| `--chart-3` | `oklch(0.5 0.105 70)` | `oklch(0.74 0.13 78)` | Amber |
| `--chart-4` | `oklch(0.6 0.13 305)` | `oklch(0.78 0.13 305)` | Violet |
| `--chart-5` | `oklch(0.4 0.15 10)` | `oklch(0.58 0.14 20)` | Rose |
| `--sidebar` | `oklch(0.962 0.01 250)` | `oklch(0.2 0.014 250)` | Sidebar |
| `--sidebar-foreground` | `oklch(0.3 0.02 250)` | `oklch(0.9 0.008 250)` | |
| `--sidebar-muted` | `oklch(0.49 0.02 250)` | `oklch(0.7 0.015 250)` | Group labels (new) |
| `--sidebar-primary` | `oklch(0.508 0.118 165.612)` | `oklch(0.696 0.17 162.48)` (kept) | Brand mark, active bar |
| `--sidebar-accent` | `oklch(0.925 0.045 165)` | `oklch(0.3 0.05 165)` | Active item tint (from primary) |
| `--sidebar-accent-foreground` | `oklch(0.36 0.09 166)` | `oklch(0.86 0.11 165)` | Active item text |
| `--sidebar-border` | `oklch(0.9 0.01 250)` | `oklch(1 0 0 / 10%)` | |

Each tone is three tokens. Text or icon in the tone = `--<tone>` on `--<tone>-subtle` or on a card.
Solid fill = `--<tone>` with `--<tone>-foreground`. Measured (OKLCH → sRGB, WCAG 2): lowest text
pair 4.90 light, 4.93 dark; lowest field border or ring on its surface 3.01; lowest chart colour on
card 3.72. Accent against info: ΔE 11.3 light, 11.4 dark (OKLab × 100). Chart colours differ from
each other by ΔE ≥ 11.6 light and ≥ 15.0 dark, also under simulated red-green colour blindness.

**Where colour carries weight** (BR-DS-26). Exactly these seven places, plus status tones (BR-DS-03),
selection and position (BR-DS-07) and the brand mark (BR-DS-06); nowhere else:
| # | Place | Colour |
|---|---|---|
| 1 | Active sidebar item | `--sidebar-accent` tint + 3 px `--sidebar-primary` bar on the left edge + bold text |
| 2 | Page header | 2 px × 40 px `--brand-accent` band under the `h1` (`PageHeader`, `DetailHeader`) |
| 3 | Table header row | `--table-header` background |
| 4 | Document-number links | `--brand-accent` text, mono, underline on hover |
| 5 | Focus ring | `--ring` / `--sidebar-ring` (BR-DS-20) |
| 6 | `StatCard` | 3 px left edge in the card's tone colour |
| 7 | Primary button | solid `--primary` fill |

No gradients (the skeleton sweep highlight is the one exception). No coloured page background. No
coloured card fill.

## Tokens — type, density, shape
Font: Manrope (`--font-sans`, loaded today). Mono: `@theme inline` already has
`--font-mono: var(--font-geist-mono)`, but nothing sets `--font-geist-mono`, so `font-mono` falls back
to the browser default today. Load Geist Mono with `next/font/google` (`variable:
"--font-geist-mono"`) in `app/layout.tsx` next to Manrope. Numbers use `tabular-nums`.

| Role | Size / line | Weight | Where |
|---|---|---|---|
| Page title | 20 / 28 | 700 | `PageHeader`, `DetailHeader` (the only `h1`) |
| Section title | 15 / 22 | 700 | Card and dialog titles, empty state |
| Body | 13 / 20 | 400 | Forms, descriptions |
| Table cell | density token | 400 | `DataTable` |
| Label | 12 / 16 | 600 | Column heads, field labels, stat labels, buttons |
| Badge | 11 / 20 | 600 | `StatusBadge` (today 10 px) |
| Stat value | 26 / 34 | 700 | `StatCard` |
| Document number | 0.92 em | 500 | mono, in tables and headers |

| Density | Row height | Table text | Set by |
|---|---|---|---|
| comfortable (default) | 36 px | 13 px | `data-density` on `<html>` |
| compact (today's size) | 30 px | 12 px | user switch, kept in `localStorage` |

Radius stays `--radius: 0.625rem`. Badges are pills. Icons: Tabler, 16 px, stroke 1.75.

## Tokens — motion
Five duration tokens (plain custom properties in `:root`) and one easing token (in `@theme`, so the
utility is `ease-standard`; Tailwind's built-in `ease-out` is left alone and never used).

| Token | Value | Use |
|---|---|---|
| `--motion-fast` | 120 ms | Hover, press, every exit |
| `--motion-base` | 180 ms | Enter of dialog, sheet, popover, toast |
| `--motion-slow` | 260 ms | Sidebar fold |
| `--motion-emphasis` | 600 ms | Status flash, count-up |
| `--motion-skeleton` | 1400 ms | Skeleton sweep (linear, the only loop) |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | The only curve |

**Allow-list — the only places motion may exist**
| # | Place | What moves | Token |
|---|---|---|---|
| 1 | Dialog, sheet, popover, dropdown | opacity, scale 0.96 → 1 (sheet: slide from its edge) | in base, out fast |
| 2 | Toast | opacity, 8 px slide up | in base, out fast |
| 3 | Sidebar fold | width | slow |
| 4 | Table row hover | background colour | fast |
| 5 | Button press and hover | 1 px down while pressed, background colour | fast |
| 6 | Skeleton | shimmer sweep, only while loading | skeleton |
| 7 | Status change highlight | row background from `--brand-accent-subtle` to none, once, never repeats | emphasis |
| 8 | Number count-up | `StatCard` value from 0 to value | emphasis |

Colour-only transitions on focus rings, inputs, links and sidebar items count under 5 (fast).
Count-up: once per mount, at most 600 ms, `--ease-standard`, numeric values only, never on refetch
or when the value changes later; screen readers get the final value from the first paint.

**Never:** page or route transitions, bounce or spring curves, any loop other than 6 (so no
spinners), scroll-triggered motion, decorative motion, staggered list entrances, delays, motion on
badges, icons or charts.

**Reduced motion:** under `prefers-reduced-motion: reduce` all five duration tokens are `0ms`, the
skeleton is a flat `--muted` block, the status flash is skipped, count-up shows the final value.

**Allowed class spellings (nothing else):** `transition-colors`, `transition-opacity`,
`transition-transform`, `transition-[width]`; `duration-(--motion-fast)`, `duration-(--motion-base)`,
`duration-(--motion-slow)`; `ease-standard`; `animate-skeleton`, `animate-status-flash` (both defined
as `--animate-*` in `@theme`, keyframes in `globals.css`). In `src/components/ui/**` only: the
existing enter and exit classes of dialog, sheet, popover, dropdown and toast (`animate-in`,
`animate-out`, `fade-*`, `zoom-*`, `slide-*`) with the base and fast durations above.

**The checker must flag**, in every file under `frontend/src/` (ui included): any `ease-*` other than
`ease-standard`; any `delay-*`; `duration-<number>` or `duration-[…]`; `transition-all` and bare
`transition`; any `animate-*` not named above; an inline `transition` or `animation` style; a
`@keyframes` outside `globals.css`; and any motion class in a file that is neither under
`src/components/ui/**` nor in `frontend/design/motion-allowlist.json`. This spec adds two files to
that list: `src/components/shared/StatCard.tsx` and `src/components/shared/StatusFlashRow.tsx`.

## Status → tone
One map in `frontend/src/lib/status-tone.ts`. Each tone has one Tabler icon (12 px, stroke 2,
`aria-hidden`) shown before the label, so meaning never rests on hue alone.

| Tone | Meaning | Icon | Look |
|---|---|---|---|
| neutral | Not started, or no judgement | `IconCircleDashed` | tint + tone text |
| warning | Waiting on someone, or needs attention | `IconClock` | tint + tone text |
| info | Moving, partly done | `IconArrowRight` | tint + tone text |
| success | Approved, accepted, complete | `IconCheck` | tint + tone text |
| danger | Refused, failed, late | `IconAlertTriangle` | tint + tone text |
| closed | Finished and filed, or cancelled | `IconArchive` | outline, `--muted-foreground` text |

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
| Approval | `pending_approval` | Pending approval | warning |
| Approval | `approved` | Approved | success |
| Approval | `auto_approved` | Auto-approved | success |
| Approval | `rejected` | Rejected | danger |
| Approval | `require_more_info` | Sent back | warning |
| Approval | `partial_ordered` | Partly ordered | info |
| Approval | `fully_ordered` | Fully ordered | success |
| Approval | `cancelled` | Cancelled | closed |

The Approval block is the `approval_status` enum (`backend/src/db/schemas/02_procurement-approval.ts`,
`ApprovalRequestStatus` in `frontend/src/types/approval.ts`). The approvals pages use it for the
request status and the PR / PO / SCO blocks for the document's own status.
`lib/po-status-badge.ts` loses its style map when purchase orders adopt `StatusBadge`; its non-style
helpers (`canCancelPurchaseOrder`, `PO_TERMINAL_STATUSES`, …) stay unchanged. The PR, GRN and SCO
maps go with the roll-out (Not now).

## Shared components
All in `frontend/src/components/shared/` except `format.ts` and `status-tone.ts` (`src/lib/`).
Each is a focused UI piece (props in, callbacks out, no data fetching, no permission logic).

| Component | Props sketch | Accepted when |
|---|---|---|
| `StatusBadge` | `doc: "pr"\|"po"\|"grn"\|"grnQa"\|"sco"\|"challanDue"\|"approval"`, `status: string \| null`, `className?` | Label, tone and icon from the map; `closed` tone is outline; unknown or null → neutral "Unknown"; no palette class in the file |
| `PageHeader` | `title`, `description?`, `actions?: ReactNode` | One `h1` with the accent band; actions right-aligned, wrap under the title below 640 px; at most one primary button |
| `DetailHeader` | `docNo`, `title?`, `status: ReactNode`, `meta?: {label, value}[]`, `actions?`, `backHref`, `backLabel` | Mono document number + `StatusBadge` on one line; meta as label/value pairs; back link; same band and action rules as `PageHeader` |
| `DocumentFlow` | `steps: {label, docNo?, href?, status?: ReactNode, state: "done"\|"current"\|"todo"}[]` | Shows the PR → PO → GRN (→ invoice) chain; the current step's label row is a solid `--brand-accent` strip with `--brand-accent-foreground` text and the step has `aria-current="step"`; `todo` is dashed with plain text; steps with `href` are links; wraps on narrow screens |
| `FilterBar` | `quick?: {key, label, count?}[]`, `value`, `onChange`, `children?` (extra filters), `onReset?` | Selected quick filter = solid `--brand-accent` fill with `--brand-accent-foreground` text; counts in tabular numbers; state lives in the URL (nuqs) in the view, not here; "Reset" shows only when a filter is active |
| `StatCard` | `label`, `value: number \| string`, `tone?: "neutral"\|"warning"\|"info"\|"success"\|"danger"`, `icon?`, `hint?`, `href?`, `loading?`, `error?`, `onRetry?`, `countUp?: boolean` | Left edge and icon chip in the tone (never accent); value 26 px tabular; count-up per the motion rules; whole card is a link when `href` is set |
| `EmptyState` | `icon?`, `title`, `description?`, `action?: ReactNode` | Centred in the table or card area; title says what is missing; at most one action; no illustration |
| `ErrorState` | `title?`, `message`, `onRetry?` | Shows the server message in plain words and a "Try again" button when `onRetry` is given; danger tone for the icon only |
| `Pagination` | `page`, `pageSize`, `total`, `onPageChange`, `onPageSizeChange?` | "1 to 25 of 41"; previous / next / page numbers; current page = solid `--brand-accent` fill; hidden when `total <= pageSize`; replaces `common/DataTablePagination.tsx` in the views that adopt it |
| `format.ts` | `formatDate(iso)`, `formatDateTime(iso)`, `formatMoney(paise, {whole?})`, `formatQty(value, unit, decimals)`, `formatDocNo(value)` | Dates `28 Nov 2026` in IST; money `₹4,82,000.00` with Indian grouping, `whole` drops paise; null or undefined → `–`; used by every shared component above |

`components/common/DataTable.tsx` stays; it gains density row height, the `--table-header` row,
skeleton rows while loading, and slots for `EmptyState` / `ErrorState`.

**Name, keyboard and states** (permission-hidden = the view does not pass the element; the component
renders with no gap and no disabled ghost — BR-DS-27):
| Component | Role and accessible name | Keyboard | Loading · empty · error · permission-hidden |
|---|---|---|---|
| `StatusBadge` | `span`; the label text is the name; icon `aria-hidden` | not focusable | none of its own; unknown status → "Unknown" |
| `PageHeader` | `header`; `h1`; actions in `role="group"` named "Page actions" | Tab: actions left to right | title always shows · n/a · n/a · action not rendered |
| `DetailHeader` | `header`; `h1` = document number; back link named "Back to <backLabel>"; meta is a `dl` | Tab: back link, then actions | skeleton number and meta · n/a · view shows `ErrorState` · action not rendered, empty "More" menu not rendered |
| `DocumentFlow` | `nav` named "Document chain" holding an `ol`; current `li` has `aria-current="step"` | linked steps are Tab stops; `todo` steps are not | three skeleton steps · one step only → not rendered · "Could not load the chain" + "Try again" · a step the user may not open is plain text |
| `FilterBar` | `role="toolbar"` named "Filters"; each chip is a `button` with `aria-pressed` | Tab to each chip; Enter or Space toggles | counts show `–` · n/a · n/a · n/a |
| `StatCard` | `a` when `href`, else `div`; name "<label>: <value>" | Enter opens the link | skeleton value, `aria-busy` · `0` is a value, not empty · `–` + "Try again" button · card not rendered |
| `EmptyState` | `role="status"`; title is a `p`, not a heading | action is the only Tab stop | n/a · this is it · n/a · action not rendered, text stays |
| `ErrorState` | `role="alert"`; message is the name | "Try again" is a `button` | while retrying: button disabled, label "Trying…" |
| `Pagination` | `nav` named "Pagination"; current page `aria-current="page"`; arrows named "Previous page" / "Next page" | Tab, Enter; arrows `aria-disabled` at the ends | buttons disabled, last total kept · hidden · hidden · n/a |
| `DataTable` | `table`; `th scope="col"`; sorted column `aria-sort` | the document number is the row's link | 8 skeleton rows, `aria-busy` · `EmptyState` · `ErrorState` + retry · column or row action not rendered |

## Shell
| Part | Change |
|---|---|
| Sidebar header | Brand mark (emerald square with icon) + "DiecastOS"; the "Role: …" text moves to the user menu |
| Sidebar items | Every item gets a Tabler icon; group labels in `--sidebar-muted`; active item per weight place 1 and `aria-current="page"`; items the user has no permission for are not rendered (today's behaviour) |
| Sidebar fold | Folds to icons only (52 px); labels become tooltips; state kept in `localStorage` |
| Top bar (new, 44 px) | Fold button (named "Fold sidebar" / "Unfold sidebar"), breadcrumbs, search box (visible stub, disabled, hint "/"), user menu |
| Breadcrumbs | Defined once, here: `nav` named "Breadcrumb" with an `ol`, built from the route (group / list / document number); earlier items are links, the last is text with `aria-current="page"`. No other component draws breadcrumbs |
| User menu | Avatar with initials (accent fill); menu holds name, role, light/dark switch, density switch, logout |
| Content area | `max-w` none for list pages, 20 px padding; page background `--background`, tables and cards on `--card` |
| Dark mode | `next-themes` stays; default follows the system |

Icons by route: Home `IconLayoutDashboard` · Requisitions `IconFileText` · Approvals `IconChecklist`
· Purchase orders `IconShoppingCart` · Suppliers `IconUsers` · Goods receipt `IconPackage` ·
Inventory `IconStack2` · Subcontracting `IconArrowsExchange` · Employee directory `IconId` ·
Setup `IconSettings`.

## Rules
"Adopted" = the shell, the shared components and the purchase-order list, detail and form, plus each view of "Roll-out" once its step has landed.
Checked by: **script** (standards check, contrast script or unit test) · **Playwright** (smoke run;
until plan 3.6–3.9 lands a human does the same steps) · **screenshot** (light + dark) · **human** (review).

| ID | Rule | Example (given → then) | Checked by |
|---|---|---|---|
| BR-DS-01 | Colour comes only from tokens. No raw Tailwind palette class (`bg-amber-100`, `text-rose-800`, …) and no hex outside `src/components/ui/**` and `globals.css`. | A view adds `text-emerald-700` → standards check reports it (61 such uses exist today) | script |
| BR-DS-02 | Every text pair is at least 4.5:1; every field border, focus ring and chart colour at least 3:1 on its surface; light and dark. | `--warning` on `--warning-subtle` light → 5.4, passes; a token edit that drops it to 4.2 → rejected | script |
| BR-DS-03 | A status has one label, one tone and one icon, taken from `status-tone.ts`. | PO `dispatched` on the PO list and PO detail → blue "Dispatched" with the arrow icon on both | script |
| BR-DS-04 | An unknown or missing status renders a neutral "Unknown" badge and never throws. | Server sends `on_hold` (not in the map) → grey "Unknown", page still renders | script |
| BR-DS-05 | Colour is never the only signal: a badge always carries its text label and its tone icon; `closed` tone is also an outline. | Greyscale screenshot → "Pending approval" (clock) and "Dispatched" (arrow) still differ | screenshot |
| BR-DS-06 | `--primary` is used only as the solid fill of the main action and for the active-menu bar and brand mark; at most one primary button per page header or dialog. | Page header with "Export" and "New purchase order" → only the second is solid emerald | screenshot |
| BR-DS-07 | `--brand-accent` marks selection, position and links only: selected filter chip and current page number (solid fill with `--brand-accent-foreground`), current step, avatar, link text, weight places 2–4. It is never a status tone and never a `StatCard` tone. | A view uses accent for "Dispatched" → review finding | screenshot |
| BR-DS-08 | Danger tone is used only for destructive actions, refused or late statuses and error messages. | "Cancel order" confirm button → danger; "Export" → never | human |
| BR-DS-09 | Motion exists only in the eight allow-list places, only with the motion tokens, `--ease-standard` and the allowed class spellings. | A card gets `transition-all duration-500 ease-out` → standards check reports three findings | script |
| BR-DS-10 | Nothing on the never-list ships: no route transition, bounce or spring, loop (except the skeleton while loading), delay, scroll-triggered or decorative motion. | Navigating PO list → PO detail → content appears with no animation | Playwright |
| BR-DS-11 | With `prefers-reduced-motion: reduce` all durations are 0 ms, the skeleton does not sweep, the flash is skipped, count-up shows the final value. | Given the OS setting is on, when a dialog opens, then it appears at once | Playwright |
| BR-DS-12 | The status flash tints the row with `--brand-accent-subtle` once for 600 ms, on the row whose status the current user just changed; it never repeats and never runs on background refresh. | Given the PO list is open, when the user approves PO-2026-0190, then that row tints once; a refetch 30 s later → no flash | Playwright |
| BR-DS-13 | Count-up runs only on `StatCard`, once per mount, at most 600 ms, numbers only, never on refetch, tables or forms. | Card mounts with 23 → counts to 23 once; query refetch returns 24 → value swaps with no animation | Playwright |
| BR-DS-14 | The skeleton sweep runs only while data is loading and stops when data, empty or error state shows. | Query resolves after 800 ms → sweep stops, rows render | Playwright |
| BR-DS-15 | Every adopted screen works in light and dark; no element keeps a light-mode colour in dark mode. | PO list in dark → badges use dark subtle tints, not bright pastel | screenshot |
| BR-DS-16 | Default table density is comfortable; the user's choice is kept per browser and applies to every `DataTable`. | Given the user picked Compact, when they reload or open GRN, then rows are 30 px | Playwright |
| BR-DS-17 | An adopted list view is `PageHeader` + `FilterBar` + `DataTable` + `Pagination`, with `EmptyState`, `ErrorState` and skeleton rows for its three non-data states. | PO list with no orders → "No purchase orders yet" + "New purchase order", not an empty table | screenshot |
| BR-DS-18 | Shared components and adopted views format dates, money and quantities only through `format.ts`. | PO total 48200000 paise → `₹4,82,000.00`; null date → `–` | script |
| BR-DS-19 | Document numbers use the mono font; numeric columns are right-aligned with tabular numbers. | Qty and Value columns line up digit under digit | screenshot |
| BR-DS-20 | Every interactive element shows a solid 2 px ring with a 2 px offset on keyboard focus, in `--ring` (in the sidebar `--sidebar-ring`); no blurred or half-transparent ring. | Tab through the PO list → each link, chip and button shows the same blue ring | Playwright |
| BR-DS-21 | Every sidebar item has a Tabler icon; the active item is shown by tint, bold text and bar together. | On `/purchase-orders` → only "Purchase orders" is tinted | screenshot |
| BR-DS-22 | Each page has exactly one `h1` (from `PageHeader` or `DetailHeader`) and one breadcrumb trail, in the top bar, that matches the route. | PO detail → "Purchase / Purchase orders / PO-2026-0187" | Playwright |
| BR-DS-23 | Toasts: a success toast closes by itself after 4 s; an error toast stays until the user closes it; at most three toasts show at once, a fourth removes the oldest. Enter and exit motion as "Tokens — motion" (row 2). | PO approved → "PO approved" toast gone after 4 s; save fails → error toast stays until closed; four quick saves → three toasts visible | Playwright |
| BR-DS-24 | A new tone, a new motion place, a new weight place or a change to a token value is an owner decision recorded in `docs/decisions.md` before code. | Dev wants a hover lift on cards → stop, raise an issue | human |
| BR-DS-25 | Adoption changes look only: no route, permission, API call, validation or business rule changes in the same commit. | Commit that adopts `StatusBadge` in PO also changes a PO action rule → rejected | human |
| BR-DS-26 | Colour carries weight only in the seven places of "Where colour carries weight", status tones (BR-DS-03), selection and position (BR-DS-07) and the brand mark (BR-DS-06); no gradients, no coloured page background, no coloured card fill. | A dashboard card gets a blue background → review finding | screenshot |
| BR-DS-27 | An element the user has no permission for is not rendered: no disabled ghost, no gap. Shared components take no permission input; the view decides with the existing permission checks. | User without PO create permission opens the PO list → no "New purchase order" button, header keeps its height | Playwright |


## Adoption order
One commit per step; each step leaves every page working.

| Step | What | Views touched |
|---|---|---|
| 1 | Tokens in `globals.css`, Geist Mono, motion tokens and utilities, reduced-motion rule; `ui/**` moved to the allowed motion spellings and the solid focus ring | none (whole app shifts colour slightly) |
| 2 | `status-tone.ts`, `format.ts`, `StatusBadge` + unit tests | none |
| 3 | Shell: sidebar icons + brand + active tint, top bar, breadcrumbs, user menu, density switch | `(protected)/layout.tsx`, `common/Sidebar.tsx` |
| 4 | `PageHeader`, `FilterBar`, `Pagination`, `EmptyState`, `ErrorState`; `DataTable` density and states | purchase order list |
| 5 | `DetailHeader`, `DocumentFlow`, status flash row | purchase order detail |
| 6 | Form pattern (field border, focus ring, one primary button, `format.ts`) | purchase order create / edit form |
| 7 | `StatCard` (component only) | none; first used by the home dashboard feature |

## Roll-out (in scope since 2026-11-19, #104, #91, #106)
Same rules as "Adoption order": one commit per step, each step leaves every page working, BR-DS-25 (look only).

| Step | What | Views touched |
|---|---|---|
| 8 | List, detail and form patterns, `StatusBadge`, `format.ts` | PO tracking (keeps its own `h1`, BR-DS-22) |
| 9 | same | purchase requisitions; then delete the PR badge map |
| 10 | same | approvals |
| 11 | same | GRN; then delete the GRN badge map |
| 12 | same | subcontracting; then delete the SCO badge map |
| 13 | same | inventory (items, stock view, movements, stock check) |
| 14 | same | suppliers |
| 15 | same | employee directory and setup |
| 16 | Move the remaining date and money call sites (about 27 in 20 files) to `format.ts` (BR-DS-18) | any left after steps 8–15 |
| 17 | Switch the `raw-palette` and `motion` standards checks from report to blocking, in the commit where their count is 0 (BR-DS-01, 09; api-standards BR-STD-30, 32) | none |

## Not now
- Home dashboard content and the approvals count badge in the sidebar (needs count queries; pilot feature).
- Touch density mode (44 px rows, 14 px text) and shop-floor screens: after the first tablet trial.
- What the top-bar search finds. Print and PDF layouts. Phone layout. Login and public landing page.
- A charts library and real charts. Logo design. Languages other than English.
- The `design-system` skill, `ui-ux-designer` and `design-reviewer` agents, Playwright smoke (plan 3.6–3.9).

## Open questions
None.

## Implementation status
Built in epic `epic/design-system` (PRs #101 foundation, #102 shell, #103 purchase orders). Map: `docs/modules/design-system.md`.
| Rules | Status | Tests |
|---|---|---|
| BR-DS-01, 02, 09 | done | `frontend/tests/scripts/standards-rules.test.ts`, `contrast-check.test.ts` |
| BR-DS-03, 04, 05 | done | `frontend/tests/lib/status-tone.test.ts`, `frontend/tests/components/StatusBadge.test.tsx` |
| BR-DS-10, 11, 15, 20 | done | `frontend/e2e/design-system.spec.ts` |
| BR-DS-13 | done | `frontend/tests/components/StatCard.test.tsx` |
| BR-DS-06, 16, 21, 22, 26 | done | `frontend/tests/lib/shell/*.test.ts`, `frontend/tests/components/shell/Shell.test.tsx`, `frontend/e2e/design-system-shell.spec.ts` |
| BR-DS-07, 12, 14, 17, 18, 19, 27 | done | `frontend/tests/components/shared-views.test.tsx`, `frontend/tests/lib/{pagination,status-flash,format}.test.ts`, `frontend/e2e/design-system-po.spec.ts` |
| BR-DS-08, 24, 25 | done | human review (spec) |

## Changelog
- 2026-11-18 v0 — draft
- 2026-11-18 v0 — pre-freeze review fixes: one design (owner picked A / B / A / A / A / A), stronger accent, solid selection, blue focus ring, tone icons, approval statuses, scope cut to one reference module
- 2026-11-18 v1 — frozen. Owner answered 6 cards and confirmed 5 choices; spec and design reviews passed in round 2
- 2026-11-18 v1 — built (epic design-system). Choices made during the build: assumptions A-46 to A-57 (all info). Decision D-024 (e2e locally before push).
- 2026-11-19 — change after freeze, approved by Arun in chat: BR-DS-23 toast timing moved from "Not now" to rules (#105). New "Roll-out" section (steps 8–17) moves from "Not now" to in scope: roll-out to the other modules and badge-map removal (#104), the remaining `format.ts` call sites (#106), and blocking standards checks after the roll-out (#91). No other rule id added.
