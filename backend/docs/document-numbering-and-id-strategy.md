# Document Numbering and ID Strategy

## Decision

- Keep internal table primary keys as numeric (`serial`/`bigint`).
- Use one shared counter table for business document numbers (PR, PO, SCO, etc.).
- Optionally add `publicId` (UUID/ULID) for external links/APIs later; do not replace internal PKs.

## Why

- Numeric PKs: faster joins, smaller indexes, simpler relations.
- Shared counter table: no per-workflow counter table explosion.
- Business numbers stay human-readable and period-scoped.

## Counter Model

Use one table, for example `document_number_counters`:

- `id` (pk)
- `docType` (`pr`, `po`, `sco`, ...)
- `periodKey` (e.g. `2026-07` or `FY26-27`)
- `lastSeq` (int, not null, default 0)
- `createdAt`, `updatedAt`
- Unique constraint: (`docType`, `periodKey`)

## Atomic Allocation Pattern

Inside same DB transaction as document insert:

1. `INSERT ... ON CONFLICT (docType, periodKey) DO UPDATE SET lastSeq = lastSeq + 1 RETURNING lastSeq`
2. Build number: `<PREFIX>-<PERIOD>-<SEQ_PADDED>`
3. Insert document row with generated number
4. Insert child rows

If transaction fails, counter increment rolls back too.

## Time Boundary Rule

- Derive period from DB-side time policy, not app server local time.
- Prefer UTC for simplicity unless business requires factory-local timezone.

## API Exposure Rule

- Returning internal `id` to frontend is acceptable.
- Always enforce auth + role/ownership checks server-side.
- For public/external URLs, expose `publicId` instead of internal `id`.

## Rollout Order

1. Add shared counter table in schema.
2. Refactor PR creation to allocate number in repository transaction.
3. Remove PR retry loop based on unique-conflict racing.
4. Reuse same allocator for PO/SCO when those workflows are added.

## Non-Goals

- Do not migrate all PKs to UUID.
- Do not create separate counter table per workflow.
