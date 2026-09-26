@echo off
REM DIGITALTWIN.AI - start backend + frontend (Windows)
setlocal
cd /d "%~dp0"
where python >nul 2>nul || (echo Install Python 3.10+ & exit /b 1)
where npm    >nul 2>nul || (echo Install Node.js 18+  & exit /b 1)

echo ==^> Backend
cd backend
if not exist .venv python -m venv .venv
call .venv\Scripts\activate.bat
pip install --quiet -r requirements.txt
start "DIGITALTWIN.AI backend" cmd /k "call .venv\Scripts\activate.bat && uvicorn app.main:app --port 8000 --reload"
cd ..

echo ==^> Frontend  -^>  http://localhost:5173
cd frontend
if not exist node_modules call npm install
call npm run dev
