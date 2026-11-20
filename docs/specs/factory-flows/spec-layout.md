---
module: factory-flows
part: layout
status: draft
index: spec.md
---

# Factory flows — Menu, page layout, lists, forms

> Part of `spec.md` (example data and shared rules BR-FF-01..09 are there). Rules BR-FF-100..115.
> Sizes, colours, spacing and components come from design-system v2 (incl. BR-DS-28, BR-DS-29) and are
> not restated here. Research found no benchmark rule for list strips or pop-up vs page (Q9): these
> follow the brief ("screens use the space").

## Menu
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-FF-100 | The default menu order and labels are: Home, Approvals, Requisitions, Purchase orders, Goods receipts, Subcontracting, Inventory, Suppliers (one group "General"), then Employee directory, Setup (group "Admin"); each still shows only with its key. | S → Home, Approvals, Requisitions, Goods receipts, Subcontracting, Inventory, Suppliers, all under General |
| BR-FF-101 | The new default is written once to every existing install, and only to menu rows whose label, order and group still equal the old seed values; a row an admin already changed in Setup → Screens is left as it is; after that, every later sync keeps Setup → Screens edits (auth-setup change). | Admin renamed "Inventory" to "Stores" before the update → still "Stores" in its old place after it; untouched "Suppliers" → moves to the new order; admin moves Suppliers to the top after the update → next app start keeps it on top |
| BR-FF-102 | The old Landing page becomes Home at `/home`; `/landing` redirects to `/home`. | Bookmark `/landing` → Home |

## Detail pages
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-FF-103 | Detail pages use the full content width: main column (header, lines) on the left, side panel (BR-FF-50) on the right; on narrow screens the side panel moves below the lines. | 1440 px screen → lines and side panel side by side; 1024 px → panel under the lines |
| BR-FF-104 | Line tables on detail pages show every line without paging; a document holds at most 500 lines (frozen BR-STD-33), so no over-limit case exists. | PO with 35 lines → all 35 rows; PO with 500 lines → all 500 rows |

## Lists
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-FF-105 | Every list in this feature (PR, PO, GRN lists, receive picker, approvals inbox) shows 50 rows per page by default, with 25 / 50 / 100 to choose from one shared setting; the choice is remembered per list on that browser; paging controls hide when the total is at most the chosen page size (v2 `Pagination`). | PR list → 50 rows; pick 100, come back tomorrow → 100; 12 rows → no paging controls; page size 25, 40 rows → controls shown |
| BR-FF-106 | The PR list shows: number, date, type, requester, lines, estimate, earliest required-by, status. | Row "PR-2026-11-3 · 20-11 · Stock reorder · S · 2 · ₹2,51,000 · 28-11 · Pending approval" |
| BR-FF-107 | The PO list shows: number, date, supplier, lines, total, due date (late marked), received % by qty, status. | GRN-2026-11-4 (600 kg) pending QA → "PO-2026-11-1 · 19-11 · Sri Balaji Metals · 1 · ₹2,89,100 · 25-11 · 0 % · Dispatched"; Q accepts 600 → "… · 60 % · Partly received" (received % = accepted ÷ ordered, frozen BR-GRN-27) |
| BR-FF-108 | The goods-receipt list shows: number, date, PO number, supplier, challan, lines, QA status (BR-FF-115), status; never money. | Row "GRN-2026-11-4 · 20-11 · PO-2026-11-1 · Sri Balaji Metals · CH-11 · 1 · QA pending · Draft" |
| BR-FF-109 | Above each of these lists a summary strip shows a count per group from the table below; clicking a count sets that filter, clicking it again clears it; the approvals inbox strip is BR-FF-79. | PO strip "All 6 · Draft 1 · In approval 0 · To send 1 · Open 3 · Late 1" → click Late → 1 row |
| BR-FF-115 | The goods-receipt QA status is one value from its lines: QA pending if any line is pending; else Passed if every line is passed or waived (waived counts as passed); else Failed if every line failed; else Partly accepted (some failed, some passed / waived, none pending). | Lines pending + passed → QA pending; passed + waived → Passed; failed + failed → Failed; failed + passed → Partly accepted |
| BR-FF-110 | A list row opens its document page on click; the row number is a real link, so it can open in a new tab. | Ctrl-click PO-2026-11-1 → page opens in a new tab |

Summary-strip groups (BR-FF-109). "All" = every row under the other filters.
| List | Group | Statuses / condition | Overlaps another group |
|---|---|---|---|
| PR | Draft | `draft` | no |
| PR | In approval | `pending_approval` | no |
| PR | To order | `approved` / `partial_ordered` with ≥ 1 `pending` line (= tile 23) | no |
| PR | Ordered | `approved` / `partial_ordered` with no `pending` line, `fully_ordered` | no |
| PR | Closed | `rejected`, `cancelled` | no (the five groups add up to All) |
| PO | Draft · In approval · To send | `draft` · `pending_approval` · `approved` | no |
| PO | Open | `dispatched`, `partial_received` | no |
| PO | Late | BR-FF-26 predicate | yes: every Late row is also Open |
| PO | (All only) | `fully_received`, `invoiced`, `closed`, `cancelled` | — (no own chip) |
| GRN | Draft | GRN status `draft` | yes: a draft can also be QA pending |
| GRN | QA pending | any line QA `pending` (= tile 28) | yes, with Draft |
| GRN | Done | `accepted`, `partial_accepted` | no |
| GRN | Rejected | `rejected` | no |

## Forms
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-FF-111 | Creating or editing a requisition or an order, and receiving goods, are full pages with their own URL (`…/new`, `…/<id>/edit`, `/grn/new?po=<id>`); one-decision actions (cancel with reason, one QA decision, delay, send, confirm, approve) stay as dialogs. | "New requisition" → `/purchase-requisitions/new` page; Cancel PR → dialog asking the reason |
| BR-FF-112 | Leaving a full-page form with unsaved changes (link, back, reload) asks "Leave without saving?"; saving or leaving with no changes does not ask. | S types a quantity, clicks Home → asked; S saves → lands on the PR page, no question |

## Exceptions to the design-system patterns
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-FF-113 | The approvals preview beside the list (BR-FF-81) and the two-pane detail pages and forms at full width (BR-FF-103) are owner-requested exceptions to two v2 texts: design-system `design/screens.md` (intro) "A list and its detail are separate routes, never a split panel", and `frontend/.claude/skills/design-system/SKILL.md` §5 "**Detail** = `DetailHeader` + `DocumentFlow` + cards in one column (≤ 1100 px)". Every two-pane page in this feature falls back to one column below 1100 px. Reviewers do not raise them as findings. | Design review of the PO page at 1440 px → side panel beside lines accepted; at 1024 px → one column |
| BR-FF-114 | The goods-receipt list, receive picker and receive form (screens 9–11) use the v2 "large" 40 px size for buttons, inputs and the per-line arrived box; rows keep the normal v2 density (44 px comfortable); no other size is used. | Receive form on a tablet → "Save", "Fill open quantity" and arrived boxes 40 px; picker rows 44 px |

## Choices made in this part (moved to `assumptions.md`)
Menu order and labels, `/home` route, 50 rows default, list columns, strip groups, dialogs kept for
one-decision actions, leave warning: A-16..A-22. Menu groups A-26, v2 exceptions A-27, page sizes A-29,
strip chips A-37, narrow screens A-38. Strip groups A-57, menu guard A-17 / A-65, max lines A-67, QA status
A-68, paging footer A-72, shop-floor size A-34 / A-76.
