@echo off
rem Saves the Supabase database password in GitHub after checking it with the database, then deploys.
cd /d "%~dp0"
node scripts\db-password.mjs
pause
