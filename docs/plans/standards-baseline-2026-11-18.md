---
title: Standards-check baseline
date: 2026-11-18
commit: 930eec2
plan: docs/plans/agentic-workflow-v2.md (Phase 1)
---

# Standards-check baseline — 2026-11-18

First run of the two checks, in report mode. Nothing was fixed. Use this to open clean-up issues;
when a rule reaches 0, switch it to blocking (`standards:check:strict`).

Full list, any time: `cd backend && bun run standards:check` · `cd frontend && bun run standards:check`
(add `-- --summary` for counts only).

## Backend — 216 findings

| Rule | Count | Meaning |
|---|---|---|
| `idx-fk` | 72 | foreign-key column with no index (not PK, not unique, not first column of an index) |
| `idx-filter` | 35 | column filtered in a repository query, no index starting with it (one row per column) |
| `raw-ilike` | 32 | `ilike(` outside the shared helper: 31 call sites + 1 "helper does not exist" |
| `zod-string` | 55 | `z.string()` in a request schema with no `.max()` |
| `zod-number` | 18 | quantity / amount number in a request schema with no upper bound |
| `db-error-409` | 2 | shared error handler does not map 23505 (unique) or 23503 (FK) to 409 |
| `ist-date` | 2 | "today" from server-local midnight (`setHours(0, 0, 0, 0)`) |

Top 10 files

| Findings | File |
|---|---|
| 39 | `backend/src/db/schemas/02_procurement-purchasing.ts` |
| 24 | `backend/src/types/asset.types.ts` |
| 21 | `backend/src/repository/assetRepository.ts` |
| 13 | `backend/src/repository/approvalRepository.ts` |
| 13 | `backend/src/repository/supplierRepository.ts` |
| 13 | `backend/src/types/setup.types.ts` |
| 10 | `backend/src/types/supplier.types.ts` |
| 9 | `backend/src/db/schemas/02_procurement-catalog.ts` |
| 8 | `backend/src/db/schemas/01_auth.ts` |
| 8 | `backend/src/types/approval.types.ts` |

Facts behind the counts

- **Search helper:** none exists. `escapeLike()` is copied in `scoRepository.ts` and `supplierRepository.ts`.
  The check expects `backend/src/lib/safe-search.ts`. 18 of the 31 `ilike(` sites do **not** escape `%` / `_`
  (the finding text says which).
- **Error handler:** `backend/src/app.ts:48` `onError` has no 23505 / 23503 branch, so an uncaught one is a 500.
  Three files catch 23505 by hand with `isUniqueViolation()`; no 23503 helper exists.
- **IST helper:** exists (`backend/src/lib/ist-day.ts`). The two hits are `assetRepository.ts:136`
  and `prService.ts:34`. No `toISOString().slice(0, 10)` is left in `backend/src`.
- **Zod:** 162 request-side schema declarations checked (reached from route `request:` blocks and
  `.parse()` calls). Response schemas are skipped.

## Frontend — 65 findings

| Rule | Count | Meaning |
|---|---|---|
| `mutation-invalidate` | 1 | `useMutation(` with no cache invalidation and no `// no-invalidate:` comment (63 checked) |
| `raw-palette` | 62 | lines with raw Tailwind palette classes outside `src/components/ui/**` |
| `motion` | 2 | `transition-*` / `animate-*` outside `src/components/ui/**` and the allow-list |

Top 10 files

| Findings | File |
|---|---|
| 12 | `frontend/src/lib/sco-format.ts` |
| 10 | `frontend/src/lib/grn-status-badge.ts` |
| 10 | `frontend/src/lib/po-status-badge.ts` |
| 8 | `frontend/src/components/views/purchase-orders/PurchaseOrderDetailView.tsx` |
| 8 | `frontend/src/lib/pr-status-badge.ts` |
| 3 | `frontend/src/components/pages/purchase-orders/PurchaseOrderTrackingCards.tsx` |
| 2 | `frontend/src/components/pages/grn/GrnBypassAlert.tsx` |
| 2 | `frontend/src/components/pages/grn/GrnQaDecisionModal.tsx` |
| 2 | `frontend/src/components/pages/setup/roles/RoleGrantsEditor.tsx` |
| 1 | `frontend/src/app/(protected)/landing/error.tsx` |

- 40 of the 62 palette findings are the four status-badge maps — they go away with plan item 3.2 (one `StatusBadge`).
- The one mutation is `frontend/src/lib/api/auth/queries.ts:79`.
- Motion hits: `ApprovalCards.tsx:201` (`animate-spin`), `ScoCards.tsx:65` (`transition-colors`).

## Other first-run numbers

| Check | Result |
|---|---|
| `bun audit` backend | 10 advisories (1 high, 8 moderate, 1 low) |
| `bun audit` frontend | 119 advisories (6 critical, 45 high, 59 moderate, 9 low) |
| Commits mixing tests and source (whole history) | 1 of 313 |
| Frontend `bun run build` | passes |

## Limits of the checks

Text-based, no AST. A finding is a pointer to look at, not a proof.

- `idx-filter` looks at every repository filter, not only list queries, and does not know table size —
  low-cardinality columns (status, is_active) will show up. Treat as a review list.
- `zod-string` accepts `.max`, `.length`, `.regex` and format checks (uuid, email, date…) as bounded.
- `raw-palette` and `motion` count lines, not classes.
