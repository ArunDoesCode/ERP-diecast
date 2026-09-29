# Report 02 — test-writer (BR-AUTH-21, 03, 04, 05, 23)
Files: backend/src/routes/auth.test.ts (17 tests), backend/src/routes/permissions-matrix.test.ts (76 tests, HTTP via createApp). Typecheck + biome clean.
Run: 89 pass, 16 fail (all fails are spec violations or unbuilt feature).

## FAIL-BUG (code exists, violates spec)
| id | where | finding |
|---|---|---|
| TEST-1 | backend/src/lib/rate-limiter.ts (throws ForbiddenError) | BR-AUTH-04: 11th login gets 403 RATE_LIMITED, spec says 429 (2 tests) |
| TEST-2 | authService.login/refresh + refresh_tokens.token_hash unique | BR-AUTH-05: refresh JWT has no jti; same user signing in twice in one second gives an identical token -> duplicate-key 500 on login; refresh within the same second re-issues the same token, so the "used" token still works (2 tests) |

## FAIL-EXPECTED (feature not built)
GET /asset/machines (fs), GET /asset/items + GET/POST /asset/inventory/movements (ow, fs), POST grn bypass (fs must lose it), GET /supplier/listSuppliers + detail (ow, fs), /auth/register still exists (400, must be 404).

## PASS
BR-AUTH-03 (4), BR-AUTH-23 (5), BR-AUTH-05 logout + no-cookie, all other matrix rows.

## Notes
- Matrix expected = today's contract roles + only the BR-AUTH-21 listed differences; seed roles ow/bo/fs/qa/dd/sa, each via real login token.
- Not asserted (spec does not say which key covers them): GET /asset/items/:itemId/last-rate, GET /supplier/:id/listItems, listServices. A coverage test fails if a new role-guarded route is missing from the matrix (sco/subcontract routes exempt).
- Assumed: asset items list + movements GET = inventory.view (ow,bo,fs); POST movements = inventory.adjust (ow,bo). Coordinator please confirm with spec owner.
- Not tested here: super-admin over-receipt override, owner auto-approve (other BRs).
- Login limiter keys on x-forwarded-for; tests use unique IPs.
