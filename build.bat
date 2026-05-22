@echo off
echo ===================================================
echo   Cinematic Surround Extension - Build Automation
echo ===================================================
echo.

echo [1/3] Installing dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo Error: npm install failed.
    exit /b %ERRORLEVEL%
)

echo.
echo [2/3] Generating icons and static assets...
call node scripts/generate-icons.js
if %ERRORLEVEL% neq 0 (
    echo Error: Icon generation failed.
    exit /b %ERRORLEVEL%
)

echo.
echo [3/3] Compiling TypeScript and Vite bundle...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo Error: Vite build failed.
    exit /b %ERRORLEVEL%
)

echo.
echo ===================================================
echo   Build Successful! 
echo   Load the "dist" directory as unpacked extension.
echo ===================================================
pause
