---
module: factory-flows
part: layout
status: draft
index: spec.md
---

# Factory flows — Menu, page layout, lists, forms

> Part of `spec.md` (example data and shared rules BR-FF-01..08 are there). Rules BR-FF-100..112.
> Sizes, colours, spacing and components come from design-system v2 (incl. BR-DS-28, BR-DS-29) and are
> not restated here. Research found no benchmark rule for list strips or pop-up vs page (Q9): these
> follow the brief ("screens use the space").

## Menu
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-FF-100 | The default menu order and labels are: Home, Approvals, Requisitions, Purchase orders, Goods receipts, Subcontracting, Inventory, Suppliers, Employee directory, Setup; each still shows only with its key. | S → Home, Approvals, Requisitions, Goods receipts, Subcontracting, Inventory, Suppliers |
| BR-FF-101 | The new default is written once to every existing install; after that, label and order edits made in Setup → Screens are kept by every later sync. | Admin moves Suppliers to the top after the update → next app start keeps Suppliers on top |
| BR-FF-102 | The old Landing page becomes Home at `/home`; `/landing` redirects to `/home`. | Bookmark `/landing` → Home |

## Detail pages
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-FF-103 | Detail pages use the full content width: main column (header, lines) on the left, side panel (BR-FF-50) on the right; on narrow screens the side panel moves below the lines. | 1440 px screen → lines and side panel side by side; 1024 px → panel under the lines |
| BR-FF-104 | Line tables on detail pages show every line without paging up to 200 lines. | PO with 35 lines → all 35 rows on the page |

## Lists
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-FF-105 | Lists show 50 rows per page by default, with 25 / 50 / 100 to choose; the choice is remembered per list on that browser. | PR list → 50 rows; pick 100, come back tomorrow → 100 |
| BR-FF-106 | The PR list shows: number, date, type, requester, lines, estimate, earliest required-by, status. | Row "PR-2026-11-3 · 20-11 · Stock reorder · S · 2 · ₹2,51,000 · 28-11 · Pending approval" |
| BR-FF-107 | The PO list shows: number, date, supplier, lines, total, due date (late marked), received % by qty, status. | Row "PO-2026-11-1 · 19-11 · Sri Balaji Metals · 1 · ₹2,89,100 · 25-11 · 60 % · Partly received" |
| BR-FF-108 | The goods-receipt list shows: number, date, PO number, supplier, challan, lines, QA status, status; never money. | Row "GRN-2026-11-4 · 20-11 · PO-2026-11-1 · Sri Balaji Metals · CH-11 · 1 · QA pending · Draft" |
| BR-FF-109 | Above each of these lists a summary strip shows a count per status group (PO list adds "Late"); clicking a count sets that filter, clicking it again clears it. | PO strip "Draft 1 · In approval 0 · To send 1 · Open 3 · Late 1" → click Late → 1 row |
| BR-FF-110 | A list row opens its document page on click; the row number is a real link, so it can open in a new tab. | Ctrl-click PO-2026-11-1 → page opens in a new tab |

## Forms
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-FF-111 | Creating or editing a requisition or an order, and receiving goods, are full pages with their own URL (`…/new`, `…/<id>/edit`, `/grn/new?po=<id>`); one-decision actions (cancel with reason, one QA decision, delay, send, confirm, approve) stay as dialogs. | "New requisition" → `/purchase-requisitions/new` page; Cancel PR → dialog asking the reason |
| BR-FF-112 | Leaving a full-page form with unsaved changes (link, back, reload) asks "Leave without saving?"; saving or leaving with no changes does not ask. | S types a quantity, clicks Home → asked; S saves → lands on the PR page, no question |

## Choices made in this part (moved to `assumptions.md`)
Menu order and labels, `/home` route, 50 rows default, list columns, strip groups, dialogs kept for
one-decision actions, leave warning: A-16..A-22.
