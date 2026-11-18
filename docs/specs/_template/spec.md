---
module: <kebab-name>
status: draft            # draft | frozen (set only by /freeze; change requests keep it frozen)
version: 0
frozen_on:
owner: Arun
depends_on: []           # e.g. [approval, purchase-requisition]
brief: docs/briefs/<feature>.md
research: docs/research/<feature>.md
---

# <Module name>

> Agent layer. The owner reads `OWNER.md`, not this file. ≤ 400 lines (above that: split by sub-module).
> Plain words, one sentence per rule. Tables and columns: `design/data.md`. Endpoints: `design/api.md`.
> Screens: `design/screens.md`. Code locations and history: `docs/modules/<module>.md`.

## Summary
3–5 lines: what it is, who uses it, what "done" looks like on the floor. Name the example data the
rules below use (one part, one quantity, one price).

## Who can do what
| Action | Key | Seed roles |
|---|---|---|
| create | `<mod>.manage` | ow, bo |

## Flow
| From | Action | To | Rule |
|---|---|---|---|
| — | create | draft | BR-XXX-01 |

## Rules
One sentence per rule, plus one example. IDs are permanent (strike out, never renumber).
Tests are named by rule id, so every rule must be checkable from its example alone.
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-XXX-01 | … must … | PO qty 100, receive 120 → rejected |

## Security
Sensitive data — what must never leave the server or be shown to which role:
| Data | Who may see it | Who may change it |
|---|---|---|

Abuse cases — each one ends in a rule above:
| Who | Tries to | Stopped by |
|---|---|---|
| requester | approve own document | BR-XXX-NN |

Audit: which actions write an audit row (actor, time, before → after).

## Edge cases
Full list: `design/edge-cases.md`. Every row there names a rule in this file.
| Source | Count |
|---|---|
| benchmark | |
| owner | |
| invariant | |

## Not now
- …

## Open questions
Must be empty at freeze. Each one ends as an owner card in `OWNER.md` or a row in `assumptions.md`.
| # | Question | Goes to |
|---|---|---|

## Changelog
- <date> v0 — draft
