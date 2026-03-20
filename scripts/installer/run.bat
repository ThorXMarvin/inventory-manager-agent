@echo off
REM Inventory Manager Agent — Run with bundled Node.js
title Inventory Manager Agent
cd /d "%~dp0"
set "PATH=%~dp0node;%PATH%"

REM ─── Verify bundled Node.js exists ──────────────────────
if not exist "node\node.exe" (
    echo.
    echo   ERROR: Bundled Node.js not found at node\node.exe
    echo   The installation may be corrupted. Please re-download.
    echo.
    echo   Press any key to exit...
    pause >nul
    exit /b 1
)

REM ─── Verify app files exist ─────────────────────────────
if not exist "src\launcher.js" (
    echo.
    echo   ERROR: Application files missing (src\launcher.js not found)
    echo   The installation may be corrupted. Please re-download.
    echo.
    echo   Press any key to exit...
    pause >nul
    exit /b 1
)

if not exist "data" mkdir data

echo.
echo   Starting Inventory Manager Agent...
echo   (If the browser doesn't open, go to http://localhost:3000)
echo.

REM ─── Run with error capture ─────────────────────────────
"node\node.exe" src\launcher.js 2> data\error.log
set EXIT_CODE=%ERRORLEVEL%

if %EXIT_CODE% NEQ 0 (
    echo.
    echo   ══════════════════════════════════════════════
    echo   ERROR: Inventory Manager failed to start (code %EXIT_CODE%)
    echo   ══════════════════════════════════════════════
    echo.
    if exist data\error.log (
        echo   Error details:
        echo   ──────────────────────────────────────────
        type data\error.log
        echo.
        echo   ──────────────────────────────────────────
    )
    echo.
    echo   Common fixes:
    echo     - Make sure port 3000 is not in use
    echo     - Try setting WEB_PORT=3001 in a .env file
    echo     - Re-download the installer
    echo.
    echo   Full log saved to: %cd%\data\error.log
    echo.
    echo   Press any key to exit...
    pause >nul
    exit /b %EXIT_CODE%
)
