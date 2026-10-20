#!/usr/bin/env bash
# Run both backend (FastAPI) and frontend (Next.js) services.

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Ensure environment variables are loaded
if [ -f ".env" ]; then
  set -a
  source .env 2>/dev/null || true
  set +a
fi

# Ensure Docker PostgreSQL is running if available
if command -v docker >/dev/null 2>&1; then
  docker compose up -d >/dev/null 2>&1 || true
fi

# Stop any previous lingering processes on ports 8000 and 3000
./stop.sh >/dev/null 2>&1 || true

# Determine Python binary
PYTHON_BIN="aasthma/.venv/bin/python"
if [ ! -f "$PYTHON_BIN" ]; then
  PYTHON_BIN="python3"
fi

# Python background launcher to ensure processes detach into new session group
launch_bg() {
  local log_file="$1"
  local pid_file="$2"
  shift 2
  python3 -c "
import subprocess, sys, os
log_f = open(sys.argv[1], 'a')
p = subprocess.Popen(sys.argv[3:], stdout=log_f, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, start_new_session=True, env=os.environ.copy())
with open(sys.argv[2], 'w') as pf:
    pf.write(str(p.pid) + '\n')
print(p.pid)
" "$log_file" "$pid_file" "$@"
}

# Start backend
BACKEND_PID=$(launch_bg "$DIR/backend.log" "$DIR/backend.pid" "$PYTHON_BIN" -m uvicorn aasthma.server:app --host 0.0.0.0 --port 8000)
echo "Backend started with PID $BACKEND_PID (log: $DIR/backend.log)"

# Start frontend
FRONTEND_PID=$(launch_bg "$DIR/frontend.log" "$DIR/frontend.pid" npm run dev --prefix frontend)
echo "Frontend started with PID $FRONTEND_PID (log: $DIR/frontend.log)"

echo "Both services are starting up."
echo "FastAPI backend: http://localhost:8000 (docs: http://localhost:8000/docs)"
echo "Next.js frontend: http://localhost:3000"
