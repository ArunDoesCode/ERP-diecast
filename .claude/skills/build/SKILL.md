---
name: build
description: >
  Start an unattended build of a frozen spec. Checks the freeze, then prints the two lines the owner runs:
  a /goal condition that keeps the session going until hand-over, and the /feature command. Does nothing
  else. Use when: /build <module>, "build it", "start the build", right after /freeze.
model: haiku
---

# /build <module>

Read-only. Do not start the build yourself, do not explore, do not explain.

## 1. Check the freeze
The spec is `docs/specs/<module>/spec.md` (new layout; `OWNER.md` must exist next to it) or
`docs/specs/<module>.md` (old layout).
```bash
grep -m1 -E '^status:' docs/specs/<module>/spec.md docs/specs/<module>.md 2>/dev/null
```
- No file → reply only: `No spec for <module>. Run /spec <module>.`
- Status is not `frozen` → reply only: `Spec <module> is <status>, not frozen. Run /freeze <module>.`
- Any spec named in its `depends_on` is not frozen → reply only: `<other> is not frozen. Run /freeze <other>.`

## 2. Print the two lines
Reply with exactly this (module name filled in), nothing before or after:

````
Run these two lines, one after the other:

```
/goal The /feature <module> run has reached phase "handover": every gate in the printed gate table is green, or skipped with a reason, or the slice is listed as parked with an issue link; a PR is open; and HANDOVER.md is written. Or stop after 40 turns.
```
```
/feature <module>
```
````
