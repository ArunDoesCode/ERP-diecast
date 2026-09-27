---
module: <kebab-name>
status: draft            # draft | frozen | changed-after-freeze
version: 0
frozen_on:
owner: Arun
depends_on: []           # e.g. [approval, purchase-requisition]
---

# <Module name> — functional spec

## 1. Purpose
One paragraph: what problem this solves at the plant, who uses it, what "done" looks like on the floor.

## 2. Actors & permissions
| Role (from `roles` table) | Can view | Can create | Can edit | Can approve / change status |
|---|---|---|---|---|

## 3. Documents & key fields
Which records exist (header/lines), the fields that drive rules (qty, uom, rate, tolerance, dates),
units and precision (money = paise).

## 4. State machine
| From | Action | To | Who | Preconditions (BR ids) | Side effects |
|---|---|---|---|---|---|
| — | create | draft | … | BR-XXX-01 | number assigned |

Terminal states: …

## 5. Business rules
Atomic, testable, never renumbered. Deprecated rules are ~~struck through~~ with a note.

- **BR-XXX-01** — When …, the system must … (otherwise error `…`).
- **BR-XXX-02** — …

## 6. Cross-module effects
Stock ledger postings, approval requests, costing/avg cost, document numbering, notifications.

## 7. Acceptance criteria
- **AC-01** (BR-XXX-01) — Given … When … Then …
- **AC-02** (BR-XXX-02, BR-XXX-03) — Given … When … Then …

Include negative paths: rejection, cancellation, reversal, partial, over/under qty, permission denied,
edit after approval, concurrent edits.

## 8. Screens (frontend)
List/queue, detail, create/edit form, actions per status. Which fields are visible/editable per status/role.

## 9. Reports / queries needed
…

## 10. Out of scope / later
- …

## 11. Open questions for factory SME
Phrase so a stores/purchase clerk can answer in one line.
1. …

## 12. Implementation status
| BR | Status (todo / done) | Test |
|---|---|---|

## Changelog
- <date> v0 — draft created
