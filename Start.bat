@echo off
setlocal enabledelayedexpansion
REM Display menu options
echo Please select an option:
echo 1: Start server
echo 2: Start server and client
echo 3: Start client
set /p choice= Your choice:

:: Handle user input
if "%choice%"=="1" (
    set /p argument= Enter Port or leave empty for default: 
    if not defined argument (
        node server.js
     ) else (
         echo args:!argument!
         node server.js !argument!
     )
) else if "%choice%"=="2" (
    set /p argument= Enter Port or leave empty for default: 
    if not defined argument (
        start cmd /c "node client.js"
        node server.js         
     ) else (  
         echo args:!argument!
         start cmd /c "node client.js 127.0.0.1:!argument!"         
         node server.js !argument!
    )
) else if "%choice%"=="3" (
    set /p argument= Enter IP:Port or leave empty for default: 
    node client.js !argument!
) else (
    echo Invalid choice. Please run the script again and select a valid option.
)