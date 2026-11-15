@echo off
title CuraPulse Git Push and Zip
cd /d "C:\Users\Asus\Desktop\Curapulse"

echo ========================================================
echo   Pushing CuraPulse to GitHub
echo   Repo: https://github.com/Karasuke-Riyoko/Cura-Pulse.git
echo ========================================================
echo.

git add .
git commit -m "update: latest CuraPulse updates and assets"
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
echo ========================================================
echo   Creating updated Curapulse.zip on Desktop...
echo ========================================================
cd /d "C:\Users\Asus\Desktop"
tar -a -cf Curapulse.zip --exclude="node_modules" --exclude=".next" --exclude=".git" Curapulse

echo.
echo Complete! Curapulse.zip is updated on Desktop.
echo.
pause
