@echo off
chcp 65001 >nul
setlocal
where node >nul 2>nul
if errorlevel 1 goto missing
node -e "import(require('node:url').pathToFileURL(require('node:path').join(process.argv[1],'\u9879\u76ee','\u6218\u6597','launcher.mjs')).href)" -- "%~dp0." %*
if errorlevel 1 goto failed
exit /b 0
:missing
echo Node.js not found. Please restore the existing Node.js installation.
:failed
pause
exit /b 1
