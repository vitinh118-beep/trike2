@echo off
chcp 65001 >nul
title HACHIHI Counter-Strike - Chay local
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Chua cai Node.js. Hay tai ban LTS tai https://nodejs.org roi chay lai file nay.
  pause
  exit /b 1
)

if not exist "server\node_modules" (
  echo [1/2] Cai thu vien cho server...
  pushd server
  call npm install
  popd
)
if not exist "client\node_modules" (
  echo [2/2] Cai thu vien cho client (lan dau se tai Electron, mat vai phut)...
  pushd client
  call npm install
  popd
)

echo Dang mo server va game...
start "HACHIHI Server" cmd /k "cd /d %~dp0server && npm start"
timeout /t 2 >nul
start "HACHIHI Client" cmd /k "cd /d %~dp0client && npm start"

echo.
echo Muon choi thu 2 nguoi tren cung may: mo them 1 cua so game bang lenh:
echo     cd client ^&^& npx electron .
echo.
pause
