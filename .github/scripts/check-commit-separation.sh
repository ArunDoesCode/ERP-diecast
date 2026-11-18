#!/usr/bin/env bash
# Test independence, checked mechanically (plan agentic-workflow-v2, guardrail 1.2):
# no single commit may touch both test files (backend/tests/**, frontend/e2e/**) and
# non-test source files (other code under backend/ or frontend/).
#
#   check-commit-separation.sh <base> <head> [--strict]
# Report mode (default) prints the mixed commits and exits 0.
# --strict or STANDARDS_STRICT=1 exits 1 when one is found.
set -u

base="${1:?usage: check-commit-separation.sh <base> <head> [--strict]}"
head="${2:?usage: check-commit-separation.sh <base> <head> [--strict]}"
strict="${STANDARDS_STRICT:-0}"
[ "${3:-}" = "--strict" ] && strict=1

if ! revs=$(git rev-list --no-merges "$base..$head" 2>/dev/null); then
  echo "commit-separation: cannot read commit range $base..$head (shallow clone or unknown ref)."
  [ "$strict" = "1" ] && exit 1
  exit 0
fi

bad=0
total=0
for sha in $revs; do
  total=$((total + 1))
  files=$(git diff-tree --no-commit-id --name-only -r "$sha")
  tests=$(printf '%s\n' "$files" | grep -E '^(backend/tests|frontend/e2e)/' || true)
  source=$(printf '%s\n' "$files" |
    grep -E '^(backend|frontend)/' |
    grep -Ev '^(backend/tests|frontend/e2e)/' |
    grep -Ev '\.(test|spec)\.[a-z]+$' |
    grep -E '\.(ts|tsx|js|jsx|mjs|cjs|sql|css)$' || true)
  if [ -n "$tests" ] && [ -n "$source" ]; then
    bad=$((bad + 1))
    echo "commit-separation $(git log -1 --format='%h %s' "$sha")"
    echo "  tests:  $(printf '%s\n' "$tests" | head -3 | tr '\n' ' ')"
    echo "  source: $(printf '%s\n' "$source" | head -3 | tr '\n' ' ')"
  fi
done

echo "commit-separation: $bad of $total commit(s) touch both tests and non-test source."
if [ "$bad" -gt 0 ] && [ "$strict" = "1" ]; then
  echo "Split them: tests go in their own test(...) commit (PROTOCOL.md -> Test independence)."
  exit 1
fi
exit 0
