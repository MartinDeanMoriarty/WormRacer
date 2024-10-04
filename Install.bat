@echo off
color 0a
cls

:: Display message to the user
echo Install WormRacer?
echo.
echo Press y to yes or c to cancel...

:: Read user input
set /p "userInput= "
if not "%userInput%" == "y" (
    echo Installation cancelled by user.
    pause
    exit /b
)

:: Check for Node.js installation
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed on this machine.
    echo Please install Node.js from https://nodejs.org/ and try again.
    pause
    exit /b
)

:: Run npm install
npm install

echo Installation completed.
pause