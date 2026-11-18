# <Module> — data design

> Written by solution-designer from `../spec.md`. Checked by performance-auditor and security-auditor
> before freeze. Conventions: `backend/CLAUDE.md`, `backend/.claude/reference/`. Max 150 lines.

## Tables
One block per new or changed table.

### `<table_name>` (new | changed)
| Column | Type | Null | Unit / decimals | Rule | Note |
|---|---|---|---|---|---|
| id | uuid pk | no | | | |
| qty | numeric(14,3) | no | kg, 3 decimals | BR-XXX-02 | > 0 |
| rate_paise | integer | no | paise | BR-XXX-03 | money is integer paise |

- **Keys:** foreign keys (table.column, on delete), unique constraints.
- **Indexes:** one line each — columns, and the query or filter that needs it. Every FK and every
  list filter / sort column has one.
- **Status enum:** values, same as `../spec.md` → Flow.

## Stock and money
Which actions post to `inventory_ledger` (movement type, sign, quantity unit). Never a direct edit of
`currentStock`.

## Volumes and locks
| Table | Rows per year | Hot query | Lock needed |
|---|---|---|---|
| | | | e.g. `for update` on the PO line when two users receive |

## Migration notes
Order of migrations, backfill of existing rows, anything that cannot be rolled back.

## Choices made
Technical choices not asked of the owner. spec-analyst moves these rows into `../assumptions.md`.
| Question | Choice | Source |
|---|---|---|
