#!/usr/bin/env bash
# Try this branch locally: one command, from backend/:  bun run try   (or ./scripts/try.sh)
#
#   bun run try                 start Docker DBs, migrate the dev DB (asks first), start API + UI
#   bun run try --check         check prerequisites and say what would happen; starts nothing
#   bun run try --skip-migrate  start even if migrations are pending
#   bun run try --env-file <p>  backend env file (default: backend/.env, then $TRY_ENV_FILE,
#                               then ~/.claude/diecast-env/main-test.env)
#
# Safety: never resets, drops or seeds over data. Migrations go only through `bun run db:migrate`
# (backup + typed confirm on the dev DB, docs/specs/db-migrations.md BR-MIG-13..17). The only
# other DB access is scripts/try-status.ts, one READ ONLY transaction. Never prints a password.
# Ctrl-C stops the API and the UI this script started; the Docker DBs keep running.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
API_PORT=4000
UI_PORT=3000
API_URL="http://localhost:$API_PORT"
UI_URL="http://localhost:$UI_PORT"

CHECK=0
SKIP_MIGRATE=0
ENV_FILE="${TRY_ENV_FILE:-}"
while [ $# -gt 0 ]; do
  case "$1" in
    --check) CHECK=1 ;;
    --skip-migrate) SKIP_MIGRATE=1 ;;
    --env-file) shift; ENV_FILE="${1:-}" ;;
    --env-file=*) ENV_FILE="${1#--env-file=}" ;;
    -h|--help) sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)"; exit 64 ;;
  esac
  shift
done

say()  { printf '%s\n' "$*"; }
ok()   { printf '  ok    %s\n' "$*"; }
note() { printf '  note  %s\n' "$*"; }
bad()  { printf '  STOP  %s\n' "$*"; PROBLEMS=$((PROBLEMS + 1)); }
PROBLEMS=0
WOULD=""
would() { WOULD="${WOULD}  - $*"$'\n'; }

# ---------------------------------------------------------------- prerequisites
say "Checking…"
for tool in bun docker curl lsof; do
  command -v "$tool" >/dev/null 2>&1 || bad "'$tool' is not installed or not on PATH."
done

DOCKER_UP=0
if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    DOCKER_UP=1; ok "Docker is running"
  else
    bad "Docker is not running. Open Docker Desktop, wait until it says 'running', then run this again."
  fi
fi

# Backend env: bun loads backend/.env by itself; anything else is passed with --env-file.
ENV_ARG=""
ENV_SHOWN="backend/.env"
if [ -n "$ENV_FILE" ]; then
  if [ -f "$ENV_FILE" ]; then ENV_ARG="--env-file=$ENV_FILE"; ENV_SHOWN="$ENV_FILE"
  else bad "Env file not found: $ENV_FILE"; fi
elif [ ! -f "$BACKEND/.env" ]; then
  if [ -f "$HOME/.claude/diecast-env/main-test.env" ]; then
    ENV_FILE="$HOME/.claude/diecast-env/main-test.env"
    ENV_ARG="--env-file=$ENV_FILE"; ENV_SHOWN="$ENV_FILE"
  else
    bad "No backend/.env. Copy backend/.env.example to backend/.env and fill it in, or pass --env-file <path>."
  fi
fi
[ "$PROBLEMS" -eq 0 ] && ok "Backend env: $ENV_SHOWN"

backend_bun() { (cd "$BACKEND" && if [ -n "$ENV_ARG" ]; then bun "$ENV_ARG" "$@"; else bun "$@"; fi); }
# What to type by hand, with the same env file.
manual() { # <VAR=value or ""> <script>
  local pre=""; [ -n "$1" ] && pre="$1 "
  if [ -n "$ENV_ARG" ]; then echo "cd backend && ${pre}bun $ENV_ARG run $2"; else echo "cd backend && ${pre}bun run $2"; fi
}

[ -d "$BACKEND/node_modules" ]  || bad "backend/node_modules is missing: cd backend && bun install"
[ -d "$FRONTEND/node_modules" ] || bad "frontend/node_modules is missing: cd frontend && bun install"

# The UI needs NEXT_PUBLIC_API_URL. An existing frontend env file is left alone.
UI_ENV_FROM_FILE=0
for f in "$FRONTEND/.env" "$FRONTEND/.env.local" "$FRONTEND/.env.development" "$FRONTEND/.env.development.local"; do
  [ -f "$f" ] && UI_ENV_FROM_FILE=1
done
if [ "$UI_ENV_FROM_FILE" -eq 1 ] || [ -n "${NEXT_PUBLIC_API_URL:-}" ]; then
  ok "UI env: NEXT_PUBLIC_API_URL from your frontend env file / shell"
else
  export NEXT_PUBLIC_API_URL="$API_URL/api"
  ok "UI env: no frontend env file, using NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL"
fi

port_holder() { lsof -nP -iTCP:"$1" -sTCP:LISTEN 2>/dev/null | awk 'NR==2 {print $1 " (pid " $2 ")"}'; }
for p in $API_PORT $UI_PORT; do
  holder="$(port_holder "$p")"
  if [ -n "$holder" ]; then
    bad "Port $p is in use by $holder. Stop it yourself if it is yours; this script never kills it."
  else
    ok "Port $p is free"
  fi
done

running_services() { (cd "$BACKEND" && docker compose ps --status running --services 2>/dev/null); }
DEV_DB_UP=0
if [ "$DOCKER_UP" -eq 1 ]; then
  svc="$(running_services)"
  if echo "$svc" | grep -qx postgres; then DEV_DB_UP=1; ok "Dev DB container is running (:5432)"
  else note "Dev DB container is not running"; would "start the Docker databases: cd backend && docker compose up -d"; would "then look at the dev DB (read only): pending migrations go through 'bun run db:migrate' after you type the database name; no users = print the manual seed command"; fi
  echo "$svc" | grep -qx postgres-test && ok "Test DB container is running (:5433)" || note "Test DB container is not running (only tests need it)"
fi

# ---------------------------------------------------------------- database status (read only)
TARGET=""; STATE=""; PENDING=0; USERS=0; LOGINS=""; DETAIL=""
read_status() {
  local line
  TARGET=""; STATE=""; PENDING=0; USERS=0; LOGINS=""; DETAIL=""
  while IFS= read -r line; do
    case "$line" in
      target=*)  TARGET="${line#target=}" ;;
      state=*)   STATE="${line#state=}" ;;
      pending=*) PENDING="${line#pending=}" ;;
      users=*)   USERS="${line#users=}" ;;
      logins=*)  LOGINS="${line#logins=}" ;;
      detail=*)  DETAIL="${line#detail=}" ;;
    esac
  done < <(backend_bun scripts/try-status.ts 2>&1)
}
DB_NAME() { echo "${TARGET##*/}"; }

describe_db() {
  case "$STATE" in
    ok|empty)
      ok "Dev DB $TARGET: $PENDING migration(s) pending, $USERS user(s)"
      if [ "$PENDING" -gt 0 ]; then
        if [ "$SKIP_MIGRATE" -eq 1 ]; then would "skip $PENDING pending migration(s) (--skip-migrate)"
        else would "apply $PENDING pending migration(s) with 'bun run db:migrate' (backup first; asks you to type the database name)"; fi
      fi
      [ "$USERS" -eq 0 ] && would "NOT add demo data (0 users, but the only seed is db:reset, which wipes): print the manual command instead"
      ;;
    push|mismatch)
      if [ "$SKIP_MIGRATE" -eq 1 ]; then note "Dev DB $TARGET: $DETAIL (ignored: --skip-migrate)"
      else bad "Dev DB $TARGET does not match this branch: $DETAIL. 'bun run db:migrate' would refuse. Use --skip-migrate to start anyway."; fi
      ;;
    unreachable) bad "Dev DB ${TARGET:-?} cannot be reached: $DETAIL" ;;
    *) bad "Could not read the dev DB status (is DATABASE_URL in $ENV_SHOWN?). ${DETAIL}" ;;
  esac
}

if [ "$PROBLEMS" -eq 0 ] && [ "$DEV_DB_UP" -eq 1 ]; then
  read_status; describe_db
fi

if [ "$CHECK" -eq 1 ]; then
  would "start the API on $API_URL (cd backend && bun run dev) and the UI on $UI_URL (cd frontend && bun run dev)"
  would "wait until both answer, print the URL and the demo login names, stop both on Ctrl-C"
  say ""
  if [ "$PROBLEMS" -gt 0 ]; then
    say "Check: $PROBLEMS problem(s) above. Nothing was started."
    exit 1
  fi
  say "Check passed. 'bun run try' would:"
  printf '%s' "$WOULD"
  say "Nothing was started or changed."
  exit 0
fi
if [ "$PROBLEMS" -gt 0 ]; then
  say ""; say "Not started: fix the $PROBLEMS problem(s) above. Nothing was changed."
  exit 1
fi

# ---------------------------------------------------------------- containers
if [ "$DEV_DB_UP" -eq 0 ]; then
  say "Starting the Docker databases…"
  (cd "$BACKEND" && docker compose up -d) || { say "docker compose up failed. See docs/runbooks/docker-or-port-problem.md"; exit 1; }
  for _ in $(seq 1 30); do
    (cd "$BACKEND" && docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1) && break
    sleep 1
  done
  read_status; describe_db
  [ "$PROBLEMS" -gt 0 ] && { say "Not started. Nothing was changed in the database."; exit 1; }
fi

# ---------------------------------------------------------------- migrations (dev DB, safe script only)
if [ "$PENDING" -gt 0 ] && [ "$SKIP_MIGRATE" -eq 0 ]; then
  db="$(DB_NAME)"
  say ""
  say "$PENDING migration(s) are pending on $TARGET."
  confirm="${MIGRATE_CONFIRM:-}"
  case "$db" in *_test) confirm="$db" ;; esac
  if [ -z "$confirm" ]; then
    if [ -t 0 ]; then
      say "db:migrate takes a pg_dump backup into backend/backups/ first, then applies them in one transaction."
      printf "Type the database name (%s) to apply them, or press Enter to stop: " "$db"
      read -r confirm
    fi
    if [ -z "$confirm" ]; then
      say "Not migrated, not started. To apply them yourself:"
      say "  $(manual "MIGRATE_CONFIRM=$db" db:migrate)"
      say "Or start without migrating: bun run try --skip-migrate"
      exit 3
    fi
  fi
  if ! (export MIGRATE_CONFIRM="$confirm"; backend_bun run db:migrate); then
    say "db:migrate stopped (see its message above). Not started."
    exit 3
  fi
  read_status
fi

# ---------------------------------------------------------------- demo data
if [ "$USERS" -eq 0 ]; then
  db="$(DB_NAME)"
  say ""
  say "This database has no users, so nobody can log in yet."
  say "There is no safe 'add demo data' script: the only seed is db:reset, which WIPES the database first."
  say "This command never runs it. If $TARGET really holds nothing you want to keep, run it yourself:"
  say "  $(manual "DB_RESET_CONFIRM=$db" db:reset)      # wipe + roles, admin, demo documents"
  say "  $(manual "" seed)      # optional, after that: subcontracting demo"
  say "Both need SEED_USER_PASSWORD (8+ characters) in $ENV_SHOWN. Starting anyway…"
fi

# ---------------------------------------------------------------- start API + UI
set -m   # each server gets its own process group, so stopping it stops its children too
API_PG=""; UI_PG=""
LAST_PG=""
start() { # name dir command…  -> LAST_PG = process group of the new server
  local name="$1" dir="$2"; shift 2
  ( cd "$dir" && exec "$@" ) 2>&1 | awk -v p="[$name] " '{ print p $0; fflush() }' &
  LAST_PG="$(ps -o pgid= -p $! | tr -d ' ')"
  disown   # no job-control chatter when it is stopped
}
STOPPING=0
stop_all() {
  [ "$STOPPING" -eq 1 ] && return; STOPPING=1
  say ""; say "Stopping API and UI…"
  for pg in $API_PG $UI_PG; do kill -TERM -- "-$pg" 2>/dev/null; done
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    alive=0; for pg in $API_PG $UI_PG; do kill -0 -- "-$pg" 2>/dev/null && alive=1; done
    [ "$alive" -eq 0 ] && break; sleep 0.5
  done
  for pg in $API_PG $UI_PG; do kill -KILL -- "-$pg" 2>/dev/null; done
  say "Stopped. The Docker databases are still running."
}
trap 'stop_all; exit 0' INT TERM
trap 'stop_all' EXIT

say ""
say "Starting API (:$API_PORT) and UI (:$UI_PORT)…"
if [ -n "$ENV_ARG" ]; then start api "$BACKEND" env PORT="$API_PORT" bun "$ENV_ARG" run dev
else start api "$BACKEND" env PORT="$API_PORT" bun run dev; fi
API_PG="$LAST_PG"
start ui "$FRONTEND" bun run dev --port "$UI_PORT"
UI_PG="$LAST_PG"

answers() { curl -s -o /dev/null --max-time 3 "$1"; }
ready=0
for _ in $(seq 1 120); do
  if ! kill -0 -- "-$API_PG" 2>/dev/null; then say "The API stopped while starting. See the [api] lines above."; exit 1; fi
  if ! kill -0 -- "-$UI_PG" 2>/dev/null; then say "The UI stopped while starting. See the [ui] lines above."; exit 1; fi
  if answers "$API_URL/health" && answers "$UI_URL/login"; then ready=1; break; fi
  sleep 1
done
if [ "$ready" -eq 0 ]; then say "API or UI did not answer within 2 minutes. See the lines above."; exit 1; fi

say ""
say "================================================================"
say " Ready.  Open  $UI_URL        (API: $API_URL)"
if [ -n "$LOGINS" ]; then
  say " Logins: $(echo "$LOGINS" | sed 's/,/, /g')"
  say " Password: the SEED_USER_PASSWORD this database was seeded with ($ENV_SHOWN); it is not stored in the repo."
elif [ "$USERS" -gt 0 ]; then
  say " Logins: $USERS user(s) in this database, none named <role>@diecast.local. Use your own."
else
  say " Logins: none yet (see the note about demo data above)."
fi
say " Ctrl-C stops both."
say "================================================================"
while kill -0 -- "-$API_PG" 2>/dev/null && kill -0 -- "-$UI_PG" 2>/dev/null; do sleep 1; done
say "The API or the UI stopped by itself. See the lines above."
exit 1
