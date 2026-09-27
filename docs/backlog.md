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
| BL-014 | P1 | defect | inventory | `itemMaster.currentStock` / `averageCostPaise` never recomputed from `inventory_ledger` postings (GRN accept/bypass/correction, movements). Stock screens and PR cost estimates (`prRepository` uses `averageCostPaise`) read stale values. Decide: derive from ledger vs update in same tx | module mapping (verified) | 2026-09-27 |
| BL-015 | P2 | defect | inventory | `POST /asset/inventory/movements` posts directly to the ledger without checking `referenceId` points to a real document — second, unguarded posting path | module mapping | 2026-09-27 |
| BL-016 | P2 | debt | grn | GRN ledger posting (`assetRepository.createInventoryMovement`, own tx) not atomic with grnItems/PO roll-up tx | module mapping | 2026-09-27 |
| BL-017 | P3 | feature | auth-setup | Operator QR login has no route — QR token issuance exists (`qr-token.ts`, `employeeService.regenerateQr`) but `/auth/login` is email+password only. Needed for floor PWA (later milestone) | module mapping (verified) | 2026-09-27 |
| BL-019 | P2 | defect | purchase-requisition | `pr_item_status` values `ordered`/`closed`/`cancelled` are never written (only `pending`, `po_draft`) — PR lines never advance after PO receipt/close; header status is right via `recomputeHeaderStatusFromItems` (verify in PR spec) | module mapping | 2026-09-27 |
| BL-021 | P3 | debt | docs | `backend/docs/backend-audit-remediation-2026-07-21.md` partly stale (numbering + delete fixed backend-side) — mark resolved items | module mapping | 2026-09-27 |
| BL-023 | P3 | debt | approval | `ApprovalPoliciesView` edit-form effect: review deps/reset flow in approval spec (lint fixed by adding `policyForm.reset`) | CI fix | 2026-09-27 |
| BL-024 | P1 | defect | approval | Policy form labels amounts in ₹ but sends the typed number as paise → ₹50,000 saved as ₹500 (spec draft approval.md §12, verify) | approval spec draft | 2026-09-27 |
| BL-025 | P1 | defect | purchase-requisition | `prService.update` has no status check and PATCH accepts `status` (`pending_approval`/`cancelled`) → edit after submit, approval bypass (purchase-requisition.md §12, verify) | PR spec draft | 2026-09-27 |
| BL-026 | P1 | defect | grn | QA accept "already decided" check runs outside the tx without a lock → concurrent accepts double-post stock; `acceptedQty` not bounded by arrived qty; stacked corrections can exceed accepted (grn.md §12, verify) | GRN spec draft | 2026-09-27 |
| BL-027 | P2 | defect | approval | PO approval reject skips `setStatusCancelled` → PR lines stuck `po_draft`; PO/SCO always match category `any`, SCO amount 0 → seeded tooling/maintenance/SCO policies never match (approval.md §12, verify) | approval spec draft | 2026-09-27 |
| BL-028 | P2 | defect | purchase-order | Cancelling a PO recomputes PR header without checking PR status → can resurrect a cancelled PR (purchase-requisition.md §12, verify) | PR spec draft | 2026-09-27 |

## Done
| ID | Item | PR / commit | Closed |
|---|---|---|---|
| BL-000 | GitHub Actions CI | 0a406f4 | 2026-09-27 |
| BL-003 | Frontend lint (40 label a11y + format/imports/non-null/deps) + backend format error; `seed_page_access.sql` fixed (stale `::role` casts, duplicate hardcoded super-admin block) | CI-fix commit | 2026-09-27 |
| BL-006 | Separate test DB: compose `postgres-test` (:5433, tmpfs, `diecast_test`), `bun test` preload swaps to `DATABASE_URL_TEST` with `_test`-name guard, `db:test:prepare`, CI uses it | feature/bl-006-test-db | 2026-09-27 |
| BL-007 | `createApp()` in `src/app.ts` (index.ts only serves it); HTTP smoke tests `src/app.test.ts` via `app.request()` | feature/bl-006-test-db | 2026-09-27 |
| BL-008 | `backend/.contracts/api-manifest.json` committed (deterministic, no timestamp) + CI `contract:check`; `frontend-routes-contract.test.ts` fails on any `API_ROUTES` path without a backend route (`KNOWN_GAPS` allowlist, BL-001 only); removed dead frontend `files.presign` (no backend route, unused) | feature/bl-006-test-db | 2026-09-27 |
| BL-009 | Project hooks in `.claude/settings.json`: PostToolUse `biome-format.sh` (biome --write on edited backend/frontend file, unfixable errors fed back), Stop `typecheck-on-stop.sh` (tsc only for packages with changed .ts/.tsx, blocks on errors, loop-safe) | feature/bl-006-test-db | 2026-09-27 |
| BL-013 | `backend/CLAUDE.md` route/lib/schema/test sections match the code; Supabase leftovers removed from `drizzle.config.ts`, `db/client.ts`, `.env.example` | feature/bl-006-test-db | 2026-09-27 |
| BL-020 | No change — premise was wrong: `purchase-orders/[prId]` receives a PR id (queue card pushes `pr.id`, view loads PR detail). Module map corrected | feature/bl-006-test-db | 2026-09-27 |
| BL-022 | Confirmed + fixed: `updateApprovalPolicySchema.subDocType` had `.default("any")` → every PATCH reset it (and an empty PATCH passed). Now optional; amount-only PATCH counts as an update. Regression test `src/types/approval.types.test.ts` | feature/bl-006-test-db | 2026-09-27 |
| BL-018 | Confirmed + fixed: `authService.refresh` re-reads active employee + role + pages (401 if deactivated — was also refreshing forever). Regression test `src/service/authService.test.ts`. Also fixed test isolation: per-file `disconnectDb()` moved to a global afterAll in the test preload | feature/bl-006-test-db | 2026-09-27 |

Next free id: **BL-029**
