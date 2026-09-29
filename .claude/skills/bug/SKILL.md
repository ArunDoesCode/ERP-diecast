---
name: bug
description: >
  Disciplined bug fix: reproduce, map to a business rule (or expose a spec gap), write a failing regression
  test, fix, verify, and log. Works for bugs found in dev and during factory UAT. Use when: /bug <description>,
  "this is broken", "UAT issue", "wrong stock", "wrong total", "404 on …", "page shows wrong data".
---

# /bug <description>

1. **Restate** the bug as: expected vs actual, where (page/endpoint), which role, steps. Ask only for what's
   missing to reproduce. If it came from the factory, open a GitHub issue now (`gh issue create --label uat-bug --label defect --label P<n> --label mod:<module>`; severity S1/S2 → P1/P2)
   (id `UAT-NNN`, date, reporter, severity S1 blocks work / S2 wrong data / S3 annoyance / S4 cosmetic).
2. **Locate** — delegate to `cavecrew-investigator` (package-level) or use codegraph to find the code path.
   Decide the layer: frontend-only, contract mismatch (frontend path/body vs backend route), backend rule,
   or data/seed.
3. **Map to spec** — find the BR in `docs/specs/<module>.md` that this violates.
   - Rule exists → it's a code bug, continue.
   - No rule covers it → it's a **spec gap**. Tell the user, propose the rule, add it via `/freeze`'s
     change-request path (or to the draft spec) before fixing.
4. **Red** — delegate to **test-writer** (`subagent_type: test-writer`, never a fork) using the
   **zero-context brief template** in `.claude/pipeline/PROTOCOL.md`, mode `regression`: spec path, BR id,
   and the bug's issue number (the reporter's expected-vs-actual). Do **not** pass what you found
   while locating the code in step 2 — no suspected cause, file names or fix ideas. Test named
   `BR-<MOD>-NN regression: <short>` (or `UAT-NNN`); it must fail before the fix. Commit it alone as
   `test(bug): …`. Frontend-only bugs: test-writer writes the manual repro steps instead.
5. **Fix** — smallest change that makes the test pass (backend-dev / frontend-dev, or directly for a
   1–2 line fix). Never edit the regression test while fixing; if it looks wrong, go back to step 3 and
   check the spec. Commit as `fix(bug): …` with no test files. No refactors, no extra features.
6. **Verify** — the test passes, `bun test` whole suite passes, typecheck + lint clean.
7. **Log** — if this bug pattern could recur (e.g. path param vs body, stale enum after rename), add an entry
   to `frontend/docs/gotchas.md` or `docs/decisions.md`. Put `Closes #NN` in the fix PR body so the issue closes on merge.
   S1/S2 during UAT: fix now. S3/S4 during UAT: log and batch weekly.
8. **Ship with the batch** — all commits go on the working branch (root `CLAUDE.md` → Git). No new branch,
   no push, no PR for one bug; it goes out in the next batch PR (push earlier only for S1 when the user asks).
