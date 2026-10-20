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

# Start backend
nohup env PYTHONPATH=. "$PYTHON_BIN" -m uvicorn aasthma.server:app --host 0.0.0.0 --port 8000 > backend.log 2>&1 < /dev/null &
BACKEND_PID=$!
disown $BACKEND_PID 2>/dev/null || true
echo $BACKEND_PID > backend.pid
echo "Backend started with PID $BACKEND_PID (log: $DIR/backend.log)"

# Start frontend
nohup npm run dev --prefix frontend > frontend.log 2>&1 < /dev/null &
FRONTEND_PID=$!
disown $FRONTEND_PID 2>/dev/null || true
echo $FRONTEND_PID > frontend.pid
echo "Frontend started with PID $FRONTEND_PID (log: $DIR/frontend.log)"

echo "Both services are up."
echo "FastAPI backend: http://localhost:8000 (docs: http://localhost:8000/docs)"
echo "Next.js frontend: http://localhost:3000"
