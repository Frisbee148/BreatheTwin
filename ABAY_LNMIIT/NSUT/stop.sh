#!/usr/bin/env bash
# Stop the backend (FastAPI) and frontend (Next.js) services.

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

kill_by_pid_file() {
  pid_file=$1
  if [ -f "$pid_file" ]; then
    pid=$(cat "$pid_file" 2>/dev/null || true)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echo "Stopping process $pid (from $pid_file)..."
      kill "$pid" 2>/dev/null || true
      sleep 1
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
      fi
    fi
    rm -f "$pid_file"
  fi
}

kill_by_pid_file backend.pid
kill_by_pid_file frontend.pid

# Fallback: kill any process listening on ports 8000 and 3000
if command -v fuser >/dev/null 2>&1; then
  fuser -k 8000/tcp >/dev/null 2>&1 || true
  fuser -k 3000/tcp >/dev/null 2>&1 || true
fi

# Fallback pkill for uvicorn and next dev in this workspace
pkill -f "uvicorn aasthma.server:app" >/dev/null 2>&1 || true
pkill -f "next dev" >/dev/null 2>&1 || true

echo "Both services stopped."
