---
feature: factory-flows
module: factory-flows
status: agreed
date: 2026-11-20
owner: Arun
---
# Brief — Factory flows
## Problem
"The flows are not proper enough to run a factory." "Most screens are half empty."
People open the app and nothing tells them what is waiting for them; they open a list and filter.
## Who uses it
| Person | What they do with it |
|---|---|
| Floor (store keeper, QA) | Raise requisitions, receive goods, inspect receipts |
| Office (purchase officer, approver) | Turn requisitions into orders, chase late orders, approve |
| Plant head | See today's picture of the plant |
## Outcome
Each person logs in and sees their own pending work; one click takes them to it, and the next step is offered from the document they are on. Screens use the space instead of being half empty.
## Selling point
not decided
## Not included
- Bill of materials, sale order, production.
- Notifications and search by document number (later round).
## How we know it worked
Each role finds its pending work in one click from home, and raising a requisition or receiving goods takes half today's clicks.
> Scope note (owner, 2026-11-20, "ok go with your defaults"): first build = home with work queues, real requisition and order pages, receive goods from the goods-receipt screen, approvals preview, next-step buttons; the build sets the menu order.
> Added (owner, 2026-11-20, "add the layout work to factory-flows"): detail pages with a side panel (totals, approvals, linked documents, history), fuller lists (more rows and columns, a summary strip), full-page forms instead of pop-ups.
