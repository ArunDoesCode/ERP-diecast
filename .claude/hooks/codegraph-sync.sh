#!/usr/bin/env bash
# SessionStart hook — keeps this worktree's CodeGraph index (.codegraph/, gitignored) ready.
# Missing -> build it in the background (session opens at once; agents use Read/Grep until it is done).
# Present -> incremental sync (seconds). Never blocks or fails a session.
set -u

command -v codegraph >/dev/null 2>&1 || exit 0
root="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$root" 2>/dev/null || exit 0

if [ -d .codegraph ]; then
  codegraph sync >/dev/null 2>&1 || true
else
  nohup codegraph init -i >/tmp/codegraph-init.$$.log 2>&1 &
fi
exit 0
