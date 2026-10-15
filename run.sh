#!/usr/bin/env bash
# Run both backend (FastAPI) and frontend (Next.js) services.
# Ensure environment variables are loaded
if [ -f ".env" ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Start backend
nohup PYTHONPATH=. aasthma/.venv/bin/uvicorn aasthma.server:app --host 0.0.0.0 --port 8000 > backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > backend.pid
echo "Backend started with PID $BACKEND_PID (log: backend.log)"

# Start frontend
nohup npm run dev --prefix frontend > frontend.log 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > frontend.pid
echo "Frontend started with PID $FRONTEND_PID (log: frontend.log)"

echo "Both services are up."
