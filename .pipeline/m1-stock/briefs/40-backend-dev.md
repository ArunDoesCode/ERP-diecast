# Brief 40 — backend-dev — supplier review minors
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/suppliers.md (v1)
BR scope: BR-SUP-01, 14, 21, 22, 23 (fix side)
## Task
Fix (details in reports/39-*.md): PERF-40 (batch edit locks target rows ordered by id, response order kept),
SEC-40 (`.max()`: name 200, email 254, phone 30, contact 200, address 500, supplierSku 100), SEC-41 (qty ≤ 1e9),
CR-40 (blank supplierSku → null on create-with-items), CR-41 (escapeLike in item/service list search),
CR-42 (delete the dead repository methods and schemas; keep what is still used).
## Scope (required — every line filled)
- In: those six
- Out: tests (never edit), frontend, anything else
- May edit: backend/src/** except *.test.ts, backend/.contracts/**        May read: anything
- Size: ≤ 4 files, ≤ 200 changed lines
- Stop if: needs anything else → BLOCKED
## Done when
- full `bun test` green; typecheck + lint no new warnings; contract:check clean (regenerate if limits changed)
Write your report to: .pipeline/m1-stock/reports/40-backend-dev.md
