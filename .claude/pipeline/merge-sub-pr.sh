#!/usr/bin/env bash
# Merge ONE sub-feature PR into its epic branch (owner decision D3). Refuses everything else.
#   merge-sub-pr.sh <pr-number>
# Passes only when: base branch is epic/*, head is feature/*, label agent-pipeline is set,
# the PR is open and not a draft, and every check is green right now.
# Exit: 0 merged or auto-merge set · 2 refused (reason printed) · 1 gh failed.
# Not on the allow list by default: the owner adds `Bash(.claude/pipeline/merge-sub-pr.sh *)`.
set -euo pipefail

n="${1:-}"
case "$n" in '' | *[!0-9]*) echo "usage: merge-sub-pr.sh <pr-number>" >&2; exit 2 ;; esac

info=$(gh pr view "$n" --json baseRefName,headRefName,state,isDraft,labels)
base=$(printf '%s' "$info" | jq -r '.baseRefName')
head=$(printf '%s' "$info" | jq -r '.headRefName')
state=$(printf '%s' "$info" | jq -r '.state')
draft=$(printf '%s' "$info" | jq -r '.isDraft')
label=$(printf '%s' "$info" | jq -r '[.labels[].name] | index("agent-pipeline") != null')

refuse() { echo "merge-sub-pr: refused - $1 (PR #$n, base $base). The owner merges this one." >&2; exit 2; }
case "$base" in epic/*) ;; *) refuse "base is not an epic branch" ;; esac
case "$head" in feature/*) ;; *) refuse "head is not a feature branch" ;; esac
[ "$state" = "OPEN" ] || refuse "PR is $state"
[ "$draft" = "false" ] || refuse "PR is a draft"
[ "$label" = "true" ] || refuse "label agent-pipeline is missing"
gh pr checks "$n" >/dev/null 2>&1 || refuse "checks are not all green (or none have run)"

# --auto: merges now if nothing else is required, else when branch protection is satisfied.
# --merge keeps the separate test(...) and feat(...) commits (Test independence).
gh pr merge "$n" --merge --auto
echo "merge-sub-pr: PR #$n -> $base merged or auto-merge set."
