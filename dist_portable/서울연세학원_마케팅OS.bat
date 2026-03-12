@echo off
chcp 65001 >nul
pushd "%~dp0"
echo Starting PowerShell Launcher...
powershell -ExecutionPolicy Bypass -File "scripts\dist-launcher.ps1"
if %errorlevel% neq 0 pause
exit