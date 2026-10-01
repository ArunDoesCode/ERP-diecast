---
name: api-endpoint-intake
description: >
  Mandatory pre-build questionnaire for backend API work. Use before implementing or
  refactoring endpoint contracts in DiecastOS Hono backend. Trigger: create api,
  new endpoint, route design, request/response contract, pagination, filter,
  lookup api, batch edit, soft delete.
---

# API endpoint intake (mandatory before coding)

Use this checklist before writing controller/service/repository code.
Resolve every section — where something is unresolved, stop and ask first.

## 1) Resource and ownership

1. What is primary resource and route group?
2. Which module owns source-of-truth data?
3. Is this endpoint in correct bounded context?
4. Should this be one endpoint or split by concern (master vs relation vs lookup)?

## 2) Endpoint surface

1. Exact method + path (case-sensitive).
2. Path casing convention chosen (avoid mixed `editX` vs `EditX`).
3. Are legacy aliases required for backward compatibility?
4. Which endpoints are list/create/update/detail, and are delete routes intentionally omitted?

## 3) Identity and selectors

1. What identifies target row: path `:id`, composite keys, or body selector?
2. For edit endpoints, do selectors allow one-of identifiers (A OR B)?
3. If one-of selector exists, how is invalid/ambiguous selector handled?

## 4) Request contract

1. Required fields and optional fields.
2. Nullability intent (`undefined` vs explicit `null`).
3. Validation ranges and enums.
4. For update, is "at least one updatable field" enforced?
5. For create from master references, should IDs be existence-validated?

## 5) Response contract

1. Success shape: `{ success: true, data }` or `{ success: true, data, meta }`.
2. Paginated response meta shape fixed as `{ page, pageSize, total, totalPages }`.
3. Detail endpoint payload: full nested data vs light summary counts.
4. Batch endpoint payload: per-row result format and summary counts.

## 6) Pagination and sorting (all list/index)

1. `page` default `1`, `pageSize` default `10`, max `100`.
2. `sortBy` whitelist and `sortDir` default.
3. Stable ordering with PK tie-breaker.
4. Search fields and filter behavior defined.

## 7) Lookup APIs for combobox/autofill

1. Is lookup needed for foreign-key selection in UI?
2. Which searchable fields should lookup support?
3. Which autofill fields are required by frontend?
4. Should lookup live in owning module rather than feature module?

## 8) Batch and sequential processing rules

1. Single or array accepted?
2. Process sequentially or transactionally?
3. Partial success allowed?
4. Per-record validation failures should fail row only or whole request?
5. Conflict behavior for duplicates (`409`) defined?

## 9) Soft delete and lifecycle

1. Is delete route needed?
2. If no delete, which field controls soft delete (`isActive`)?
3. Which list endpoints include inactive rows by default?

## 10) Auth and RBAC

1. Required auth middleware.
2. Permission key per route (`requirePermission` / `requireAnyPermission`); new keys go in `src/lib/permissions.ts` first.
3. Any permission differences between list/detail and mutating endpoints?

## 11) Data integrity and schema links

1. Foreign-key paths verified in schema.
2. Does endpoint correctly join/ref against source tables?
3. Are reference enums and transactional invariants respected?
4. Date filters: start/end day boundary behavior explicit.

## 12) Error contract

1. 400 validation and selector errors.
2. 404 not-found semantics (resource vs relation row).
3. 409 unique/duplicate conflicts.
4. 401/403 auth and role failures.

## 13) Frontend flow fit check

Confirm endpoint set covers:

1. list/search view
2. detail view
3. create flow
4. update flow
5. pagination/filter interactions
6. lookup/autocomplete interactions
7. inline or modal edit flow
8. status/active toggle behavior (if applicable)

## 14) Pre-code output required

Before implementation, produce concise contract summary:

1. route table (method + path)
2. request schemas
3. response shapes
4. error matrix
5. unresolved questions list
6. new routes must also call `registry.register(...)` (see `src/lib/route-registry.ts`) directly below the route declaration, or `bun test`'s drift-prevention check will fail

Start coding once every question on that list has an answer.

## 16) Contract publication (mandatory, after coding)

1. Run `bun run contract:generate` to refresh `.contracts/api-manifest.json` — this is the manifest the frontend agent queries via `bun run contract:query`, not backend source. A route shipped without a fresh manifest is a shipped bug for the frontend agent, same as a broken endpoint.
2. Spot-check the new/changed route with `bun run contract:query "<METHOD> <path>"` before calling the task done — confirm the descriptor's request/response shape, auth, and pagination fields match what you built.

## 15) Type boundary contract (mandatory)

Confirm before coding:

1. Controller parses with Zod schema and forwards inferred payload type to service.
2. Service accepts Zod-inferred contract types only (no DB row-shape duplication).
3. Repository uses Drizzle schema-derived types (`$inferInsert`/`$inferSelect`) for create/update/select contracts.
4. Any special domain requirement is expressed as a minimal overlay on inferred type, not a full handwritten duplicate.
5. Exactly one status/type union is shared across controller/service/repository.
6. Zod schemas that mirror a Drizzle table are generated via `drizzle-zod` (`createSelectSchema`/`createInsertSchema`/`createUpdateSchema`), not hand-declared field-by-field — hand-author only the fields where the API contract deliberately diverges from column nullability, with a comment explaining why.
7. Repository select column sets use `getTableColumns(table)` unless the projection excludes specific columns.
