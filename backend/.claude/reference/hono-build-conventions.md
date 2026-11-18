# Hono build conventions (backend/src)

Reference doc, not an agent. Read by the pipeline agent `backend-dev` (and by `/slice`, `/bug`) before
writing backend code. Converted from the retired `hono-builder` agent on 2026-11-18 (workflow v2, 0.7);
the conventions are unchanged. Goal: API features that are maintainable, type-safe and consistent, with a
single source of truth for every concern.

## Mandatory API intake

- Before implementing or refactoring any endpoint contract, load the skill `api-endpoint-intake` and follow it.
- Answer its checklist from the frozen spec. An item the spec does not answer → return BLOCKED with the question.
- Start coding only after route/method, request/response shape, pagination/filter rules, permission key, and error contract are explicit.

## Conventions to Follow

- Keep controllers thin: Zod-parse the request, call the service, shape the HTTP response — business logic lives in the service layer.
- Route all DB/ORM access through the repository — controllers and services call the repository, and only the repository touches the client.
- Let the async handler wrapper and global error middleware own error flow; throw `AppError`s and let them bubble up instead of catching locally in the controller.
- Source every route path from `src/routes/end-points.ts` — add the constant there first, then reference it.
- Type every value precisely — infer request/response contracts from Zod and DB contracts from Drizzle's `$inferInsert`/`$inferSelect`.
- Derive repository types straight from the Drizzle schema instead of hand-writing DTOs.
- Derive Zod schemas in `src/types/*.types.ts` that mirror a Drizzle table from `drizzle-zod` (`createSelectSchema`/`createInsertSchema`/`createUpdateSchema`), then `.pick()`/`.omit()`/`.extend()` for the API-facing variant — don't hand-declare field types and nullability the column already owns. Keep a field hand-authored only when the contract deliberately diverges from column nullability, with a comment explaining why.
- Import the DB client from `src/db/client.ts` and reuse that shared instance everywhere.
- Attach OpenAPI summary, tags, schemas, and security metadata to every endpoint as you build it.
- Give every list/index endpoint mandatory server-side pagination from the start — invoke `Skill` with `skill: "pagination-contract"`. Default `page`/`pageSize` to `1`/`10` (max `100`) so an unparameterized request still returns a paginated response.

## Architecture

Three strict layers — no cross-layer calls:

| Layer      | File                                    | Responsibility                                                         |
| ---------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| Controller | `src/controller/<feature>Controller.ts` | Zod parse → call service → return HTTP                                 |
| Service    | `src/service/<feature>Service.ts`       | Business rules, orchestration (Zod-inferred contracts)                 |
| Repository | `src/repository/<feature>Repository.ts` | DB queries only, Drizzle-derived types (`$inferInsert`/`$inferSelect`) |

Helpers and utilities live in `src/lib/*`. Auth middleware in `src/lib/auth-middleware.ts`.

## Single Source Of Truth

| Concern                                 | Location                                       |
| ------------------------------------------ | -------------------------------------------------- |
| API base paths                          | `src/routes/end-points.ts`                     |
| Request schemas + inferred types        | `src/types/<feature>.types.ts`                 |
| Error codes + messages                  | `src/lib/errors.ts`                            |
| Response envelope schemas (OpenAPI)     | `src/lib/response-schemas.ts`                  |
| Route descriptor + OpenAPI registration | `src/lib/route-registry.ts`                    |

## Error Contract

- Repository and service: return raw typed data on success; throw `AppError` from `src/lib/errors.ts` on failure.
- Controller: validate → call service → return `{ success: true, data: ... }`. No error logic.
- Global error handler maps all `AppError`s to `{ success: false, message, code?, details? }`.

## Approach

1. Add endpoint path constants to `src/routes/end-points.ts`.
2. Add or update Zod schemas in `src/types/<feature>.types.ts` (derive from Drizzle via `drizzle-zod` where they mirror a table).
3. Implement repository in `src/repository/<feature>Repository.ts`.
4. Implement service in `src/service/<feature>Service.ts`.
5. Implement controller in `src/controller/<feature>Controller.ts` — async handler wrap required.
6. Register route descriptors via `src/lib/route-registry.ts` in `src/routes/<feature>.ts`.
7. Mount feature router in `src/routes/index.ts` with auth; apply `requirePermission("<key>")` (or `requireAnyPermission`) on each route — add a new key to `src/lib/permissions.ts` first if needed.
8. Add OpenAPI summary, tags, request/response schema, and security metadata to every descriptor.
9. Run `bun run lint && bun run typecheck && bun test` — fix all failures before finishing.
10. Run `bun run contract:generate` to refresh `.contracts/api-manifest.json`.

## Contract Publication (mandatory)

`src/lib/route-registry.ts` is the single source of truth the frontend agent queries against — it never reads `backend/src` directly. Every new/changed route needs a `registry.register(...)` call (step 6 above; `bun test`'s drift check fails otherwise), and after that, `bun run contract:generate` must be re-run so `.contracts/api-manifest.json` reflects the change. A stale manifest after a backend change is a shipped bug for the frontend agent, same as a broken endpoint — treat it as part of "done," not an optional follow-up.

The frontend agent (or you, to sanity-check your own work) queries the manifest with `bun run contract:query "<search term>"` (free-text across path/summary/tags) or `bun run contract:query "<METHOD> <path>"` (exact route, full descriptor) — run from `backend/`, or `bun run --cwd <path-to-backend> contract:query "..."` from the frontend repo.

## Quality Gates Before Finish

- Every new endpoint uses constants from src/routes/end-points.ts.
- Controllers delegate all error handling to the async handler + global middleware.
- Controllers call only the service layer — DB/ORM access stays in the repository.
- Service returns business-shaped data; HTTP status logic stays in the controller.
- Repository returns raw typed data only.
- Controller/service contracts are Zod-inferred from `src/types/*.types.ts`.
- Repository contracts are Drizzle-derived, sourced straight from the schema.
- Response and error shapes are uniform.
- Every schema and endpoint string has exactly one source of truth.
- Every endpoint has OpenAPI summary/tags/schemas/security metadata.
- Every value is precisely typed.
- `bun run contract:generate` re-run after any route/schema/auth change — manifest matches current code.
