# <Module> — API design

> Written by solution-designer from `../spec.md` and `data.md`. Source for the run's `contract.md`.
> Checked by security-auditor (permission on every route) and code-reviewer (conventions) before freeze.
> Conventions: `backend/.claude/reference/hono-build-conventions.md`, skills `api-endpoint-intake`,
> `pagination-contract`. Max 150 lines.

## Endpoints
| Method | Path | Permission key | Purpose | Rules |
|---|---|---|---|---|
| POST | `/api/<module>` | `<mod>.manage` | create draft | BR-XXX-01 |

Every route has exactly one permission key from `../spec.md` → Who can do what. No route without one.

## Payloads
One block per endpoint. Field, type, bounds (every string has a max length, every quantity an upper
bound), required or not.

### `POST /api/<module>`
- **Request:** `{ field: type (bounds) }`
- **Response 201:** `{ … }`
- **Errors:** 400 validation · 401 · 403 · 404 · 409 (duplicate, wrong status) — with the rule id that
  causes each.

## Lists
Each list endpoint: filters, sort columns (whitelist), default sort, page size limits.

## Choices made
Technical choices not asked of the owner. spec-analyst moves these rows into `../assumptions.md`.
| Question | Choice | Source |
|---|---|---|
