#!/usr/bin/env bash
# PreToolUse (Edit|Write|MultiEdit) hook — plan agentic-workflow-v2, guardrail 1.2.
# Test files (backend/tests/**, frontend/e2e/**) may be written only by the test-writer agent.
# Agent identity = the documented common hook input field `agent_type` (present when the hook
# fires inside a subagent or the session runs with --agent; absent in the main session).
# https://code.claude.com/docs/en/hooks -> "Common input fields".
# Mode: default deny. TEST_OWNERSHIP_MODE=warn prints the reason and allows;
#       deny blocks the tool call (exit 2, reason on stderr). Deny mode fails closed when jq is
#       missing or the input is unreadable. Paths are realpath-resolved (symlinks, `..`) before matching.
set -u

mode="${TEST_OWNERSHIP_MODE:-deny}"
name="test-ownership"

# Resolve a path physically: symlinks and `..` normalised; the tail may not exist yet.
resolve_path() {
  local p="$1" tail="" base d t n=0 out
  while [ ! -e "$p" ] && [ ! -L "$p" ] && [ "$p" != "/" ]; do
    tail="/$(basename "$p")$tail"
    p=$(dirname "$p")
  done
  if [ -d "$p" ] && [ ! -L "$p" ]; then
    out=$(cd -P "$p" 2>/dev/null && pwd -P) || return 1
  else
    d=$(cd -P "$(dirname "$p")" 2>/dev/null && pwd -P) || return 1
    base=$(basename "$p")
    while [ -L "$d/$base" ] && [ "$n" -lt 40 ]; do
      n=$((n + 1))
      t=$(readlink "$d/$base") || return 1
      case "$t" in /*) ;; *) t="$d/$t" ;; esac
      if [ -d "$t" ] && [ ! -L "$t" ]; then
        d=$(cd -P "$t" 2>/dev/null && pwd -P) || return 1
        base=""
        break
      fi
      d=$(cd -P "$(dirname "$t")" 2>/dev/null && pwd -P) || return 1
      base=$(basename "$t")
    done
    [ "$n" -lt 40 ] || return 1
    out="$d${base:+/$base}"
  fi
  out="${out%/}$tail"
  # Collapse any `.` / `..` left in the not-yet-existing tail.
  local IFS=/ seg stack=() 
  for seg in $out; do
    case "$seg" in
      "" | .) ;;
      ..) [ "${#stack[@]}" -gt 0 ] && unset 'stack[${#stack[@]}-1]' ;;
      *) stack+=("$seg") ;;
    esac
  done
  printf '/%s' "${stack[@]+"${stack[@]}"}" | sed 's#^/$#/#'
  [ "${#stack[@]}" -gt 0 ] || printf '\n'
}

block() { # $1 = reason; deny mode blocks (exit 2), warn mode allows
  if [ "$mode" = "deny" ]; then
    echo "$1" >&2
    exit 2
  fi
  echo "[warn only, call allowed] $1" >&2
  exit 0
}

command -v jq >/dev/null 2>&1 || block "$name: jq is not installed, cannot check this call (fail closed). Install jq."

input=$(cat) || input=""
printf '%s' "$input" | jq -e 'type == "object"' >/dev/null 2>&1 || block "$name: hook input is empty or not valid JSON (fail closed)."
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -n "$file" ] || exit 0

cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)
case "$file" in
  /*) ;;
  *) file="${cwd:-$PWD}/$file" ;;
esac
file=$(resolve_path "$file") || block "$name: cannot resolve path '$file' (fail closed)."
dir=$(dirname "$file")
while [ ! -d "$dir" ] && [ "$dir" != "/" ]; do dir=$(dirname "$dir"); done
root=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || root="${CLAUDE_PROJECT_DIR:-${cwd:-$PWD}}"
root=$(resolve_path "$root") || root="${root%/}"

rel="${file#"$root"/}"
# macOS is case-insensitive: match on a lowercased copy (tr, bash 3.2), report the real path.
rel_lc=$(printf '%s' "$rel" | tr '[:upper:]' '[:lower:]')
case "$rel_lc" in
  backend/tests/* | frontend/e2e/*) ;;
  *) exit 0 ;;
esac

agent=$(printf '%s' "$input" | jq -r '.agent_type // empty' 2>/dev/null)
[ "$agent" = "test-writer" ] && exit 0

reason="test-ownership: $rel blocked - test files are written only by the test-writer agent (this call: agent_type='${agent:-main session}'). Brief test-writer instead (PROTOCOL.md -> Test independence)."

block "$reason"
