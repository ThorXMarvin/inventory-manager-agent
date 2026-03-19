@echo off
REM Inventory Manager Agent — Run with bundled Node.js
cd /d "%~dp0"
set "PATH=%~dp0node;%PATH%"
if not exist "data" mkdir data
"%~dp0node\node.exe" src\launcher.js
pause
