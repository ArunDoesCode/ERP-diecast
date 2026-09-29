# Findings — subcontracting

| id | sev | area | status | note |
|---|---|---|---|---|
| TEST-1 | major | test | fixed | Tests "BR-AUTH-06 catalog holds exactly the keys of the spec table" and "BR-AUTH-21 owner holds exactly the spec keys" fail: catalog/owner seed now hold `company.manage`. Spec rule: `docs/specs/auth-setup.md` key table row `company.manage` — "edit company settings: plant name, address, GSTIN, state (subcontracting BR-SCO-09) — ow" (added in auth-setup changelog 2026-09-29, D-017). Tests must include it. |
| TEST-2 | minor | test | fixed (revert workaround pending) | `sco.test.ts` afterAll deletes employees but not their `document_number_counters` rows (FK error). Test cleanup must null/delete counter actor rows like PO tests do. Then backend-dev reverts the `actorId: null` workaround in `scoRepository.insertOrder`. |
| GAP-1 | minor | test | fixed | No test that approval policy matches SCO on value incl. GST, category `subcontracting` (BR-SCO-04). Ask spec-reviewer; add in fix loop if flagged. |
| TEST-3 | major | test | fixed | 6 scoChallan tests (BR-SCO-07 x3, BR-SCO-08, BR-SCO-24 x2) make challans worth ≥ ₹50,000 (600 × 12,000 paise = ₹72,000) for a same-state registered vendor with no e-way bill, expecting 201. Spec BR-SCO-10: "its number must be entered before the challan is saved when ... the challan value is ≥ ₹50,000." Fix the tests (send `ewayBillNo`, or cheaper fixtures where the count is not the point); do not change the rule. |
| TEST-4 | major | test | fixed | scoReceipt.test.ts BR-SCO-24 race test (~line 1086) expects `qtyAtVendor` = 400 after 400 issued and a 400-processed receipt pending QA. Spec BR-SCO-12: "(processed × ratio) + unprocessed ≤ qty still at the vendor for that line", example "600 at vendor, return 700 processed → 400" — a receipt pending QA already claims its pieces (the tests at ~629 and ~652 rely on this). So `qtyAtVendor` (still to claim) = 0 there; `pendingQaQty` stays 400. Fix that assertion to 0. |

## Review round 1 (reports 24–27)
| id | sev | decision | note |
|---|---|---|---|
| CR-1 | major | fix now | QA issue cost blends unprocessed settlement segments into processed cost (BR-SCO-14). Regression test first (test-writer), then backend-dev |
| PERF-1 | major | fix now | index for loss log (`sco_loss` ledger rows) |
| PERF-5 | minor | fix now | sort posting lines by item id (deadlock → 500) |
| PERF-3, PERF-4 | minor | fix now | indexes on SCO vendor/status/created and challans vendor (with PERF-1 schema change) |
| SEC-2 | minor | fix now | `q` max 100 + escape LIKE wildcards |
| SPEC-2 | minor | fix now | BR-SCO-09 16-char challan number check |
| CR-2, CR-3 | minor | fix now (frontend) | cache invalidation |
| CR-4, CR-5, CR-7, SPEC-5 | minor | fix now (backend) | small cleanups |
| CR-6 | minor | backlog | challan date bounds — needs spec decision (recommend reject future dates) |
| CR-8 | minor | backlog | vendor check inside create tx |
| SEC-1 | minor | backlog | company settings change history |
| SPEC-1 | minor | backlog | BR-SCO-21 test wording; no delete route (404) |
| SPEC-3, SPEC-4 | minor | map note | receipt statuses/number format; loss raises challan settledQty (ITC-04 later) → module map |
| SPEC-6 | minor | wont-fix | harmless optional reason on no-loss close |
| PERF-2, PERF-6, PERF-7 | minor | backlog | only if slow / >50k rows |
| SEC-Q1 | — | answered | draft edit/cancel by any `sco.manage` holder is intended (same as PO); only submit is creator-only |
