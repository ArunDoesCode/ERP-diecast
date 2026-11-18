#!/usr/bin/env bash
# Pipeline run state helper. Schema: .claude/pipeline/state.schema.json. Rules: PROTOCOL.md -> Run state.
#   state.sh now                                        UTC timestamp
#   state.sh init <id> <module> <mode> <branch> <base>  create .pipeline/<id>/state.json (phase preflight);
#                                                       mode = feature | sub | bug | epic (spec-gate.sh reads module + mode)
#   state.sh phase <name>                               close the open phase, open <name>
#   state.sh call <agent> <slice|-> <DONE|BLOCKED|FAILED> <startISO> [tokens]   append one agent call
#   state.sh gates                                      gate table (end of every /feature and /epic turn)
#   state.sh metrics                                    one row per run in every worktree (/status)
#   state.sh line                                       one markdown row for docs/metrics/runs.md (/wrap)
# State file: $STATE, else the newest schema-2 .pipeline/*/state.json in this worktree.
set -euo pipefail
command -v jq >/dev/null 2>&1 || { echo "state.sh: jq is not installed" >&2; exit 1; }

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
root=$(git rev-parse --show-toplevel)
cmd="${1:-gates}"
[ $# -gt 0 ] && shift

runs_in() { # schema-2 state files of one worktree, newest first
  local f
  for f in $(ls -t "$1"/.pipeline/*/state.json 2>/dev/null); do
    [ "$(jq -r '.schema // 0' "$f" 2>/dev/null)" = "2" ] && echo "$f"
  done
  return 0
}
find_state() {
  local f="${STATE:-}"
  [ -n "$f" ] || f=$(runs_in "$root" | head -1)
  [ -n "$f" ] && [ -f "$f" ] || { echo "state.sh: no schema-2 state.json under $root/.pipeline" >&2; exit 1; }
  echo "$f"
}
update() { # update <file> <jq args...>
  local f="$1" tmp
  shift
  tmp=$(mktemp "$f.XXXXXX")
  jq "$@" "$f" >"$tmp" && mv "$tmp" "$f"
}

# jq helpers shared by the read commands
DEFS='
def secs: if . == null then null else (try fromdateiso8601 catch null) end;
def mins(a; b): if (a|secs) == null or (b|secs) == null then null else (((b|secs) - (a|secs)) / 60 | floor) end;
def started: [.phases[]?.start | select(. != null)] | min;
def ended($now): if .phase == "handover" or .phase == "done" then (.phases[.phase].start // $now) else $now end;
def tokens: [.calls[]?.tokens | select(. != null)] | add // 0;
def found: [.findings[]?.found // 0] | add // 0;
def open: [.findings[]?.open // 0] | add // 0;
def g($k): (.gates[$k].status // "pending") as $s | (.gates[$k].note // "") as $n
  | if $n != "" and ($s == "skipped" or $s == "parked" or $s == "red") then "\($s) (\($n))" else $s end;
'

case "$cmd" in
  now) now ;;

  init)
    [ $# -eq 5 ] || { echo "usage: state.sh init <id> <module> <mode> <branch> <base>" >&2; exit 1; }
    case "$3" in feature | sub | bug | epic) ;; *) echo "state.sh: mode must be feature|sub|bug|epic, got $3" >&2; exit 1 ;; esac
    case "$4" in feature/* | epic/*) ;; *) echo "state.sh: branch must be feature/* or epic/*, got $4" >&2; exit 1 ;; esac
    f="$root/.pipeline/$1/state.json"
    [ -e "$f" ] && { echo "state.sh: $f exists - resume, do not init" >&2; exit 1; }
    mkdir -p "$(dirname "$f")"
    jq -n --arg id "$1" --arg module "$2" --arg mode "$3" --arg branch "$4" --arg base "$5" --arg now "$(now)" '
      { schema: 2, id: $id, module: $module, mode: $mode, epic: null, spec: "", branch: $branch, base: $base,
        phase: "preflight", phases: { preflight: { start: $now, end: null, rounds: 1 } },
        slices: [], currentSlice: null, nextSeq: 1, calls: [], fixRounds: 0, fixRoundsTotal: 0, findings: {},
        gates: ([ "typecheck", "lint", "tests", "contract", "standards", "codeReview", "security",
                  "performance", "spec", "design", "screenshots", "ci" ]
                | map({ key: ., value: { status: "pending" } }) | from_entries),
        lastGreen: null, parked: [], failures: [], assumptions: { file: "", confirm: 0, info: 0 }, pr: null }' >"$f"
    echo "$f"
    ;;

  phase)
    [ $# -eq 1 ] || { echo "usage: state.sh phase <preflight|plan|build|review|fix|handover|done>" >&2; exit 1; }
    case "$1" in preflight | plan | build | review | fix | handover | done) ;; *) echo "state.sh: unknown phase $1" >&2; exit 1 ;; esac
    f=$(find_state)
    if [ "$1" = "fix" ] && [ "$(jq -r 'if .phase != "fix" and (.fixRounds // 0) >= 3 then "stop" else "ok" end' "$f")" = "stop" ]; then
      echo "state.sh: fix round 3 is used up - no 4th round. Park the slice (docs/runbooks/park-a-slice.md), set fixRounds to 0." >&2
      exit 1
    fi
    update "$f" --arg p "$1" --arg now "$(now)" '
      (if .phase != $p and .phases[.phase] != null then .phases[.phase].end = $now else . end)
      | .phases[$p] = { start: (.phases[$p].start // $now), end: null,
                        rounds: ((.phases[$p].rounds // 0) + (if .phase == $p then 0 else 1 end) | if . == 0 then 1 else . end) }
      | (if $p == "fix" and .phase != "fix" then .fixRounds += 1 | .fixRoundsTotal = ((.fixRoundsTotal // 0) + 1) else . end)
      | .phase = $p'
    echo "phase: $1"
    ;;

  call)
    [ $# -ge 4 ] || { echo "usage: state.sh call <agent> <slice|-> <DONE|BLOCKED|FAILED> <startISO> [tokens]" >&2; exit 1; }
    f=$(find_state)
    update "$f" --arg agent "$1" --arg slice "$2" --arg result "$3" --arg start "$4" --arg tokens "${5:-}" --arg now "$(now)" '
      .calls += [{ seq: ((.calls | length) + 1), agent: $agent,
                   slice: (if $slice == "-" then null else $slice end),
                   start: $start, end: $now,
                   tokens: (if $tokens == "" then null else ($tokens | tonumber) end), result: $result }]'
    echo "call logged: $1 $3"
    ;;

  gates)
    f=$(find_state)
    jq -r --arg now "$(now)" "$DEFS"'
      "Gate table - run \(.id) (\(.mode), \(.branch))",
      "| | |", "|---|---|",
      "| Phase | \(.phase) - fix round \(.fixRounds)/3 - slice \(.currentSlice // "-") - \(mins(started; $now) // 0) min |",
      "| Checks | typecheck \(g("typecheck")) - lint \(g("lint")) - tests \(g("tests")) - contract \(g("contract")) - standards-check \(g("standards")) - CI \(g("ci")) |",
      "| Reviewers | code \(g("codeReview")) - security \(g("security")) - performance \(g("performance")) - spec \(g("spec")) - design \(g("design")) |",
      "| Screenshots | \(g("screenshots")) |",
      "| PR | \(.pr.url // "none")\(if .pr.merge then " - merge: \(.pr.merge)" else "" end) |",
      "| Parked | \(.parked | length)\(if (.parked | length) > 0 then ": " + ([.parked[] | "\(.slice) -> \(.issue)"] | join(", ")) else "" end) |",
      "| To confirm | \(.assumptions.confirm // 0) assumptions - last green \(.lastGreen // "none") |"' "$f"
    ;;

  metrics)
    echo "| Run | Mode | Phase | Min | Agent calls | Tokens | Fix rounds | Findings (open) | Parked | PR |"
    echo "|---|---|---|---|---|---|---|---|---|---|"
    git worktree list --porcelain | sed -n 's/^worktree //p' | while read -r wt; do
      for f in $(runs_in "$wt"); do
        jq -r --arg now "$(now)" "$DEFS"'
          "| \(.id) | \(.mode) | \(.phase) | \(mins(started; ended($now)) // "-") | \(.calls | length) | \(tokens) | \(.fixRoundsTotal // .fixRounds) | \(found) (\(open)) | \(.parked | length) | \(.pr.url // "-") |"' "$f"
      done
    done
    ;;

  line)
    f=$(find_state)
    base=$(jq -r '.base' "$f")
    range="origin/$base..HEAD"
    git rev-parse -q --verify "origin/$base" >/dev/null 2>&1 || range="$base..HEAD"
    subjects=$(git log --format=%s "$range" 2>/dev/null || true)
    count() { printf '%s\n' "$subjects" | grep -c "^$1" || true; }
    total=$(printf '%s\n' "$subjects" | grep -c . || true)
    jq -r --arg now "$(now)" --arg total "$total" --arg test "$(count 'test(')" \
      --arg chore "$(count 'chore(')" --arg docs "$(count 'docs(')" --arg fix "$(count 'fix(')" "$DEFS"'
      "| \($now[0:10]) | \(.id) | \(.mode) | \(mins(started; ended($now)) // "-") | \(.calls | length) | \(tokens) | \(.fixRoundsTotal // .fixRounds) | \(found) | \(.parked | length) | \(.assumptions.confirm // 0) | \($total) | \($chore)+\($docs) | \($test) | \($fix) | \(.pr.url // "-") |"' "$f"
    ;;

  *) echo "state.sh: unknown command $cmd (now|init|phase|call|gates|metrics|line)" >&2; exit 1 ;;
esac
