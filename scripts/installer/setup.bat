@echo off
REM ──────────────────────────────────────────────────────────
REM Inventory Manager Agent — Windows Installer
REM Extracts and installs to %LOCALAPPDATA%\InventoryManager
REM ──────────────────────────────────────────────────────────

title Inventory Manager Agent - Setup

echo.
echo   ╔══════════════════════════════════════════════╗
echo   ║  📦 Installing Inventory Manager Agent       ║
echo   ╚══════════════════════════════════════════════╝
echo.

set "INSTALL_DIR=%LOCALAPPDATA%\InventoryManager"
set "DESKTOP_SHORTCUT=%USERPROFILE%\Desktop\Inventory Manager.lnk"

REM ─── Install ────────────────────────────────────────────────

if exist "%INSTALL_DIR%" (
    echo   Updating existing installation...
    REM Backup user data
    if exist "%INSTALL_DIR%\data" xcopy /E /I /Q /Y "%INSTALL_DIR%\data" "%TEMP%\inventory-backup\data" >nul 2>&1
    if exist "%INSTALL_DIR%\config\business.yaml" copy /Y "%INSTALL_DIR%\config\business.yaml" "%TEMP%\inventory-backup-config.yaml" >nul 2>&1
    if exist "%INSTALL_DIR%\.env" copy /Y "%INSTALL_DIR%\.env" "%TEMP%\inventory-backup-env" >nul 2>&1
)

echo   Installing to %INSTALL_DIR% ...
xcopy /E /I /Q /Y "%~dp0" "%INSTALL_DIR%" >nul

REM Restore user data
if exist "%TEMP%\inventory-backup\data" (
    xcopy /E /I /Q /Y "%TEMP%\inventory-backup\data" "%INSTALL_DIR%\data" >nul
    rmdir /S /Q "%TEMP%\inventory-backup" >nul 2>&1
    echo   ✅ Your data has been preserved
)
if exist "%TEMP%\inventory-backup-config.yaml" (
    copy /Y "%TEMP%\inventory-backup-config.yaml" "%INSTALL_DIR%\config\business.yaml" >nul
    del "%TEMP%\inventory-backup-config.yaml" >nul 2>&1
)
if exist "%TEMP%\inventory-backup-env" (
    copy /Y "%TEMP%\inventory-backup-env" "%INSTALL_DIR%\.env" >nul
    del "%TEMP%\inventory-backup-env" >nul 2>&1
)

REM ─── Create Desktop Shortcut ────────────────────────────────

echo   Creating desktop shortcut...
powershell -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut('%DESKTOP_SHORTCUT%');$s.TargetPath='%INSTALL_DIR%\run.bat';$s.WorkingDirectory='%INSTALL_DIR%';$s.Description='AI-powered inventory management';$s.Save()" 2>nul
echo   ✅ Desktop shortcut created

REM ─── Create data directory ──────────────────────────────────

if not exist "%INSTALL_DIR%\data" mkdir "%INSTALL_DIR%\data"

REM ─── Done ───────────────────────────────────────────────────

echo.
echo   ══════════════════════════════════════════════
echo   ✅ Installation complete!
echo.
echo   To start: Double-click 'Inventory Manager' on your Desktop
echo.
echo   Starting now...
echo   ══════════════════════════════════════════════
echo.

REM ─── Verify installation integrity ──────────────────────

if not exist "%INSTALL_DIR%\node\node.exe" (
    echo.
    echo   ERROR: Node.js binary missing from installation!
    echo   The zip may have been extracted incorrectly.
    echo   Make sure to extract ALL files before running setup.bat
    echo.
    echo   Press any key to exit...
    pause >nul
    exit /b 1
)

if not exist "%INSTALL_DIR%\src\launcher.js" (
    echo.
    echo   ERROR: Application files missing from installation!
    echo.
    echo   Press any key to exit...
    pause >nul
    exit /b 1
)

if not exist "%INSTALL_DIR%\node_modules" (
    echo.
    echo   ERROR: Dependencies missing from installation!
    echo   The zip may be incomplete. Please re-download.
    echo.
    echo   Press any key to exit...
    pause >nul
    exit /b 1
)

echo   ✅ Installation verified
echo.

REM Start the app
call "%INSTALL_DIR%\run.bat"
