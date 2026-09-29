# Report 16 — code-reviewer re-review (saved by coordinator)
CR-1a, CR-1b, CR-2, CR-3, CR-4, CR-5 fixed. FINDINGS: 0 blocker, 0 major, 2 minor
| CR-7 | minor | frontend | lib/grn-units.ts:2 | whole-number unit list duplicated from backend, no check | backlog: expose from backend or contract test |
| CR-8 | minor | frontend | lib/api/grn/queries.ts:237 usePoItemUoms | new Map every render | useMemo if it lands in deps |
