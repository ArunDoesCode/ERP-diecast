# Report 11 — spec-reviewer (saved by coordinator; agent has no write tool)
Gate: both specs frozen v1. Coverage: all 31 BR-GRN ids named in tests. Contract: frontend matches contract.md.
FINDINGS: 0 blocker, 3 major, 3 minor. Verdict: NOT READY.

| id | sev | file:line | finding | fix |
|---|---|---|---|---|
| SPEC-1 | major | stockPostingRepository.ts:121 | BR-GRN-39: correction can write a negative average (guard only checks newMilli > 0; stock summed across locations) | keep old average if candidate < 0 |
| SPEC-2 | major | grnService.ts:237-296 | BR-GRN-05: `update()` has no challan clash check → raw 500 on unique index; contract promises 409 | findByChallan (excluding own id) + 23505 → ConflictError |
| SPEC-3 | major | grnService.ts:281-296 | BR-GRN-22/06: draft update header + lines not in one tx; status read without lock | withTransaction + re-check draft under row lock |
| SPEC-4 | minor | grnService.ts:509 | stale "slice S4" comment | delete |
| SPEC-5 | minor | backend/src | no BR id comments for BR-GRN-04, 06, 12, 13, 25, 27, 39 at enforcement lines | add BR comments |
| SPEC-6 | minor | assetRepository.ts:451-468 | `opening_stock` accepted as stock-out; spec: "opening stock goes in … qty and rate" | reject negative opening_stock |

Test run not done by reviewer (no env); test-runner covers it.
