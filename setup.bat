@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title SoftradeX Trade - Setup

echo.
echo   SoftradeX Trade - TypeScript + Vite Setup
echo   -----------------------------------------
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [X] Node.js was not found on this PC.
  echo       Install Node.js LTS from https://nodejs.org/ and run this again.
  pause
  exit /b 1
)

echo   [OK] Installing TypeScript + React + Vite packages...
call npm install
if errorlevel 1 (
  echo   [X] npm install failed.
  pause
  exit /b 1
)

echo.
echo   [OK] Setup complete. Run start.bat to launch SoftradeX Trade.
if /i not "%~1"=="auto" pause
exit /b 0
