---
name: map
description: >
  Create or refresh a module's as-built map (docs/modules/<module>.md) so agents don't re-explore the
  codebase. Incremental: reads only code changed since the map's last_verified_commit. Use when:
  /map <module>, /map --stale, "document this module", "update the module map", new module, map is stale.
model: sonnet
---

# /map <module> | /map --stale

## New map
1. Spawn **explorer** (Haiku) with a brief: produce the content for every section of
   `docs/modules/_template.md` for `<module>` (codegraph first, symbol names, no line numbers).
2. Write `docs/modules/<module>.md` from the template with `last_verified_commit: <git rev-parse --short HEAD>`.
3. Add the module row to `docs/STATUS.md`.

## Refresh (`/map <module>` on an existing map, or every stale map with `--stale`)
1. `sha` = map's `last_verified_commit`. Paths = everything in its **Code locations** table.
2. `git diff --stat <sha>..HEAD -- <paths>` plus `git log --oneline <sha>..HEAD -- <paths>`.
   - Nothing changed → only bump `last_verified_on`; done.
   - Changes → spawn **explorer** with **only** the changed files + the current map; ask for a list of
     section edits (added/removed files, endpoints, statuses, flows, gotchas). Also check for new files in
     the module's directories that the map doesn't list.
3. Apply edits, add a History row (commit range + one line), set `last_verified_commit` to HEAD.
4. If the map passes ~250 lines, propose splitting it into `docs/modules/<module>/<area>.md` + index.

Never describe intended behaviour here (that's the spec); only what the code does. Contradictions between
map and spec → add a line under **Known gaps / debt** and a GitHub issue.
