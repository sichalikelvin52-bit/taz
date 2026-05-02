@echo off
:: TAZ Furnitures — Backend Startup (Windows)
title TAZ Furnitures Backend v2.4

echo.
echo   =============================================
echo    TAZ FURNITURES — Backend v2.4
echo   =============================================
echo.

:: Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo   ERROR: Node.js not found.
  echo   Install from: https://nodejs.org
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('node -e "process.stdout.write(process.version)"') do set NODE_VER=%%v
echo   Node.js %NODE_VER% found

:: Create data directory
if not exist "data" mkdir data

echo.
echo   API:      http://localhost:3747/api/
echo   Frontend: Open taz_furnitures_v24.html in your browser
echo   PIN:      1234
echo.
echo   Press Ctrl+C to stop the server
echo.

node server.js
pause
