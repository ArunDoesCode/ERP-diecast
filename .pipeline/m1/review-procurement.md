# Review scope — known-defects, purchase-requisition, approval(+policies), purchase-order

Specs (frozen): docs/specs/known-defects.md v2, purchase-requisition.md v1, approval.md v1, approval-policies.md v1, purchase-order.md v1 (+ auth-setup.md v9 for permission use).
Contract: .pipeline/m1/contract.md (sections PR-S1, PR-S2, APR / PO, PO-S1/S2 as built).
Diff: `git diff e4e94db~1..HEAD -- backend/src backend/scripts frontend/src` minus the auth-review fix commits 990441d and 4d578b6 (already reviewed). Key commits: e4e94db (bootstrap-admin), 24c5dd9 (db:reset), acd5c37 + 2208a02 (PR cancel), 93164dc + 0ceb994 (PR create/edit/submit/withdraw), 966f37d + UI (approval), a05dcff + c5518a5 + b495d91 (PO).
Not in scope: GRN / inventory / suppliers / subcontracting (other branch), S7 cleanup (Role union, requireRole, role_pages), BR-PO-10 receipt status, BR-PR-14 standard rate (both wait for the other branch).
Env: .pipeline/m1/ENV.md
