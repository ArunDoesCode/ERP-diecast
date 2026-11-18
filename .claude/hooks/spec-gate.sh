#!/usr/bin/env bash
# PreToolUse (Edit|Write|MultiEdit) hook — plan agentic-workflow-v2, guardrail 1.1.
# Feature code under backend/src/ or frontend/src/ may change only when the active
# pipeline run's module has a frozen spec.
#   active run = newest .pipeline/*/state.json in this worktree; fields `module`, optional `mode`.
#   no run, no `module`, or `mode: "bug"`  -> allow.
#   spec = docs/specs/<module>.md or docs/specs/<module>/spec.md with a `status: frozen` line.
# Mode: SPEC_GATE_MODE=warn (default for now) prints the reason and allows;
#       SPEC_GATE_MODE=deny blocks the tool call (exit 2, reason on stderr).
set -u

mode="${SPEC_GATE_MODE:-warn}"
command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -n "$file" ] || exit 0

# Worktree root: git toplevel of the nearest existing ancestor of the target file.
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)
case "$file" in
  /*) ;;
  *) file="${cwd:-$PWD}/$file" ;;
esac
dir=$(dirname "$file")
while [ ! -d "$dir" ] && [ "$dir" != "/" ]; do dir=$(dirname "$dir"); done
root=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || root="${CLAUDE_PROJECT_DIR:-${cwd:-$PWD}}"

rel="${file#"$root"/}"
case "$rel" in
  backend/src/* | frontend/src/*) ;;
  *) exit 0 ;;
esac

# Newest run state in this worktree.
state=$(ls -t "$root"/.pipeline/*/state.json 2>/dev/null | head -1)
[ -n "$state" ] || exit 0

run_mode=$(jq -r '.mode // empty' "$state" 2>/dev/null)
[ "$run_mode" = "bug" ] && exit 0

module=$(jq -r 'if (.module | type) == "string" then .module else empty end' "$state" 2>/dev/null)
[ -n "$module" ] || exit 0
case "$module" in
  */* | *..*) exit 0 ;;
esac

for spec in "$root/docs/specs/$module.md" "$root/docs/specs/$module/spec.md"; do
  if [ -f "$spec" ] && grep -Eq '^status:[[:space:]]*frozen([[:space:]]|$)' "$spec"; then
    exit 0
  fi
done

reason="spec-gate: $rel blocked - run '$(basename "$(dirname "$state")")' targets module '$module' but docs/specs/$module.md (or docs/specs/$module/spec.md) is not 'status: frozen'. Run /freeze $module, or use /bug (state.json mode: \"bug\")."

if [ "$mode" = "deny" ]; then
  echo "$reason" >&2
  exit 2
fi
echo "[warn only, call allowed] $reason" >&2
exit 0
