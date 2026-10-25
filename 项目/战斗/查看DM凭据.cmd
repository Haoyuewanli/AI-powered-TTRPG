@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 未找到Node.js，请确认本机已有Node.js安装。
  pause
  exit /b 1
)
node "%~dp0launcher.mjs" --credentials --no-browser
if errorlevel 1 pause
