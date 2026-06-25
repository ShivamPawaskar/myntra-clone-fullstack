#!/usr/bin/env bash
#
# Set up and run the Myntra-Clone full stack for local development:
# FastAPI backend + RQ notification worker + Next.js web + Expo mobile.
#
# First run installs everything (Python venv + pip, npm) and seeds the DB;
# later runs reuse it. All services run in this one terminal (logs interleave);
# press Ctrl-C once to stop them all.
#
# Usage:
#   ./run.sh                 # full stack
#   ./run.sh --no-mobile     # skip Expo
#   ./run.sh --no-worker     # skip RQ worker (no Redis needed)
#   ./run.sh --setup-only    # install + seed, don't start anything
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"; WEB="$ROOT/web"; MOBILE="$ROOT/mobile"

SETUP_ONLY=0; NO_WORKER=0; NO_WEB=0; NO_MOBILE=0
for arg in "$@"; do
  case "$arg" in
    --setup-only) SETUP_ONLY=1 ;;
    --no-worker)  NO_WORKER=1 ;;
    --no-web)     NO_WEB=1 ;;
    --no-mobile)  NO_MOBILE=1 ;;
    -h|--help)    sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

info() { printf '\033[36m==> %s\033[0m\n' "$1"; }
warn() { printf '\033[33m!!  %s\033[0m\n' "$1"; }

for cmd in python node npm; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "$cmd not found on PATH" >&2; exit 1; }
done

# Resolve the venv's python/rq across Unix (bin/) and Git-Bash-on-Windows (Scripts/).
resolve_venv() {
  if   [ -f "$BACKEND/.venv/bin/python" ];        then VPY="$BACKEND/.venv/bin/python";        VRQ="$BACKEND/.venv/bin/rq"
  elif [ -f "$BACKEND/.venv/Scripts/python.exe" ]; then VPY="$BACKEND/.venv/Scripts/python.exe"; VRQ="$BACKEND/.venv/Scripts/rq.exe"
  else VPY=""; VRQ=""; fi
}

# ---- backend: venv + deps + env + seed ----
resolve_venv
if [ -z "$VPY" ]; then
  info "Creating backend virtualenv"
  python -m venv "$BACKEND/.venv"
  resolve_venv
fi
info "Installing backend dependencies"
"$VPY" -m pip install --quiet --upgrade pip
"$VPY" -m pip install --quiet -r "$BACKEND/requirements-dev.txt"
if [ ! -f "$BACKEND/.env" ]; then cp "$BACKEND/.env.example" "$BACKEND/.env"; info "Created backend/.env from .env.example"; fi
info "Seeding database"
( cd "$BACKEND" && "$VPY" -m app.seed )

# ---- web: deps + env ----
if [ "$NO_WEB" -eq 0 ]; then
  [ -d "$WEB/node_modules" ] || { info "Installing web dependencies (npm install)"; ( cd "$WEB" && npm install ); }
  if [ ! -f "$WEB/.env.local" ] && [ -f "$WEB/.env.example" ]; then
    cp "$WEB/.env.example" "$WEB/.env.local"; info "Created web/.env.local from .env.example"
  fi
fi

# ---- mobile: deps ----
if [ "$NO_MOBILE" -eq 0 ]; then
  [ -d "$MOBILE/node_modules" ] || { info "Installing mobile dependencies (npm install)"; ( cd "$MOBILE" && npm install ); }
fi

# ---- redis check (worker + push notifications need it) ----
if [ "$NO_WORKER" -eq 0 ]; then
  if command -v redis-cli >/dev/null 2>&1 && [ "$(redis-cli ping 2>/dev/null || true)" = "PONG" ]; then
    :
  else
    warn "Redis not reachable. RQ worker + push notifications need Redis at redis://localhost:6379."
    warn "Start Redis (redis-server, or 'docker run -p 6379:6379 redis') or re-run with --no-worker."
  fi
fi

if [ "$SETUP_ONLY" -eq 1 ]; then info "Setup complete (--setup-only)."; exit 0; fi

# ---- launch services; Ctrl-C stops all of them ----
PIDS=()
cleanup() { info "Shutting down..."; for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup INT TERM EXIT

info "Starting API on http://localhost:8000 (docs: /docs)"
( cd "$BACKEND" && "$VPY" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 ) & PIDS+=($!)
if [ "$NO_WORKER" -eq 0 ]; then info "Starting RQ worker";              ( cd "$BACKEND" && "$VRQ" worker notifications ) & PIDS+=($!); fi
if [ "$NO_WEB"    -eq 0 ]; then info "Starting web on http://localhost:3000"; ( cd "$WEB" && npm run dev ) & PIDS+=($!); fi
if [ "$NO_MOBILE" -eq 0 ]; then info "Starting Expo dev server";        ( cd "$MOBILE" && npm start ) & PIDS+=($!); fi

info "All services started. Press Ctrl-C to stop."
wait
