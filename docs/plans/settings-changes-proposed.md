---
title: Proposed changes to .claude/settings.json (not applied)
created: 2026-11-18
status: applied 2026-11-18 (owner approved)
---

# `.claude/settings.json` changes (applied)

Applied on 2026-11-18 after owner approval. Agents do not edit permission settings without it.

## 1. Register the two guardrail hooks (start in warn mode)

```json
"PreToolUse": [{
  "matcher": "Edit|Write|MultiEdit",
  "hooks": [
    {"type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/spec-gate.sh", "timeout": 10, "statusMessage": "spec gate"},
    {"type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/test-ownership.sh", "timeout": 10, "statusMessage": "test ownership"}
  ]
}]
```

After the pilot run, switch to blocking with env `SPEC_GATE_MODE=deny` and `TEST_OWNERSHIP_MODE=deny`.

## 2. Allow (needed so an unattended run does not stop on a prompt)

| Rule | Needed for |
|---|---|
| `Bash(.claude/pipeline/state.sh *)` | run state and gate table |
| `Bash(.claude/skills/watch-prs/precheck.sh*)` | cheap PR pre-check |
| `Bash(.claude/pipeline/merge-sub-pr.sh *)` | auto-merge of a sub-feature PR into `epic/*` only (decision D3). The script refuses any other base, so the `gh pr merge` deny stays |
| `Bash(gh issue create *)`, `Bash(gh issue list *)`, `Bash(gh issue view *)` | parking a slice |
| `Bash(git revert *)` | parking a slice |
| `Bash(codegraph sync*)`, `Bash(codegraph init*)`, `Bash(codegraph explore*)` | code lookup |
| `Bash(bun --env-file=* run *)`, `Bash(bun --env-file=* test*)` | tests against `diecast_test` |
| `Bash(jq *)` | state.json reads |

## 3. Remove from allow (too wide)

| Rule | Why |
|---|---|
| `Bash(git push)` (bare) | can push the current branch anywhere; the `feature/*` and `epic/*` rules cover the pipeline |
| `Bash(bunx drizzle-kit push*)` | removed from the workflow; bypasses migrations |
| `Bash(psql *)` | lets an agent run any SQL on the dev DB |

## 4. Add to deny (protect data)

| Rule | Why |
|---|---|
| `Bash(*db:reset*)` | `db:reset` targets the dev DB unless `DATABASE_URL` is overridden; use the wrapper script when it exists |
| `Bash(docker volume rm*)` | deletes DB volumes |
| `Bash(git worktree remove --force*)` | can discard uncommitted work |

Considered and left out: deny on `git checkout -- *` and `git restore *` (the park procedure and
normal fixes need them).

## 5. Owner-only (user settings, not this file)

`permissions.defaultMode: "auto"` in `~/.claude/settings.json` — project settings ignore it.
