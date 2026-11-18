#!/usr/bin/env bash
# PreToolUse (Edit|Write|MultiEdit) hook — plan agentic-workflow-v2, guardrail 1.2.
# Test files (backend/tests/**, frontend/e2e/**) may be written only by the test-writer agent.
# Agent identity = the documented common hook input field `agent_type` (present when the hook
# fires inside a subagent or the session runs with --agent; absent in the main session).
# https://code.claude.com/docs/en/hooks -> "Common input fields".
# Mode: TEST_OWNERSHIP_MODE=warn (default for now) prints the reason and allows;
#       TEST_OWNERSHIP_MODE=deny blocks the tool call (exit 2, reason on stderr).
set -u

mode="${TEST_OWNERSHIP_MODE:-warn}"
command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -n "$file" ] || exit 0

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
  backend/tests/* | frontend/e2e/*) ;;
  *) exit 0 ;;
esac

agent=$(printf '%s' "$input" | jq -r '.agent_type // empty' 2>/dev/null)
[ "$agent" = "test-writer" ] && exit 0

reason="test-ownership: $rel blocked - test files are written only by the test-writer agent (this call: agent_type='${agent:-main session}'). Brief test-writer instead (PROTOCOL.md -> Test independence)."

if [ "$mode" = "deny" ]; then
  echo "$reason" >&2
  exit 2
fi
echo "[warn only, call allowed] $reason" >&2
exit 0
