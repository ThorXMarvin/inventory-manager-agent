@echo off
echo 🚀 Inventory Manager Agent
echo.

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js is not installed!
    echo    Download it from: https://nodejs.org
    pause
    exit /b 1
)

echo ✅ Node.js found

if not exist "node_modules" (
    echo 📦 Installing dependencies (first time only)...
    call npm install --production
)

echo.
node src/launcher.js
pause
