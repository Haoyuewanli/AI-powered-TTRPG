@echo off
chcp 65001 >nul
setlocal
where node >nul 2>nul
if errorlevel 1 goto missing
node "%~dp0launcher.mjs" --credentials --no-browser %*
if errorlevel 1 pause
exit /b
:missing
echo Node.js not found. Please restore the existing Node.js installation.
pause
exit /b 1
