# 57 — security-auditor — procurement (saved by coordinator)

0 blocker, 0 major, 4 minor. Checked clean: route keys, requester-only PR rules under lock, approver eligibility, self-approval (intended, BR-APR-33), approval reads, submit re-read + server amount, money (qty server-side, rate ≥1, GST schema, totals recomputed), no raw SQL, audit trails, db:reset secrets + remote guard, bootstrap-admin lock/no password output.

| id | sev | where | finding | fix |
|---|---|---|---|---|
| SEC-P1 | minor | scripts/db-reset.ts guard | hostname-only "local" check; SSH tunnel to prod on localhost passes | also require DB_RESET_CONFIRM for db names other than diecast / *_test, or for a non-default local port |
| SEC-P2 | minor | scripts/bootstrap-admin.ts, db:reset admin step | 8-char min; env var; remote reset gives super-admin the shared seed password | keep spec min; print "rotate the seed admin password" after a remote reset |
| SEC-P3 | minor | approvalService.submitRequest | only checks createdBy, not the doc-type key | require pr.manage / po.manage (sco.manage) at submit |
| SEC-P4 | minor | types/pr.types.ts notes; prService saleOrderId | notes no max; saleOrderId not checked → FK 500 | notes .max(2000); look up sale order → 400 |
