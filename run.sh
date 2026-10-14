#!/usr/bin/env bash
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AASTHMA_DIR="${PROJECT_DIR}/aasthma"
VENV_DIR="${AASTHMA_DIR}/.venv"
FRONTEND_DIR="${PROJECT_DIR}/frontend"

echo "=========================================================="
echo "  BREATHTWIN // ASTHMA FLARE-UP DIGITAL TWIN SYSTEM"
echo "  Multimodal Neural & Mechanistic Clinical Platform"
echo "=========================================================="

# Check requirements
command -v node >/dev/null 2>&1 || { echo "[ERROR] Node.js is not installed. Please install Node.js (>= 18.x)."; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "[ERROR] npm is not installed. Please install npm."; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "[ERROR] Python 3 is not installed. Please install Python (>= 3.10)."; exit 1; }

echo "[+] Node version:   $(node -v)"
echo "[+] npm version:    $(npm -v)"
echo "[+] Python version: $(python3 --version)"

# Check / Setup Python Virtual Environment
if [ ! -d "${VENV_DIR}" ]; then
  echo "[+] Creating Python virtual environment in ${VENV_DIR}..."
  python3 -m venv "${VENV_DIR}"
  echo "[+] Installing backend dependencies..."
  "${VENV_DIR}/bin/pip" install --upgrade pip
  "${VENV_DIR}/bin/pip" install -r "${PROJECT_DIR}/requirements.txt"
else
  echo "[+] Python virtual environment verified at ${VENV_DIR}."
fi

# Cleanup handler for graceful shutdown
cleanup() {
  echo ""
  echo "[+] Shutting down BreathTwin backend and frontend services..."
  if [ -n "${BACKEND_PID}" ]; then
    kill "${BACKEND_PID}" 2>/dev/null || true
  fi
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# Start FastAPI Digital Twin Service in background
echo "[+] Launching FastAPI Digital Twin Engine on http://localhost:8000 ..."
PYTHONPATH="${PROJECT_DIR}" "${VENV_DIR}/bin/uvicorn" aasthma.server:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Brief pause to verify backend startup
sleep 2

# Frontend setup
cd "${FRONTEND_DIR}"
if [ ! -d "node_modules" ]; then
  echo "[+] Installing frontend dependencies..."
  npm install
else
  echo "[+] Frontend dependencies already installed."
fi

# Determine run mode
if [[ "$1" == "--prod" || "$1" == "--start" ]]; then
  echo "[+] Building optimized production bundle..."
  npm run build
  echo "[+] Launching production server on http://localhost:3000 ..."
  npm run start
else
  echo "[+] Launching Next.js development server on http://localhost:3000 ..."
  echo "    FastAPI Backend:  http://localhost:8000 (API Docs: http://localhost:8000/docs)"
  echo "    Web Dashboard:    http://localhost:3000"
  echo "    Press Ctrl+C to terminate both servers."
  echo "=========================================================="
  npm run dev
fi
