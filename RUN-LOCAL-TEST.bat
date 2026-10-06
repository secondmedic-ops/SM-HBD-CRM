@echo off
setlocal
title SM HBD CRM - local test (safe test database)
cd /d "%~dp0"

echo ============================================================
echo  SM HBD CRM local test
echo  API     : http://localhost:8787  (the same Worker code as
echo            the live site, on an in-memory TEST database with
echo            demo data, wiped when you close it - the live
echo            Supabase data is NOT touched; login is off)
echo  Frontend: http://localhost:3000
echo  Close the two new windows to stop.
echo ============================================================

set "BACKEND_URL=http://localhost:8787"

start "SM HBD CRM API (TEST database)" /D "%~dp0cloudflare" cmd /k "npm install --no-audit --no-fund --loglevel=error && node test\local.mjs"
start "SM HBD CRM frontend" /D "%~dp0" cmd /k "npm install --no-audit --no-fund --loglevel=error && npm run dev"

echo.
echo Waiting for both to start (about a minute the first time)...
node -e "setTimeout(()=>{},45000)"
start "" http://localhost:3000
echo Opened http://localhost:3000 - if it says "Could not reach the server", wait until
echo the API window shows "Ready on http://127.0.0.1:8787", then click Try again.
echo.
pause
