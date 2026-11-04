@echo off
chcp 65001 >nul
setlocal DisableDelayedExpansion
cd /d "%~dp0"
node "Code\cli.mjs" %*
set "result=%errorlevel%"
pause
exit /b %result%
