@echo off
chcp 65001 >nul
setlocal
node -e "const p=require('node:path');const f=p.join(process.argv[1],'\u9879\u76ee','\u7a0b\u5e8f','\u5f00\u5361\u5347\u7ea7','Code','cli.mjs');const r=require('node:child_process').spawnSync(process.execPath,[f,...process.argv.slice(2)],{stdio:'inherit',windowsHide:true});if(r.error)console.error(r.error.message);process.exit(r.status??1);" -- "%~dp0." %*
pause
