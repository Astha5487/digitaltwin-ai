#!/usr/bin/env bash
# DIGITALTWIN.AI — start backend + frontend together (macOS / Linux)
set -euo pipefail
cd "$(dirname "$0")"

command -v python3 >/dev/null || { echo "Install Python 3.10+"; exit 1; }
command -v npm     >/dev/null || { echo "Install Node.js 18+";  exit 1; }

echo "==> Backend"
cd backend
[ -d .venv ] || python3 -m venv .venv
source .venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
uvicorn app.main:app --port 8000 --reload &
BACK=$!
cd ..
trap 'kill $BACK 2>/dev/null || true' EXIT INT TERM

echo "==> Frontend  ->  http://localhost:5173"
cd frontend
[ -d node_modules ] || npm install
npm run dev
