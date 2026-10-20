#!/usr/bin/env bash
# Stop the backend (FastAPI) and frontend (Next.js) services started by run.sh.

# Helper to kill a process by PID file
kill_by_pid_file() {
  pid_file=$1
  if [ -f "$pid_file" ]; then
    pid=$(cat "$pid_file")
    if kill -0 $pid 2>/dev/null; then
      echo "Killing process $pid (from $pid_file)"
      kill $pid
      # Wait briefly and force kill if still alive
      sleep 2
      if kill -0 $pid 2>/dev/null; then
        echo "Process $pid still alive, forcing kill"
        kill -9 $pid
      fi
    else
      echo "No running process found for PID $pid (from $pid_file)"
    fi
    rm -f "$pid_file"
  else
    echo "PID file $pid_file not found."
  fi
}

kill_by_pid_file backend.pid
kill_by_pid_file frontend.pid

echo "Both services stopped (if they were running)."
