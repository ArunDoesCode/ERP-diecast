---
module: <kebab-name>
spec: docs/specs/<kebab-name>.md      # or "none yet"
last_verified_commit: <short sha>     # code state this map describes
last_verified_on: <YYYY-MM-DD>
depends_on: []                        # other modules whose tables/services this one uses
---

# <Module> — as-built map

> What the code **is** (the spec says what it **should be**). Agents read this before touching the module
> and only explore code changed since `last_verified_commit`
> (`git diff <sha>..HEAD --stat -- <paths below>`). Use symbol names, not line numbers — lines rot.

## Summary
3–5 lines: what the module does today, maturity (full / partial / schema-only), main users.

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| schema | `backend/src/db/schemas/…` | tables, enums |
| types | `backend/src/types/…` | Zod schemas |
| repository | `backend/src/repository/…` | |
| service | `backend/src/service/…` | |
| controller | `backend/src/controller/…` | |
| routes | `backend/src/routes/…` + `end-points.ts` keys | |
| frontend api | `frontend/src/lib/api/<feature>/` | fetchers, query hooks, query keys |
| frontend ui | `frontend/src/app/(protected)/…`, `components/views/…`, `components/pages/…` | |

## Data model
Tables, key columns, status enums (list values), FKs to other modules, ledger postings.

## API
| Method | Path | Roles | Purpose |
|---|---|---|---|
Full shapes: `cd backend && bun run contract:query "<METHOD /path>"`.

## Key flows
Ordered call chains, e.g. `createGrn`: controller → `grnService.create` → validate PO open qty →
`grnRepository.insert` (tx) → `inventoryLedger` posting.

## Invariants & gotchas
Module-specific rules and traps learned while building/fixing (this is where learnings go, not CLAUDE.md).

## Tests
| File | Covers |
|---|---|

## Known gaps / debt
- … (link backlog ids `BL-NNN`)

## History
| Date | PR / commit | Change |
|---|---|---|
