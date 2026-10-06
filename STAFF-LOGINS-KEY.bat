@echo off
rem One-time: lets SM HBD CRM make new staff logins (Staff mapping > Create login).
rem Asks for the Supabase secret key (typed hidden), checks it with Supabase, saves it as a GitHub secret, deploys.
cd /d "%~dp0"
node scripts\staff-logins-key.mjs
pause
