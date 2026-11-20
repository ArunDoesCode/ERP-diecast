---
feature: sale-order
module: sale-order
status: agreed               # owner delegated all decisions in chat, 2026-11-20
date: 2026-11-20
owner: Arun
---

# Brief — Sale order and BOM explosion

> Built from roadmap M4 (`docs/WORKFLOW.md`) and `docs/product/vision.md`. The owner was away and wrote:
> "take ur own decision and record them and run whatever parallel subagents u want to complete a complete scm module according to my plan, ill do a complete merge in moring once completed" (owner, chat, 2026-11-20)

## Problem
When a customer order comes in, nobody can say what metal, inserts and subcontract work it needs and what
is missing from stock; purchase finds out late.

## Who uses it
| Person | What they do with it |
|---|---|
| back office / sales | enters the sale order |
| purchase / planning | runs the explosion, sees net requirement vs stock, gets draft PRs / SCOs |

## Outcome
Roadmap M4: "SO → explosion → net requirement vs stock → draft PRs/SCOs".

## Selling point
not decided — "take ur own decision and record them and run whatever parallel subagents u want to complete a complete scm module according to my plan, ill do a complete merge in moring once completed" (owner, chat, 2026-11-20)

## Not included
- Dispatch, invoice, payment (vision steps 15–16)
- Production planning on machines
- Quotation (vision step 02)

## How we know it worked
Roadmap exit gate: "Scenario: SO → PRs/SCOs auto-created".
