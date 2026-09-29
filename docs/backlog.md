# Backlog

Everything not in a frozen spec. Nothing here gets built until it's pulled into a spec (`/spec`) and frozen.
IDs are permanent (`BL-NNN`, next free id at the bottom). Close items by moving them to **Done** with the
PR/commit — never delete. When this file passes ~150 open items, split into `docs/backlog/<module>.md`
and keep this file as the index (see `docs/KNOWLEDGE.md`).

Priority: **P1** blocks current milestone · **P2** needed before UAT · **P3** nice to have.
Type: defect · infra · feature · debt · idea.

## Open
| ID | P | Type | Module | Item | Why / source | Raised |
|---|---|---|---|---|---|---|
| BL-001 | P1 | defect | purchase-requisition | Frontend `DELETE /pr/deletepr` sends id in body; backend route is `/pr/deletepr/:id` → 404 | repo review | 2026-09-27 |
| BL-002 | P1 | decision | approval | `prType`→`subDocType` fixed (2026-09-27). **Open:** keep `isSaleOrderLinked` as a policy filter (dropdown commented out, backend supports it) — frontend now stops sending it (= any). Decide in approval spec: A keep both / B drop / C defer | CI fix | 2026-09-27 |
| BL-004 | P1 | infra | auth-setup | `bootstrap-admin` script — `/auth/register` needs an existing super-admin/owner, empty DB can't create first user | workflow setup | 2026-09-27 |
| BL-005 | P1 | infra | backend | `bun run db:reset` — drop → push → page access seed → approval policies → realistic fixtures | workflow setup | 2026-09-27 |
| BL-010 | P2 | infra | frontend | Playwright for 5–8 golden paths | workflow setup | 2026-09-27 |
| BL-011 | P2 | debt | backend | Switch `db:push` → generated migrations before UAT-1 (D-004) | decisions | 2026-09-27 |
| BL-012 | P1 | infra | repo | Protect `main` on GitHub: require PR + CI jobs `backend`, `frontend` | workflow setup | 2026-09-27 |
| BL-017 | P3 | feature | auth-setup | Operator QR login has no route — QR token issuance exists (`qr-token.ts`, `employeeService.regenerateQr`) but `/auth/login` is email+password only. Needed for floor PWA (later milestone) | module mapping (verified) | 2026-09-27 |
| BL-019 | P2 | defect | purchase-requisition | `pr_item_status` values `ordered`/`closed`/`cancelled` are never written (only `pending`, `po_draft`) — PR lines never advance after PO receipt/close; header status is right via `recomputeHeaderStatusFromItems` (verify in PR spec) | module mapping | 2026-09-27 |
| BL-023 | P3 | debt | approval | `ApprovalPoliciesView` edit-form effect: review deps/reset flow in approval spec (lint fixed by adding `policyForm.reset`) | CI fix | 2026-09-27 |
| BL-024 | P1 | defect | auth-setup | Privilege escalation: an `owner` can register a `super-admin` via `/auth/register` (`routes/auth.ts:49`, `types/auth.types.ts:7-15`); also register doesn't set `createdBy` (`authService.ts:18-51`) | known-defects spec | 2026-09-27 |
| BL-025 | P1 | defect | approval | Policy form labels amounts in ₹ but sends the typed number as paise → ₹50,000 saved as ₹500 (spec draft approval.md §12, verify) | approval spec draft | 2026-09-27 |
| BL-026 | P1 | defect | purchase-requisition | `prService.update` has no status check and PATCH accepts `status` (`pending_approval`/`cancelled`) → edit after submit, approval bypass (purchase-requisition.md §12, verify) | PR spec draft | 2026-09-27 |
| BL-028 | P2 | defect | approval | PO approval reject skips `setStatusCancelled` → PR lines stuck `po_draft`; PO/SCO always match category `any`, SCO amount 0 → seeded tooling/maintenance/SCO policies never match (approval.md §12, verify) | approval spec draft | 2026-09-27 |
| BL-029 | P2 | defect | purchase-order | Cancelling a PO recomputes PR header without checking PR status → can resurrect a cancelled PR (purchase-requisition.md §12, verify) | PR spec draft | 2026-09-27 |
| BL-030 | P2 | debt | purchase-requisition | `prService.update` writes lines one row at a time (`updatePrItemById`/`createPrItem` in loops) and is one ~200-line function — batch + split (audit P1.2, §4) | BL-021 audit | 2026-09-27 |
| BL-032 | P3 | debt | suppliers | `supplierRepository.list` search = OR + ILIKE + EXISTS, no `pg_trgm` indexes (audit S2) | BL-021 audit | 2026-09-27 |
| BL-033 | P3 | debt | suppliers | Item vs service create/batch-edit in `supplierService.ts` are near-duplicates (audit S4) | BL-021 audit | 2026-09-27 |
| BL-034 | P2 | defect | purchase-requisition | `prRepository.list` `q` still matches `type::text`/`status::text`; frontend sends status/type through `q` instead of the `status`/`type` params (audit B1) | BL-021 audit | 2026-09-27 |
| BL-036 | P3 | debt | auth-setup | Access token returned in JSON and stored in localStorage + JS-readable cookie + persisted Zustand (`frontend/src/lib/auth/token.ts`, `auth-session-store.ts`) — XSS exposure (audit B3, deferred) | BL-021 audit | 2026-09-27 |
| BL-037 | P3 | debt | frontend | `frontend/proxy.ts` fetches `/auth/me` on every navigation although `allowedPages` is in the JWT (audit B4) | BL-021 audit | 2026-09-27 |
| BL-038 | P2 | infra | repo | Worktree bootstrap: new `.claude/worktrees/*` have no `backend/.env` or `node_modules`, so agents must export env by hand to run `bun test` — add a `scripts/worktree-setup.sh` (copy/symlink `.env`, `bun install` both packages, `db:test:prepare`) and call it from `/feature` | test-writer report (PR #6) | 2026-09-27 |
| BL-039 | P3 | idea | inventory | Should `opening_stock` be stock-in only? Today a negative opening-stock row is accepted (spec silent; BR-GRN-40 says "goes in") | m1-stock review SPEC-6 | 2026-09-29 |
| BL-040 | P3 | debt | grn | Add the input caps to the spec: qty ≤ 1e9, unit cost ≤ int4, row value ≤ 2^53 → 400; unknown location → 404 | m1-stock review | 2026-09-29 |
| BL-041 | P3 | debt | grn | `applyDraftUpdate` reads `findLineUoms`/`findByChallan` on `db` not `tx` (extra pooled connection inside tx) | m1-stock review PERF-6/SPEC-8 | 2026-09-29 |
| BL-042 | P3 | defect | grn | Frontend over-receipt warning ignores earlier receipts (only 105% of ordered); server still asks for the reason | m1-stock FE-note-1 | 2026-09-29 |
| BL-043 | P3 | debt | grn | Whole-number unit list duplicated in `frontend/src/lib/grn-units.ts` and backend `WHOLE_NUMBER_UNITS`; expose from backend or add a contract test | m1-stock review CR-7 | 2026-09-29 |
| BL-044 | P3 | debt | grn | grn-stock BR-GRN-43 example says owner → 200; API returns 201. Align the spec example at the next change | m1-stock test-writer note | 2026-09-29 |
| BL-045 | P2 | feature | inventory | Stock reconciliation screen (API `GET /api/asset/inventory/reconciliation` exists) | m1-stock plan | 2026-09-29 |
| BL-046 | P2 | defect | purchase-order | inventory BR-INV-05: an inactive item must not go on a new PO — a PR line approved before the item was deactivated can still become a PO line. Add the check where PO lines are drafted (PO code: auth session). SCO part of BR-INV-10 → subcontracting build | m1-stock review SPEC-20 | 2026-09-29 |
| BL-047 | P3 | debt | purchase-order | Last-rate `source`: `pr_estimate` means item average (rename `item_average`); PO screen has no label for `standard_rate` and prefills 0 for legacy items with no standard rate — skip prefill when 0 | m1-stock review SPEC-24, CR-28 | 2026-09-29 |
| BL-048 | P2 | debt | inventory | Spec touch-up at next change: BR-INV-13 "the only main store can't be deactivated (409)" (decided by Arun 2026-09-29); BR-INV-07 reorder level whole for pcs/set; BR-INV-24 legacy item with standard rate 0 → 0; posting to unknown location → 404 | m1-stock review SPEC-26..29 | 2026-09-29 |
| BL-049 | P3 | idea | inventory | Location `isVirtual` is derived from type (vendor_premise only); spec silent for other types — confirm | m1-stock review SPEC-25 | 2026-09-29 |
| BL-050 | P3 | debt | inventory | Stock list search `ilike %q%` can't use an index; add pg_trgm if items pass ~50k | m1-stock review PERF-23 | 2026-09-29 |
| BL-051 | P3 | debt | backend | Move `likePattern` (escapes `\ % _`) to lib and use it in supplier/po/pr/grn/approval/employee searches | m1-stock review SEC-21 | 2026-09-29 |
| BL-052 | P3 | defect | inventory | PATCH location with only `isVirtual` returns 200 and changes nothing but the audit stamp; return 400 on empty payload | m1-stock review CR-27 | 2026-09-29 |
| BL-053 | P2 | defect | purchase-order | PO supplier picker should list only active suppliers (`status=active`, suppliers BR-SUP-24) — PO screen, auth session | m1-stock suppliers review | 2026-09-29 |
| BL-054 | P3 | debt | suppliers | Batch edit runs ~3 queries per row (≤ 300 in one tx); `supplier_services.service_id` unindexed; GSTIN change to an invalid value keeps the old PAN in the form | m1-stock review PERF-41/42, CR-43 | 2026-09-29 |
| BL-055 | P3 | debt | suppliers | Spec touch-up at next change: field caps (name 200, contact 200, phone 30, email 254, address 500, SKU 100, qty ≤ 1e9); history also tracks SKU/qty/unit/lead time (BR-SUP-10); single-row edit of unknown row → 404; BR-SUP-04 PAN refilled on GSTIN change | m1-stock review SPEC-41..45 | 2026-09-29 |

## Done
| ID | Item | PR / commit | Closed |
|---|---|---|---|
| BL-031 | Fixed: batch edit ≤ 100 rows, one tx, ordered row locks (BR-SUP-19..21) | work/m1-stock | 2026-09-29 |
| BL-035 | Fixed: fixed plain error sentences per case, no DB text (BR-SUP-22) | work/m1-stock | 2026-09-29 |
| BL-014 | Fixed: `postStock` updates item stock + moving average in the same tx as every ledger row (grn-stock BR-GRN-37/38/39) | work/m1-stock | 2026-09-29 |
| BL-015 | Fixed: manual movements only `stock_adjustment`/`opening_stock` with reason + `inventory.adjust` roles; document types → 400 (BR-GRN-43) | work/m1-stock | 2026-09-29 |
| BL-016 | Fixed: accept/bypass/correction post ledger, item, line, QA row, PO in one tx (BR-GRN-22) | work/m1-stock | 2026-09-29 |
| BL-027 | Fixed: GRN + PO + line row locks, one decision per line (409), accepted+rejected=arrived, sum of corrections ≤ accepted (BR-GRN-09/10/29) | work/m1-stock | 2026-09-29 |
| BL-000 | GitHub Actions CI | 0a406f4 | 2026-09-27 |
| BL-003 | Frontend lint (40 label a11y + format/imports/non-null/deps) + backend format error; `seed_page_access.sql` fixed (stale `::role` casts, duplicate hardcoded super-admin block) | CI-fix commit | 2026-09-27 |
| BL-006 | Separate test DB: compose `postgres-test` (:5433, tmpfs, `diecast_test`), `bun test` preload swaps to `DATABASE_URL_TEST` with `_test`-name guard, `db:test:prepare`, CI uses it | PR #4 | 2026-09-27 |
| BL-007 | `createApp()` in `src/app.ts` (index.ts only serves it); HTTP smoke tests `src/app.test.ts` via `app.request()` | PR #4 | 2026-09-27 |
| BL-008 | `backend/.contracts/api-manifest.json` committed (deterministic, no timestamp) + CI `contract:check`; `frontend-routes-contract.test.ts` fails on any `API_ROUTES` path without a backend route (`KNOWN_GAPS` allowlist, BL-001 only); removed dead frontend `files.presign` (no backend route, unused) | PR #4 | 2026-09-27 |
| BL-009 | Project hooks in `.claude/settings.json`: PostToolUse `biome-format.sh` (biome --write on edited backend/frontend file, unfixable errors fed back), Stop `typecheck-on-stop.sh` (tsc only for packages with changed .ts/.tsx, blocks on errors, loop-safe) | PR #4 | 2026-09-27 |
| BL-013 | `backend/CLAUDE.md` route/lib/schema/test sections match the code; Supabase leftovers removed from `drizzle.config.ts`, `db/client.ts`, `.env.example` | PR #4 | 2026-09-27 |
| BL-020 | No change — premise was wrong: `purchase-orders/[prId]` receives a PR id (queue card pushes `pr.id`, view loads PR detail). Module map corrected | PR #4 | 2026-09-27 |
| BL-022 | Confirmed + fixed: `updateApprovalPolicySchema.subDocType` had `.default("any")` → every PATCH reset it (and an empty PATCH passed). Now optional; amount-only PATCH counts as an update. Regression test `src/types/approval.types.test.ts` | PR #4 (fix), PR #6 (tests by test-writer) | 2026-09-27 |
| BL-018 | Confirmed + fixed: `authService.refresh` re-reads active employee + role + pages (401 if deactivated — was also refreshing forever). Regression test `src/service/authService.test.ts`. Also fixed test isolation: per-file `disconnectDb()` moved to a global afterAll in the test preload | PR #4 (fix), PR #6 (tests by test-writer) | 2026-09-27 |
| BL-021 | Audit doc statuses verified against code: 13 resolved, 4 partial, 7 open, 1 frontend-only; status block at top. Open items not already tracked → BL-030..BL-037 | PR #4 | 2026-09-27 |

Next free id: **BL-056**
