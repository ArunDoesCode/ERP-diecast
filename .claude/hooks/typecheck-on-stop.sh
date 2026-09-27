#!/usr/bin/env bash
# Stop hook — BL-009.
# Typechecks backend/ and/or frontend/ only when that package has uncommitted
# .ts/.tsx changes. On errors, blocks the stop (exit 2) so Claude fixes them.
# Skips when already re-running after a blocked stop, to avoid loops.
set -u

input=$(cat)
[ "$(echo "$input" | jq -r '.stop_hook_active // false')" = "true" ] && exit 0

root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
failed=0
report=""

for pkg in backend frontend; do
  [ -x "$root/$pkg/node_modules/.bin/tsc" ] || continue
  changed=$(git -C "$root" status --porcelain -- "$pkg" | grep -E '\.(ts|tsx)$' || true)
  [ -n "$changed" ] || continue
  if ! out=$(cd "$root/$pkg" && ./node_modules/.bin/tsc --noEmit 2>&1); then
    failed=1
    report+="tsc --noEmit failed in $pkg/:"$'\n'"$(echo "$out" | head -40)"$'\n'
  fi
done

if [ "$failed" -eq 1 ]; then
  printf '%s' "$report" >&2
  exit 2
fi
exit 0
