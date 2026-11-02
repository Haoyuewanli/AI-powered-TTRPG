@echo off
setlocal
cd /d "%~dp0"
node "%~dp0Code\launcher.mjs" %*
if errorlevel 1 (
  echo Platform startup failed. Read the message above.
  pause
  exit /b 1
)
endlocal
