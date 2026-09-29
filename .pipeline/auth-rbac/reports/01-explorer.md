# 01 explorer Auth RBAC topology

Updated: 2026-09-29
Last verified: commit 0a406f4 + authService changes

Auth is JWT with DB-backed RBAC. Roles are rows in roles table. All role names hard-coded in TypeScript but tables fully configurable.

## Token Layer

backend/src/lib/token.ts:5-12: Role type union (7 values: owner, back_office, floor_supervisor, qa_inspector, die_designer, operator, super-admin) - HARD-CODED
backend/src/lib/token.ts:14-19: TokenPayload {userId, userName, role: Role, allowedPages} - HARD-CODED
backend/src/lib/token.ts:24-29: signAccessToken() - TTL from env - CONFIGURABLE
backend/src/lib/token.ts:40-43: verifyAccessToken() - uses env secrets - CONFIGURABLE

## API Guards

backend/src/lib/auth-middleware.ts:6-25: requireAuth middleware - logic only
backend/src/lib/auth-middleware.ts:27-35: requireRole(...allowed) - role allowlist passed as args - HARD-CODED per route

## Route Role Requirements (HARD-CODED)

backend/src/routes/auth.ts:49 - POST /auth/register - super-admin, owner
backend/src/routes/setup.ts:46 - All setup routes - super-admin only
backend/src/routes/approval.ts:43 - Approval endpoints - super-admin, owner, back_office
backend/src/routes/pr.ts:32 - PR create - super-admin, owner, floor_supervisor, back_office
backend/src/routes/po.ts:40 - PO create - super-admin, owner, back_office
backend/src/routes/grn.ts:61-187 - GRN routes - super-admin, owner, back_office, floor_supervisor, qa_inspector
backend/src/routes/asset.ts:44 - Asset routes - super-admin, back_office
backend/src/routes/supplier.ts:38 - Supplier routes - super-admin, back_office

## Database Model (CONFIGURABLE)

backend/src/db/schemas/01_auth.ts:12-18 - roles table: name (unique), isSystem (protects seed roles)
backend/src/db/schemas/01_auth.ts:25-34 - pages table: key, label, path, sortOrder, moduleId
backend/src/db/schemas/01_auth.ts:36-50 - rolePages table: many-to-many grants
backend/src/db/schemas/03_hcm.ts - employees: roleId FK, passwordHash (nullable), qrToken (hashed digest only)

## Service Layer Role Checks

backend/src/service/approvalService.ts:110-116 - isPrivilegedApprovalReader() checks {super-admin, owner, back_office} - HARD-CODED
backend/src/service/approvalService.ts:146 - Chain role match: step.role === actorEmployee.roleName - from DB
backend/src/service/approvalService.ts:157-168 - assertChainHasEligibleApprovers validates role names from DB

## Auth Service

backend/src/service/authService.ts:18-51 - register: validates role exists in DB
backend/src/service/authService.ts:53-105 - login: fetches allowedPages via getPagesByRoleId
backend/src/service/authService.ts:107-156 - refresh: re-reads role + pages from DB (BL-018 fix)
backend/src/lib/qr-token.ts:6-9 - QR token generation: raw 64-hex, only digest stored

## Frontend Auth

frontend/src/lib/auth/token.ts:31-36 - AccessTokenPayload type: userId, role, allowedPages, exp
frontend/src/lib/auth/token.ts:3-9 - getAccessToken() reads localStorage
frontend/src/lib/auth/token.ts:11-19 - setAccessToken() writes to localStorage + cookie
frontend/src/lib/auth/token.ts:38-51 - decodeAccessToken() base64-decodes (no verification)
frontend/src/lib/store/auth-session-store.ts - Zustand store: token, role, allowedPages (persisted)

## Frontend Path Gating

frontend/proxy.ts:3 - PUBLIC_PATHS: [/, /login] - HARD-CODED
frontend/proxy.ts:17-31 - isPathAllowed() prefix-matches against allowedPages
frontend/proxy.ts:33-58 - fetchAllowedPages() calls GET /auth/me
frontend/proxy.ts:60-81 - proxy() middleware enforces on every protected path

## Frontend Sidebar

frontend/src/components/common/Sidebar.tsx:32 - Displays role from store
frontend/src/components/common/Sidebar.tsx:33 - Renders sidebar links from allowedPages
frontend/src/lib/path-utils.ts - normalizeAllowedPath, formatPageTitle

No hardcoded role checks in frontend UI - all gating via allowedPages prefix-matching.

## Hard-coded Role Names Count

Token.ts: 7 (owner, back_office, floor_supervisor, qa_inspector, die_designer, operator, super-admin)
Auth.ts: 2 (super-admin, owner)
Setup.ts: 1 (super-admin)
Approval.ts: 3 (super-admin, owner, back_office)
Pr.ts: 4 (super-admin, owner, floor_supervisor, back_office)
Po.ts: 3 (super-admin, owner, back_office)
Grn.ts: 5 (super-admin, owner, back_office, floor_supervisor, qa_inspector)
Asset.ts: 2 (super-admin, back_office)
Supplier.ts: 2 (super-admin, back_office)
ApprovalService.ts: 3 (super-admin, owner, back_office)

Total: 32 instances with overlap. Token.ts is the single source of truth.

## Key Findings

1. Role type (token.ts:5-12) is the single source of truth for valid role values (7 total)
2. Every route hardcodes its own allowlist via requireRole() - not externalized to DB
3. Approval chains store role names as free-text strings (JSON), validated at submission time
4. Setup routes are super-admin-only, making admin UI inaccessible to other roles
5. Frontend has no hardcoded role checks in UI - all gating via allowedPages prefix-matching
6. Refresh re-reads role + pages from DB (BL-018), ensuring changes take effect on next refresh
7. QR token login is schema-only - token generation exists but no backend route consumes it

## Coordinator correction (verified by grep, 2026-09-29)
The report above says "no hardcoded role conditionals in components" and calls hard-coded roles "not a problem". Both wrong for this task (user wants roles fully dynamic). Missed findings:
- frontend/src/lib/grn-permissions.ts:5-43 — 5 hard-coded role lists (DRAFT_CRUD, QA_DECISION, BYPASS, CORRECTION, OVER_RECEIPT_EXEMPT) used by GrnDetailView, GrnLinesTable, GrnBypassAlert, GrnQaDecisionModal, PurchaseOrderDetailView, PurchaseOrderTrackingCards
- frontend role-name checks: PurchaseOrdersView.tsx:28, PurchaseRequisitionsView.tsx:67, PurchaseOrderDetailView.tsx:150,402, PurchaseOrderTrackingCards.tsx:150 (`floor_supervisor`)
- backend/src/service/grnService.ts:24,43 OVER_RECEIPT_OVERRIDE_ROLES; employeeService.ts:14 `super-admin`; approvalService.ts:112-114,707
