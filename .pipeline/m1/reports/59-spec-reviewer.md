# 59 — spec-reviewer — procurement (saved by coordinator)

Verdict NOT READY: 1 blocker, 3 major, 6 minor. Tests 782 pass / 2 fail (standard rate — other branch; BR-AUTH-11 token.ts — S7). contract:check clean (94 routes). Every BR in known-defects, PR, approval, approval-policies, PO has a named test except the frontend-only ones below and the expected-missing items (BR-PO-10, BR-PR-14, SCO amount, S7).

| # | sev | where | finding | fix |
|---|---|---|---|---|
| SPEC-P1 | blocker | approvalService.ts:597-660, approval.types.ts:337-344 | approval action `cancel` exists in no spec; on a PR it bypasses BR-PR-39/41/46/36 | remove it; doc cancel only via the owning module (BR-APR-48) |
| SPEC-P2 | major | PurchaseOrderTrackingCards.tsx:126-128 | cancel dialog says lines return to pending; spec: PR lines cancelled | fix wording |
| SPEC-P3 | major | frontend | BR-APR-57..60, UI half of BR-PR-39, BR-KD-16 untested (no frontend test runner) | list as scenario-test / manual checklist items |
| SPEC-P4 | major | approvalRepository.ts:177 | isSaleOrderLinked still returned (BR-APR-15) | drop from columns + response schemas |
| SPEC-P5 | minor | poService confirmSupplier | free-text method → silent in_person | channel enum |
| SPEC-P6 | minor | poService / prService codes | undocumented error codes | spec changelog |
| SPEC-P7 | minor | frontend cancelPurchaseOrder | reason optional in type; backend requires it | required |
| SPEC-P8 | minor | reports 50/51/54 | no BRIEF-CONTAMINATION line; briefs not saved as files | note: briefs live in the coordinator's agent calls (pointer-only template) |
| SPEC-P9 | minor | poRepository cancel/close/order PR lines | BR-PR-46 met via the PO record, not the PR line | confirm intent (spec note) |
| SPEC-P10 | minor | assetRepository.getLastRate | no active-price-list check, no standard-rate fallback | recheck after merge |
