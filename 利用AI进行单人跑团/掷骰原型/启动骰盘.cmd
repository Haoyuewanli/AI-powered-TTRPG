@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
if exist "命运骰盘.html" goto open
where node >nul 2>nul
if errorlevel 1 (
  echo 未找到离线文件“命运骰盘.html”。请使用完整的离线交付文件。
  pause
  exit /b 1
)
if not exist "node_modules\@3d-dice\dice-box-threejs\dist\dice-box-threejs.es.js" (
  echo 首次使用请在此目录运行 npm ci --ignore-scripts --cache .npm-cache
  pause
  exit /b 1
)
node build-offline.mjs
if errorlevel 1 (
  echo 离线文件生成失败，请查看上方提示。
  pause
  exit /b 1
)
:open
start "" "%~dp0命运骰盘.html"
