# Report 16 — spec-reviewer re-review (saved by coordinator)
Verdict: READY. SPEC-1..5 fixed (evidence in agent return). FINDINGS: 0 blocker, 0 major, 2 minor
| SPEC-7 | minor | backend | grnService mapChallanClash | any 23505 during draft edit mapped to challan conflict (only challan index can fire today) | check constraint name, or leave |
| SPEC-8 | minor | backend | grnService applyDraftUpdate | findLineUoms / findByChallan use db, not tx | pass tx |
Unspecced input guards (qty ≤ 1e9, cost ≤ int4, location 404, row-value cap) → add to spec at next change.
