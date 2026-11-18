#!/usr/bin/env bash
# /watch-prs pre-check: one gh call, no model work when nothing changed.
#   precheck.sh          prints NO_CHANGE (<n> open) and exits 0, or CHANGED + one line per changed PR
#   precheck.sh commit   remember the current snapshot as handled (run at the end of a pass)
# Snapshot: <checkout>/.pipeline/.watch-prs.{new,last} (gitignored).
set -euo pipefail
root=$(git rev-parse --show-toplevel)
dir="$root/.pipeline"
new="$dir/.watch-prs.new"
last="$dir/.watch-prs.last"
mkdir -p "$dir"

if [ "${1:-}" = "commit" ]; then
  [ -f "$new" ] && mv "$new" "$last"
  echo "snapshot saved"
  exit 0
fi

gh pr list --label agent-pipeline --state all --limit 40 \
  --json number,state,updatedAt,headRefName,baseRefName,statusCheckRollup \
  --jq '[.[] | { number, state, updatedAt, base: .baseRefName, head: .headRefName,
                 checks: ([.statusCheckRollup[]? | (.conclusion // .state // .status // "")] | unique | join(",")) }]
        | sort_by(.number) | .[] | "\(.number) \(.state) \(.base) <- \(.head) updated \(.updatedAt) checks [\(.checks)]"' >"$new"

open=$(grep -c ' OPEN ' "$new" || true)
if [ -f "$last" ] && cmp -s "$new" "$last"; then
  echo "NO_CHANGE ($open open agent PRs)"
  exit 0
fi
echo "CHANGED ($open open agent PRs)"
if [ -f "$last" ]; then
  grep -Fxv -f "$last" "$new" || true      # lines that are new or different since the last pass
else
  grep ' OPEN ' "$new" || true             # first pass: old merged PRs are history, not work
fi
