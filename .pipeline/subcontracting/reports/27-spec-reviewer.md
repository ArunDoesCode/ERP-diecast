# Report 27 — spec-reviewer — subcontracting (BR-SCO-01..25)
Gate: docs/specs/subcontracting.md v2 frozen: OK. Tests: `bun test` 1342 pass, 0 fail (35 files, run with DATABASE_URL_TEST + dummy token secrets).
Coverage: every BR-SCO-01..25 has enforcement and at least 3 tests naming it (grep BR-SCO-nn). BR-SCO-15, 21, 23, 24 have no `BR-SCO-nn` tag in non-test code (enforced inline: service/scoReceiptService.ts:~380 scrap, routes/sco.ts requirePermission, scoService.close lock).
Contract: all 17 sco + 2 company routes in frontend routes.ts match backend paths, methods (PATCH updatesco, PATCH company/settings, POST elsewhere), path params. OK.
Changelog clarifications honoured: v2 company_settings + HSN, optional challan date/heat, 400-vs-409 race, proportional rounding (sco-math.ts), close-with-QA-pending 409 (scoService.ts close), material_received with QA pending (sco-math.ts). OK.

| id | sev | area | file:line | finding | fix |
|---|---|---|---|---|---|
| SPEC-1 | minor | test | backend/src/routes/sco.test.ts:719 | BR-SCO-21 says "delete a posted challan → 400". Test only checks an SCO DELETE gives >= 400; no challan/receipt delete test. There is no delete route, so real answer is 404 not 400. | Test-writer: add challan/receipt delete cases; coordinator: decide "no route (404)" is acceptable and reword spec example. |
| SPEC-2 | minor | backend | backend/src/service/scoChallanService.ts:~260 | BR-SCO-09 "max 16 characters" not enforced; `JWC/${fy}/${seq}` overflows at seq >= 10^6 per FY. | Assert length <= 16 after building number (throw AppError) or note the limit as unreachable in the map. |
| SPEC-3 | minor | spec | backend/src/service/scoReceiptService.ts:~120, :~245 | Receipt statuses (pending_qa / accepted / partial_accepted / rejected), receipt number `SCO-GRN-<period>-<seq>` and receipt line qa statuses are not in the spec. Derived, harmless. | Add one line to spec changelog/map via /spec; no code change. |
| SPEC-4 | minor | backend | backend/src/service/scoService.ts (close, loss loop) | Loss write-off also raises `settledQty` on open challan lines (so the challan counts as settled) with no settlement row. BR-SCO-17/19 do not describe this. | Record in spec changelog/map (needed for ITC-04 later); or leave challans open after loss. |
| SPEC-5 | minor | backend | backend/src/lib/errors.ts:67 | `NotImplementedError` (contract-step stub) is unused. | Delete it. |
| SPEC-6 | minor | backend | backend/src/service/scoService.ts (close) | Close with no loss still stores an optional reason in `closeReason`; spec allows reason only for loss. Harmless. | None, or ignore reason when no loss. |

Not findings (checked): approval matched on total incl. GST + category `subcontracting` (approvalRepository.ts:894, test sco.test.ts:489, GAP-1 done); submit key sco.manage; e-way rules; GSTIN "unregistered" print; ratio rounding; cost = ratio x issue cost + price; FIFO settlement; owner-only loss close; cancel reason always; 365-day window; whole pieces.

QUESTIONS: none
Verdict: READY (0 blockers, 0 major, 6 minor)
