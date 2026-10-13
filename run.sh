#!/usr/bin/env bash
set -e

# DigiTwin / BreathTwin - One-shot launch script
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="${PROJECT_DIR}/frontend"

echo "=========================================================="
echo "  BREATHTWIN // ASTHMA FLARE-UP DIGITAL TWIN SYSTEM"
echo "=========================================================="

# Check requirements
command -v node >/dev/null 2>&1 || { echo "[ERROR] Node.js is not installed. Please install Node.js (>= 18.x)."; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "[ERROR] npm is not installed. Please install npm."; exit 1; }

echo "[+] Node version: $(node -v)"
echo "[+] npm version:  $(npm -v)"

cd "${FRONTEND_DIR}"

# Install dependencies if node_modules is missing
if [ ! -d "node_modules" ]; then
  echo "[+] Installing frontend dependencies..."
  npm install
else
  echo "[+] Dependencies already installed."
fi

# Determine run mode
if [[ "$1" == "--prod" || "$1" == "--start" ]]; then
  echo "[+] Building optimized production bundle..."
  npm run build
  echo "[+] Launching production server on http://localhost:3000 ..."
  npm run start
else
  echo "[+] Launching Next.js development server on http://localhost:3000 ..."
  echo "    Press Ctrl+C to terminate."
  echo "=========================================================="
  npm run dev
fi
