---
feature: bom
module: bom
status: agreed               # owner delegated all decisions in chat, 2026-11-20
date: 2026-11-20
owner: Arun
---

# Brief — Bill of materials (BOM)

> Built from roadmap M3 (`docs/WORKFLOW.md`) and `docs/product/vision.md`. The owner was away and wrote:
> "take ur own decision and record them and run whatever parallel subagents u want to complete a complete scm module according to my plan, ill do a complete merge in moring once completed" (owner, chat, 2026-11-20)

## Problem
No BOM: what a casting is made of (alloy, inserts, subcontract steps) lives in people's heads, so nobody
can work out what to buy for an order (vision: "Siloed information", "Single supervisor dependency").

## Who uses it
| Person | What they do with it |
|---|---|
| back office / planning | records what each part is made of: levels, casting yield, alloy, inserts, subcontract operations |
| purchase | reads it to see what an order needs |

## Outcome
Roadmap M3: a BOM per part with levels, casting yield, alloy, inserts, subcontract operations and
revisions — the base for sale order explosion (M4).

## Selling point
not decided — "take ur own decision and record them and run whatever parallel subagents u want to complete a complete scm module according to my plan, ill do a complete merge in moring once completed" (owner, chat, 2026-11-20)

## Not included
- Sale order and explosion (roadmap M4, own brief)
- Production, job tracking, routing on machines (vision: later phase)

## How we know it worked
Roadmap exit gate: spec frozen. At the factory: every running part has one active BOM revision.
