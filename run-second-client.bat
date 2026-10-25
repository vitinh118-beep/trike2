@echo off
chcp 65001 >nul
title HACHIHI - Client thu 2
cd /d "%~dp0client"
if not exist "node_modules" call npm install
if not exist "dist\bundle.js" call npm run build
npx electron .
