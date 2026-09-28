---
module: <kebab-name>
status: draft            # draft | frozen | changed-after-freeze
version: 0
frozen_on:
owner: Arun
depends_on: []           # e.g. [approval, purchase-requisition]
---

# <Module name>

> Keep it to one screen per section and ≤ 150 lines total (≤ 25 rules). Plain words, short sentences.
> Bigger module → split into sub-specs. Code locations, gaps and history go in `docs/modules/<module>.md`.

## Summary
3–5 lines: what it is, who uses it, what "done" looks like on the floor.

## Who can do what
| Action | Allowed |
|---|---|
| create | back_office, owner |

## Flow
| From | Action | To | Rule |
|---|---|---|---|
| — | create | draft | BR-XXX-01 |

## Rules
One sentence per rule, plus one example. IDs are permanent (strike out, never renumber).
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-XXX-01 | … must … | PO qty 100, receive 120 → rejected |

## Not now
- …

## Questions for you
Max 7. Each answerable with a letter. Recommended option first.
| # | Question | Options | Answer |
|---|---|---|---|
| Q1 | … | **A** … (recommended) / B … | |

## Changelog
- <date> v0 — draft
