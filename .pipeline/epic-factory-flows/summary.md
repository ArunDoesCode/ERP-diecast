# Run record — epic-factory-flows (2026-11-20 → 2026-11-21)

- Spec: docs/specs/factory-flows/spec.md v1 (frozen 2026-11-20 on the owner's relayed pre-approval, D-040). 102 rules, 70 edge cases, 91 assumptions.
- Branch: `epic/factory-flows` from `origin/epic/design-system-v2` + `spec/factory-flows`; one PR into main (A-84, D-041).
- Split: 9 sub-features (shell, panel, pages, actions, receiving, approvals, lists, home-counts, home), all built.
- Agents: ~65 calls (explorer, backend-dev ×9, frontend-dev ×13, test-writer ×12, reviewers ×12, test-runner ×4, design-reviewer ×1).
- Fix rounds: 3 review/fix rounds + 1 UI-only design pass.
- Findings: 17 test-side (TEST-*), 12 CR, 2 SEC (1 fixed, 1 rejected by BR-FF-94), 6 PERF (2 backlog), 11 SPEC, 10 DES (9 fixed, 1 rejected by BR-PO-01).
- Final gates: backend 1989/1989; typecheck, lint, contract, build, integrity green; e2e 88/10/4 → 7 specs parked (#114).
- Backlog: #115 (Home polling), #116 (small follow-ups).
- Lessons: commits during a live e2e run invalidate it (keep the tree quiet); stale `landing` assertions were spread over backend tests and e2e helpers; `::date` on timestamp columns breaks IST-day rules — use day-start instants.
