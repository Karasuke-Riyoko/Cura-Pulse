@echo off
title CuraPulse Development Server
color 0A
cls

:: Prevent telemetry background hangs and increase Node memory for large portals
set NEXT_TELEMETRY_DISABLED=1
set NODE_OPTIONS=--max-old-space-size=4096

echo ==============================================================================
echo                      CURAPULSE HEALTHCARE SYSTEM
echo ==============================================================================
echo.

REM 1. Free Port 3000 if occupied
echo [*] Step 1/3: Checking if port 3000 is currently occupied...
set FOUND=0
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    echo [*] Terminating stale process on port 3000 with PID %%a...
    taskkill /F /PID %%a >nul 2>&1
    set FOUND=1
)
if "%FOUND%"=="0" (
    echo [OK] Port 3000 is clean and free.
) else (
    echo [OK] Port 3000 freed successfully.
)
echo.

REM 2. Resolve working directory
echo [*] Step 2/3: Verifying workspace directory...
if exist "%~dp0work\package.json" (
    cd /d "%~dp0work"
) else if exist "%~dp0package.json" (
    cd /d "%~dp0"
) else (
    echo [ERROR] Could not find package.json!
    pause
    exit /b 1
)
echo [OK] Working directory: %CD%
echo.

REM 3. Startup banner
echo ==============================================================================
echo [*] Step 3/3: Starting Next.js Dev Server...
echo ==============================================================================
echo.
echo   Available Portal Routes:
echo     [1] Patient App (Riyo)      : http://localhost:3000
echo     [2] Doctor Clinical Pad    : http://localhost:3000/doctor
echo     [3] 24/7 Support Desk      : http://localhost:3000/support
echo     [4] Master Governance      : http://localhost:3000/admin
echo     [5] Gemini AI Safety Route : http://localhost:3000/api/symptom-check
echo.
echo ==============================================================================
echo   Keep this window OPEN while testing. Closing it stops the server.
echo   If you click inside this window and it freezes, press ENTER to unfreeze.
echo ==============================================================================
echo.

REM Launch browser in 2 seconds using ping delay (safe across all Windows versions)
start "" cmd /c "ping -n 3 127.0.0.1 >nul & start http://localhost:3000"

:RUN_SERVER
REM Run Next.js with call
call npm.cmd run dev

REM If server ever exits, don't let the window vanish!
echo.
echo ==============================================================================
echo [WARNING] Next.js dev server has stopped.
echo ==============================================================================
echo.
set /p RESTART="Do you want to restart the server? (Y/N): "
if /i "%RESTART%"=="Y" goto RUN_SERVER

pause
