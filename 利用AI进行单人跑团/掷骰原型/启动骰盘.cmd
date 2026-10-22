@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js，请先安装 Node.js 20 或更新版本。
  pause
  exit /b 1
)
if not exist "node_modules\@3d-dice\dice-box-threejs\dist\dice-box-threejs.es.js" (
  echo 首次使用请在此目录运行 npm ci --ignore-scripts --cache .npm-cache
  pause
  exit /b 1
)
node server.mjs --open
if errorlevel 1 pause
