#!/usr/bin/env bash
# PreToolUse (Edit|Write|MultiEdit) hook — plan agentic-workflow-v2, guardrail 1.1.
# Feature code under backend/src/ or frontend/src/ may change only when the active
# pipeline run's module has a frozen spec.
#   active run = newest .pipeline/*/state.json with `"schema": 2` in this worktree (written by
#   .claude/pipeline/state.sh init; older tracked run folders are ignored). Fields read: `module`,
#   `mode` (feature | sub | bug | epic).
#   no run, no `module`, or `mode: "bug"`  -> allow.
#   spec = docs/specs/<module>.md or docs/specs/<module>/spec.md with a `status: frozen` line.
# Mode: default deny. SPEC_GATE_MODE=warn prints the reason and allows;
#       deny blocks the tool call (exit 2, reason on stderr). Deny mode fails closed when jq is
#       missing or the input is unreadable. Paths are realpath-resolved (symlinks, `..`) before matching.
set -u

mode="${SPEC_GATE_MODE:-deny}"
name="spec-gate"

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
case "$rel" in
  backend/src/* | frontend/src/*) ;;
  *) exit 0 ;;
esac

# Newest schema-2 run state in this worktree (same rule as state.sh).
state=""
for f in $(ls -t "$root"/.pipeline/*/state.json 2>/dev/null); do
  if [ "$(jq -r '.schema // 0' "$f" 2>/dev/null)" = "2" ]; then
    state="$f"
    break
  fi
done
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

block "$reason"
