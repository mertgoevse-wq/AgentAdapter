@echo off
rem Double-click this file (or run it from cmd.exe) to install AgentAdapter.
rem It bypasses the PowerShell execution policy for this one process only.
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
set "code=%ERRORLEVEL%"
if "%~1"=="" pause
exit /b %code%
