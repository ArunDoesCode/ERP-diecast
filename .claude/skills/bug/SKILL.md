---
name: bug
description: >
  Disciplined bug fix: reproduce, map to a business rule (or expose a spec gap), write a failing regression
  test, fix, verify, and log. Works for bugs found in dev and during factory UAT. Use when: /bug <description>,
  "this is broken", "UAT issue", "wrong stock", "wrong total", "404 on …", "page shows wrong data".
---

# /bug <description>

1. **Restate** the bug as: expected vs actual, where (page/endpoint), which role, steps. Ask only for what's
   missing to reproduce. If it came from the factory, add a row to `docs/uat-log.md` now
   (id `UAT-NNN`, date, reporter, severity S1 blocks work / S2 wrong data / S3 annoyance / S4 cosmetic).
2. **Locate** — delegate to `cavecrew-investigator` (package-level) or use codegraph to find the code path.
   Decide the layer: frontend-only, contract mismatch (frontend path/body vs backend route), backend rule,
   or data/seed.
3. **Map to spec** — find the BR in `docs/specs/<module>.md` that this violates.
   - Rule exists → it's a code bug, continue.
   - No rule covers it → it's a **spec gap**. Tell the user, propose the rule, add it via `/freeze`'s
     change-request path (or to the draft spec) before fixing.
4. **Red** — delegate to **test-writer**: a regression test named `BR-<MOD>-NN regression: <short>`
   (or `UAT-NNN`). It must fail before the fix. Frontend-only bugs: describe the manual repro instead.
5. **Fix** — smallest change that makes the test pass (use hono-builder / nextjs-builder for >2 files,
   otherwise fix directly). No refactors, no extra features.
6. **Verify** — the test passes, `bun test` whole suite passes, typecheck + lint clean.
7. **Log** — if this bug pattern could recur (e.g. path param vs body, stale enum after rename), add an entry
   to `frontend/docs/gotchas.md` or `docs/decisions.md`. Update `docs/uat-log.md` row to `fixed` with commit.
   S1/S2 during UAT: fix now. S3/S4 during UAT: log and batch weekly.
