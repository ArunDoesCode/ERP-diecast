---
name: bug
description: >
  Disciplined bug fix: reproduce, map to a business rule (or expose a spec gap), write a failing regression
  test, fix, verify, and log. Works for bugs found in dev and during factory UAT. Use when: /bug <description>,
  "this is broken", "UAT issue", "wrong stock", "wrong total", "404 on …", "page shows wrong data".
---

# /bug <description>

Never-wait policy and hard stops: `.claude/pipeline/PROTOCOL.md`. Ask the owner only in step 1.

1. **Restate** the bug: expected vs actual, where (page/endpoint), which role, steps. Ask only for what is
   missing to reproduce. From the factory → open an issue now (`gh issue create --label uat-bug --label
   defect --label P<n> --label mod:<module>`; S1 blocks work / S2 wrong data → P1/P2, S3/S4 → P3).
2. **Run** — commits go on `feature/bug-<issue or short name>` in its own worktree; found inside an active
   run → that run's branch and state. Else `.claude/pipeline/state.sh init bug-<x> <module> bug
   feature/bug-<x> main` (`mode: bug` lets the spec-gate hook pass for modules without a frozen spec).
3. **Locate** — **explorer**, or one `codegraph_explore` yourself (PROTOCOL → Code lookup). Decide the
   layer: frontend-only, contract mismatch, backend rule, or data/seed.
4. **Map to spec** — find the BR this violates (PROTOCOL → Spec paths).
   - Rule exists → code bug, continue.
   - No rule → **spec gap**. Do not wait:
     [spec-gap-mid-build](../../../docs/runbooks/spec-gap-mid-build.md) — spawn **researcher** for the
     benchmark, add the rule to the spec changelog, log the assumption (`confirm` if it touches money,
     stock, permissions or what a factory user sees). Invariant conflict → hard stop.
5. **Red** — **test-writer** (`subagent_type: test-writer`, never a fork), zero-context brief template
   from PROTOCOL, mode `regression`: spec path, BR id, the issue number. Do **not** pass what you found
   in step 3 — no suspected cause, file names or fix ideas. Test named `BR-<MOD>-NN regression: <short>`
   (or `UAT-NNN`); it must fail before the fix. Commit alone as `test(bug): …`. Frontend-only bug:
   test-writer writes the manual repro steps instead.
6. **Fix** — smallest change that makes the test pass: backend-dev / frontend-dev (they run only the
   regression test file + typecheck + lint), or yourself for a 1–2 line fix. Never edit the regression test while fixing; if it looks
   wrong, back to step 4. Commit `fix(bug): …`, no test files, no refactors, no extras.
7. **Verify** — **test-runner** once (full checks). Red →
   [ci-red](../../../docs/runbooks/ci-red.md). Still red after 2 fixes → revert the fix commit, put
   the evidence on the issue, hand over ([park-a-slice](../../../docs/runbooks/park-a-slice.md)).
8. **Log** — a pattern that could recur → module map gotchas or `docs/decisions.md`.
9. **Ship** — push and open the PR without asking (label `agent-pipeline`, `Closes #NN`, body from
   `.claude/pipeline/templates/PR_BODY.md`, cut to: what was wrong · the rule · the fix · assumptions to
   confirm · how to try). The owner merges. Never `main`.
   UAT: S1/S2 fix now; S3/S4 log and batch weekly.
