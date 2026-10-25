@echo off
chcp 65001 >nul
title HACHIHI - Dong goi bo cai Windows
cd /d "%~dp0client"

where node >nul 2>nul
if errorlevel 1 (
  echo Chua cai Node.js. Tai tai https://nodejs.org
  pause
  exit /b 1
)

echo Nho sua DEFAULT_SERVER trong client\src\config.js thanh dia chi Render cua anh truoc khi dong goi.
echo.
if not exist "node_modules" call npm install
call npm run dist

echo.
echo Xong. Bo cai .exe nam trong thu muc client\release
pause
