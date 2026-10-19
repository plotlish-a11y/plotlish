@echo off
cd /d "%~dp0"
where npx >nul 2>nul
if errorlevel 1 (
 echo [ERROR] Node.js and npm are required for Wrangler.
 pause
 exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0发布到_Cloudflare_Pages.ps1"
if errorlevel 1 pause
