#!/usr/bin/env bash
# Get a fresh worktree ready to run checks and tests (#26). Run from anywhere inside the worktree:
#   ./scripts/worktree-setup.sh
#
#   1. backend/.env: if missing here, symlink it from the main checkout (when the main checkout has one).
#   2. bun install in backend/ and frontend/ (lockfile only, nothing upgraded).
#   3. bun run db:test:prepare, only when DATABASE_URL_TEST is set and its port answers.
#
# Idempotent: safe to run again; an existing backend/.env is never touched. Never prints a secret.
# Never touches the dev database (db:test:prepare refuses anything but a local *_test DB).
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
ok() { printf '  ok    %s\n' "$1"; }
skip() { printf '  skip  %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; FAILED=1; }
FAILED=0

echo "worktree-setup: $ROOT"

# --- 1. backend/.env -------------------------------------------------------------------------
# The main checkout is the first entry of `git worktree list`.
MAIN="$(git -C "$ROOT" worktree list --porcelain 2>/dev/null | awk '/^worktree /{print substr($0, 10); exit}')"
if [ -e "$BACKEND/.env" ]; then
  ok "backend/.env already present (left as is)"
elif [ -n "$MAIN" ] && [ "$MAIN" != "$ROOT" ] && [ -f "$MAIN/backend/.env" ]; then
  ln -s "$MAIN/backend/.env" "$BACKEND/.env" && ok "backend/.env -> $MAIN/backend/.env (symlink)" \
    || fail "could not link backend/.env"
else
  skip "no backend/.env in the main checkout; export the env by hand (see backend/.env.example)"
fi

# --- 2. dependencies -------------------------------------------------------------------------
for dir in "$BACKEND" "$FRONTEND"; do
  name="$(basename "$dir")"
  if (cd "$dir" && bun install --frozen-lockfile >/dev/null 2>&1 || bun install >/dev/null 2>&1); then
    ok "$name: bun install"
  else
    fail "$name: bun install (run it by hand to see the error)"
  fi
done

# --- 3. test database ------------------------------------------------------------------------
# Read DATABASE_URL_TEST from the shell, else from backend/.env (the value is never printed).
TEST_URL="${DATABASE_URL_TEST:-}"
if [ -z "$TEST_URL" ] && [ -f "$BACKEND/.env" ]; then
  TEST_URL="$(grep -E '^DATABASE_URL_TEST=' "$BACKEND/.env" | tail -n 1 | cut -d= -f2- | tr -d "\"'")"
fi
if [ -z "$TEST_URL" ]; then
  skip "db:test:prepare (DATABASE_URL_TEST not set)"
else
  HOSTPORT="$(TEST_URL="$TEST_URL" bun -e 'const u = new URL(process.env.TEST_URL); console.log(`${u.hostname.replace(/^\[(.*)\]$/, "$1") || "localhost"} ${u.port || 5432}`)' 2>/dev/null)"
  HOST="${HOSTPORT% *}"
  PORT="${HOSTPORT#* }"
  if [ -n "$HOSTPORT" ] && nc -z "$HOST" "$PORT" >/dev/null 2>&1; then
    if (cd "$BACKEND" && bun run db:test:prepare >/dev/null 2>&1); then
      ok "db:test:prepare (test DB on port $PORT)"
    else
      fail "db:test:prepare (run 'cd backend && bun run db:test:prepare' to see why)"
    fi
  else
    skip "db:test:prepare (test DB not reachable on port ${PORT:-?}; start it with 'docker compose up -d')"
  fi
fi

if [ "$FAILED" -ne 0 ]; then
  echo "worktree-setup: done with failures"
  exit 1
fi
echo "worktree-setup: ready"
