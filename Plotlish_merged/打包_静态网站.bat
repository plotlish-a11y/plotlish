@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0打包_静态网站.ps1"
if errorlevel 1 pause
