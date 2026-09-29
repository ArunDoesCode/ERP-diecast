# 68 security-auditor — m1 merge + S7 (`git diff dfbf5f5 HEAD`)
Saved by coordinator (auditor is read-only). No blockers, no majors.

Checked clean: every asset/supplier/grn route key matches auth-setup table + contract "Route → key"/"S7"; no unguarded handler (only `GET /asset/machines` is requireAuth, service checks asset.manage | pr.link_machine, assetService.ts:416-422, BR-AUTH-26); grn over-receipt uses `can(actor,"grn.over_receipt_override")` + reason on qaAction and bypass, actor from DB; GRN line ownership + 409 on repeat + correction cap; S7 removals complete (no requireRole/allowedPages/Role in non-test source, no orphan end-points); isSuperAdmin from DB actor, display-only, backend enforces BR-PR-17; no frontend role-name lists; no bank fields exposed.

| id | sev | where | issue | fix |
|---|---|---|---|---|
| SEC-12 | minor | backend/src/db/schemas/01_auth.ts; migrations 2026070* | `role_pages` removed from schema but no migration drops it; stale grants stay in DB, nothing reads them | drop migration, or backlog note (push-based deploys, BL-011) |
| SEC-13 | minor | backend/src/routes/asset.ts:44-49 | `GET /asset/machines` is any-authenticated; guard lives only in the service | route `requireAnyPermission("asset.manage","pr.link_machine")` + registry entry; keep the 403 test |
