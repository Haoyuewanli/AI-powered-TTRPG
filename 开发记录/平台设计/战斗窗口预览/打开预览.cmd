@echo off
cd /d "%~dp0"
node serve.mjs --open
if errorlevel 1 pause
