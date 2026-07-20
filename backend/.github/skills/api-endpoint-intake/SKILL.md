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
If any section is unresolved, stop and ask questions first.

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
2. Allowed roles per route.
3. Any role differences between list/detail and mutating endpoints?

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

Do not code until unresolved questions are answered.
