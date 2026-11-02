@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 goto failed
node -e "const p=require('node:path');const f=p.join(process.argv[1],'\u9879\u76ee','\u7a0b\u5e8f','\u5e73\u53f0','Code','project-entry.mjs');const r=require('node:child_process').spawnSync(process.execPath,[f,...process.argv.slice(2)],{stdio:'inherit',windowsHide:true});if(r.error)console.error(r.error.message);process.exit(r.status??1);" -- "%~dp0." %*
if errorlevel 1 goto failed
exit /b 0
:failed
echo Platform startup failed. Check the message above.
pause
exit /b 1
