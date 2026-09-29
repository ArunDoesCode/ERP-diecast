# Plan — m1 (this session): auth-setup → known-defects → purchase-requisition → approval(+policies) → purchase-order

Other session builds grn(+stock), inventory, suppliers, subcontracting on `work/m1-stock`; merge it in before S7.
Spec: docs/specs/auth-setup.md v5 (frozen). Map: docs/modules/auth-setup.md ("Proposed auth layer").
Explorer: reports/01-explorer.md (54-route parity table).

## auth-setup slices
| # | Slice | BRs | Backend | Frontend | Tests |
|---|---|---|---|---|---|
| S1 | Parity + session baseline | 21 (parity), 03, 04, 05, 23 | none | none | route × seed-role allow/deny fixture from today's lists (must be green now, stays green); login/refresh/logout |
| S2 | Catalog, tables, sync, seed | 06, 24, 21 (seed) | `lib/permissions.ts` catalog + screens registry; tables `permissions`, `role_permissions`, `screens`, `auth_audit_log`; deploy sync; seed = spec table | none | catalog synced; seed matches table; new key held by nobody |
| S3 | Enforcement | 09, 10, 12, 18 (bypass), 23, 01, 02 | `AuthRequirement {type:"permission",key}`; `requirePermission`; per-request actor (active, role, keys) with cache + invalidation; every router switched; token = id+name only | none | 403 `PERMISSION_DENIED` with key; next-request effect; super-admin bypass; parity still green |
| S4 | Service checks + PR machine | 11, 26 | `can(actor,key)` replaces grnService/approvalService/employeeService role lists; `pr.link_machine` machine read | none | over-receipt via key; machine list for `pr.link_machine` |
| S5 | Me + frontend gating | 13, 14, 15 (menu) | login + `/auth/me` return `role`, `permissions`, `screens` | `useCan`/`<Can>`; remove every role-name check (grn-permissions.ts, PO/PR views); Sidebar + proxy from `screens` | me shape; UI checklist |
| S6 | Role admin + guardrails + audit | 07, 08, 15 (admin), 16, 17, 18, 19, 20, 25; register retired (Q6/Q10) | roles CRUD/copy, grants, screens label/order/group + role ticks, guardrails, audit log, `/auth/register` removed | Setup: role editor (checkbox grid by module, copy, diff), Screens tab, access log | each guard code; log rows |
| S7 | Cleanup (after merging work/m1-stock) | 11 (CI), 15 (retire role_pages) | drop `role_pages`, `Role` union, `requireRole`; convert stock branch `// perm:` routes; CI test fails on role-name literals | drop old Permissions tab | literal-scan test; parity green |

Then: known-defects, purchase-requisition, approval(+policies), purchase-order — each gets its own plan section here when reached.

## known-defects + purchase-requisition slices (explorer: reports/19-explorer.md)
| # | Slice | BRs | Notes |
|---|---|---|---|
| KD-S1 | bootstrap-admin script | BR-KD-17, 20, 23, 25, 27, 28, 29 | `bun run bootstrap-admin`, env inputs, exit codes, one super-admin, race-safe |
| KD-S2 | db:reset script + fixtures | BR-KD-30, 33, 35, 40, 44, 46 | guard → drop schema → push → seeds (roles + permission keys) → fixtures via real services; CI uses it |
| PR-S1 | PR cancel | BR-PR-39, 41, 42, 43, 46 (cancel), 47; BR-KD-01..10, 13, 16 | one cancel path `DELETE /api/pr/deletepr/:id` + reason; audit cols; row lock; approval cancel in same tx; frontend BL-001 fix |
| PR-S2 | PR create / edit / submit | BR-PR-01, 02, 06, 08, 11, 14, 15, 17, 19, 21, 45, 46, 47 | draft-only edits (PR_NOT_EDITABLE), requester-only, standard-rate estimate, 3-decimal qty |
| PR-S3 | PR line states ↔ PO | BR-PR-25, 28, 30, 31, 32, 33, 36 | built with purchase-order module (PO writes drive PR lines) |

## approval + approval-policies + purchase-order slices (explorer: reports/41-explorer.md)
| # | Slice | BRs | Notes |
|---|---|---|---|
| APR-S1 | Policy admin + matching | BR-APR-01..03, 05..11, 13..16, 18, 19, 21, 22, 57..60 | ₹ vs paise form bug (BL-025); fallback chain moved to seed data (F-APR-1) |
| APR-S2 | Request flow | BR-APR-23, 24, 26..31, 33, 35, 37, 39, 40, 42, 43, 45..48, 50..52, 54, 61 | approve/reject/send-back/withdraw, required comments, trail, mirrors, inbox, history endpoint |
| PO-S1 | PO create/edit/submit/cancel/reject + PR line states | BR-PO-01..07, 11, 12, 20..23; BR-PR-25, 28, 30, 31, 33, 36 | PO reject/cancel cancels PR lines (approval Q4=B) |
| PO-S2 | PO send/logs/delay/overdue/invoice/close/short-close/receipt | BR-PO-08..10, 13..19; BR-PR-32 | receipt status from GRN postings (stock branch) — finish after merge |
