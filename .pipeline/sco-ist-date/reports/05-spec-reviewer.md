# Report 05 — spec-reviewer — sco-ist-date (spec v4, frozen)

Gate: `docs/specs/subcontracting.md` status frozen, version 4. OK.
Verdict: NOT READY (0 blockers, 1 major). Fix or accept SPEC-1; the rest are minor.

## Rule coverage
| Rule | Enforced at | Test (backend/tests/routes/scoIstDay.test.ts) |
|---|---|---|
| BR-SCO-01 number period = IST month | scoRepository.ts:268-272 (`istMonthKey()`), document-number.ts:14-16 | :467 (31 Mar 23:00 vs 1 Apr 00:30 IST differ) |
| BR-SCO-03 return date 0..365 IST days | scoService.ts:50-65 (`istDaysBetween`) | :429, 434, 439, 445, 450, 455, 460 |
| BR-SCO-09 not future / default today / FY | scoChallanService.ts:30-52, :113-114; FY via existing `financialYearOf` (IST, document-number.ts:55) | :500, 509, 519, 528, 540, 549, 557, 566, 574 |
| BR-SCO-11 due = IST day + 1y; days left | scoChallanService.ts:30-43, scoChallanRepository.ts:33-35 (`due::date - today::date`) | :584, 592, 606, 620, 637 |
| Acceptance bullets 1-6 | as above | each has a named test (02:00 IST 1 Oct, 00:30 IST 1 Apr, 47 days) |
| Acceptance bullet 7 (date picker max/min = IST today) | IssueMaterialDialog.tsx:141, ScoForm.tsx:316, frontend/src/lib/ist-date.ts | none (no frontend test layer); manual checklist only |

Test provenance: brief 01 matches the zero-context template (pointers only). Report 01 has no BRIEF-CONTAMINATION. Assertions trace to spec examples. Two test-writer readings are not stated outright in the spec: a full timestamp counts as the IST day it falls in, and the SCO period is `YYYY-MM` (SPEC-3).

## Findings
| id | severity | area | file:line | finding | suggested fix |
|---|---|---|---|---|---|
| SPEC-1 | major | test | backend/tests/routes/scoChallan.test.ts:764-783 | Existing test asserts the omitted challan date equals the UTC date (`new Date().toISOString().slice(0,10)`). BR-SCO-09 v4: it defaults to the IST "today". Between 18:30 and 24:00 UTC the test fails against correct code (time-of-day flaky). Raised by test-writer (report 01 Q1), still open. | Coordinator records a test change request in findings.md quoting BR-SCO-09 ("it defaults to today ... IST"); brief test-writer to compare with the IST day. Dev agents must not edit it. |
| SPEC-2 | minor | frontend | frontend/src/lib/sco-format.ts:59-66 | `formatScoDate` formats in the browser zone. Challan date, due date and expected return are bare dates (00:00 UTC) or IST-midnight instants; a browser west of UTC shows the day before. Dates note says "whatever clock zone ... the browser runs in". Pickers are fixed, display is not. | Format with `timeZone: "Asia/Kolkata"`. Fine for IST users today. |
| SPEC-3 | minor | spec | docs/specs/subcontracting.md:123, :139 | Status row still says "to change (today = UTC day now)"; changelog line 139 still says "Awaiting re-freeze". BR-SCO-01 does not state the period format. | Coordinator: update the status row; optional one-line clarification via /spec. |
| SPEC-4 | minor | backend | backend/src/service/scoReceiptService.ts:241 | Receipt number `SCO-GRN-<period>` still UTC month; dates note covers "number period". Known and accepted. | Keep the follow-up issue open. |
| SPEC-5 | minor | backend | backend/src/lib/document-number.ts:14 | New optional `periodKey` param on shared `allocateDocumentSequence`; scoRepository.ts edited outside the brief glob. Default keeps PR/PO/GRN unchanged; needed for BR-SCO-01. | None. |

## Beyond-spec check
No new statuses, fields, endpoints, validations or side effects. The receipt dialog's received date now defaults to the IST day and is sent as IST midnight (dates note: "every ... date"); no new future-date rule. Frontend picks the IST day with the same rule as the backend (Intl Asia/Kolkata, en-CA). `istMidnightIso` sends `YYYY-MM-DDT00:00:00+05:30`, which the backend reads as the same IST day. For IST browsers it is the same instant as before.

Tests: not re-run (read-only). Backend-dev reports 1368 pass / 0 fail.
