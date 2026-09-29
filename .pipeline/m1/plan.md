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
