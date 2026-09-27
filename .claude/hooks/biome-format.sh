#!/usr/bin/env bash
# PostToolUse (Edit|Write) hook — BL-009.
# Runs `biome check --write` on the edited file with its own package's biome.json
# (backend: spaces, frontend: tabs). Unfixable errors go back to Claude (exit 2)
# so they get fixed right away instead of surfacing at `bun run lint`.
set -u

file=$(jq -r '.tool_response.filePath // .tool_input.file_path // empty')
[ -n "$file" ] || exit 0

case "$file" in
  */node_modules/* | */.contracts/* | */.next/* | */dist/*) exit 0 ;;
esac
case "$file" in
  *.ts | *.tsx | *.js | *.jsx | *.json) ;;
  *) exit 0 ;;
esac

# Package root = nearest backend/ or frontend/ ancestor that has a biome.json.
dir=$(dirname "$file")
pkg=""
while [ "$dir" != "/" ] && [ -n "$dir" ]; do
  case "$(basename "$dir")" in
    backend | frontend)
      if [ -f "$dir/biome.json" ]; then pkg="$dir"; break; fi ;;
  esac
  dir=$(dirname "$dir")
done
[ -n "$pkg" ] || exit 0
[ -x "$pkg/node_modules/.bin/biome" ] || exit 0

if ! out=$(cd "$pkg" && ./node_modules/.bin/biome check --write --no-errors-on-unmatched "$file" 2>&1); then
  echo "biome found errors it could not auto-fix in $file:" >&2
  echo "$out" | tail -40 >&2
  exit 2
fi
exit 0
