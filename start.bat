@echo off
title Dev Dashboard
cd /d "%~dp0"

echo.
echo  Starting Dev Dashboard...
echo.

:: Check if node_modules exists
if not exist "node_modules" (
    echo  Installing dependencies...
    npm install
    echo.
)

:: Start server and open browser
start "" http://localhost:4000
node server.js
