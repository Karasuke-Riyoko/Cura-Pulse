@echo off
title CuraPulse Git Push
cd /d "C:\Users\Asus\Desktop\Curapulse"

echo ========================================================
echo   Pushing CuraPulse to GitHub
echo   Repo: https://github.com/Karasuke-Riyoko/Cura-Pulse.git
echo ========================================================
echo.

git push -u origin main

if %ERRORLEVEL% equ 0 (
    echo.
    echo ========================================================
    echo   SUCCESS! CuraPulse pushed to GitHub main branch.
    echo ========================================================
) else (
    echo.
    echo ========================================================
    echo   Push encountered an error. Check authentication above.
    echo ========================================================
)
echo.
pause
