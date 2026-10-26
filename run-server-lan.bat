@echo off
chcp 65001 >nul
title HACHIHI - May chu mang noi bo (LAN)
cd /d "%~dp0server"
where node >nul 2>nul
if errorlevel 1 (
  echo Chua cai Node.js. Tai ban LTS tai https://nodejs.org roi chay lai.
  pause
  exit /b 1
)
if not exist node_modules call npm install
echo.
echo === Server dang chay. Hay GIU cua so nay mo trong luc choi. ===
echo Neu may khac khong vao duoc: cho phep Node.js qua Windows Firewall (Private network).
echo.
node server.js
pause
