# 08 test-writer — BR-AUTH-01/02/09/10/12/18/24 + F-TEST-4

- F-TEST-4 fixed: biome format on permissions.test.ts, permissions-sync.test.ts. `bun run lint` has 0 errors.
- New: backend/src/routes/permission-enforcement.test.ts (HTTP via createApp, real DB): 09 (4), 10 (3), 12 (5), 18 (7), 24 (2), 01/02 (2).
- Changed: backend/src/service/authService.test.ts BR-AUTH-01 test now asserts /auth/me role+keys (spec v6 wording), not token payload role/allowedPages (removed by S3 contract).
- Status: 8 pass, 17 fail. All FAIL-EXPECTED (S3 not built: invalidateActor/Role throw "not implemented", routers still on requireRole, /auth/me has no permissions).
- Assumptions: /auth/me returns data.role (name string) and data.permissions (string[]); tests call invalidateRole/invalidateActor after direct DB edits.
- Not covered (spec silent on endpoint): role copy -> SYSTEM_ROLE_PROTECTED for super-admin (BR-AUTH-18); copy endpoint is not in the contract.
- Hazard: with old code, super-admin can rename/delete system roles; system-role tests use fixture roles / restore names in afterEach so seed rows survive. If seed roles go missing, rerun db:test:prepare.
