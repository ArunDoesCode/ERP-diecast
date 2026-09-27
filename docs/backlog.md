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
| BL-006 | P2 | infra | backend | Separate test database (`DATABASE_URL_TEST`) in docker-compose | workflow setup | 2026-09-27 |
| BL-007 | P2 | infra | backend | Export `createApp()` from `src/index.ts` so HTTP tests get the real error handler | workflow setup | 2026-09-27 |
| BL-008 | P2 | infra | repo | Commit `backend/.contracts/api-manifest.json` + test that every frontend `API_ROUTES` path exists in it | workflow setup | 2026-09-27 |
| BL-009 | P2 | infra | repo | Claude Code hooks: biome on edited file, typecheck on stop | workflow setup | 2026-09-27 |
| BL-010 | P2 | infra | frontend | Playwright for 5–8 golden paths | workflow setup | 2026-09-27 |
| BL-011 | P2 | debt | backend | Switch `db:push` → generated migrations before UAT-1 (D-004) | decisions | 2026-09-27 |
| BL-012 | P1 | infra | repo | Protect `main` on GitHub: require PR + CI jobs `backend`, `frontend` | workflow setup | 2026-09-27 |
| BL-013 | P3 | debt | backend | Refresh drifted `backend/CLAUDE.md` (route list, tests claim) and stale Supabase comment in `drizzle.config.ts` | repo review | 2026-09-27 |
| BL-014 | P1 | defect | inventory | `itemMaster.currentStock` / `averageCostPaise` never recomputed from `inventory_ledger` postings (GRN accept/bypass/correction, movements). Stock screens and PR cost estimates (`prRepository` uses `averageCostPaise`) read stale values. Decide: derive from ledger vs update in same tx | module mapping (verified) | 2026-09-27 |
| BL-015 | P2 | defect | inventory | `POST /asset/inventory/movements` posts directly to the ledger without checking `referenceId` points to a real document — second, unguarded posting path | module mapping | 2026-09-27 |
| BL-016 | P2 | debt | grn | GRN ledger posting (`assetRepository.createInventoryMovement`, own tx) not atomic with grnItems/PO roll-up tx | module mapping | 2026-09-27 |
| BL-017 | P3 | feature | auth-setup | Operator QR login has no route — QR token issuance exists (`qr-token.ts`, `employeeService.regenerateQr`) but `/auth/login` is email+password only. Needed for floor PWA (later milestone) | module mapping (verified) | 2026-09-27 |
| BL-018 | P2 | defect | auth-setup | Token refresh reuses old JWT `role`/`allowedPages` instead of re-reading DB — permission changes apply only after re-login | module mapping | 2026-09-27 |
| BL-019 | P2 | defect | purchase-requisition | `pr_item_status` values `ordered`/`closed`/`cancelled` are never written (only `pending`, `po_draft`) — PR lines never advance after PO receipt/close; header status is right via `recomputeHeaderStatusFromItems` (verify in PR spec) | module mapping | 2026-09-27 |
| BL-020 | P3 | debt | purchase-order | Frontend PO detail route named `purchase-orders/[prId]` but param is a PO id — rename | module mapping | 2026-09-27 |
| BL-021 | P3 | debt | docs | `backend/docs/backend-audit-remediation-2026-07-21.md` partly stale (numbering + delete fixed backend-side) — mark resolved items | module mapping | 2026-09-27 |
| BL-022 | P2 | defect | approval | Backend `updateApprovalPolicySchema` gives `subDocType` `.default("any")` → a PATCH without `subDocType` likely resets it to `any` (UI now always sends it). Needs a test | CI fix | 2026-09-27 |
| BL-023 | P3 | debt | approval | `ApprovalPoliciesView` edit-form effect: review deps/reset flow in approval spec (lint fixed by adding `policyForm.reset`) | CI fix | 2026-09-27 |

## Done
| ID | Item | PR / commit | Closed |
|---|---|---|---|
| BL-000 | GitHub Actions CI | 0a406f4 | 2026-09-27 |
| BL-003 | Frontend lint (40 label a11y + format/imports/non-null/deps) + backend format error; `seed_page_access.sql` fixed (stale `::role` casts, duplicate hardcoded super-admin block) | CI-fix commit | 2026-09-27 |

Next free id: **BL-024**
