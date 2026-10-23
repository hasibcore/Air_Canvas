@echo off
:: ==============================================================================
:: Start_AirCanvas_USB.bat - One-Click USB Cable Mode for Air Canvas
:: Runs ADB reverse port-forwarding and launches the Windows Native Server
:: ==============================================================================
title Air Canvas - USB Cable Mode Setup
echo ==============================================================================
echo              AIR CANVAS - ZERO-LAG USB CABLE CONNECTION SETUP
echo ==============================================================================
echo.
echo [1/3] Checking for connected Android device via ADB...

where adb >nul 2>&1
if %errorLevel% neq 0 (
    echo [WARNING] 'adb' command was not found in system PATH.
    echo Please ensure Android Platform Tools / USB Debugging is installed.
    echo If adb is in another folder, run:
    echo     adb reverse tcp:9090 tcp:9090
    echo.
) else (
    echo [2/3] Setting up ADB reverse port forwarding (Phone 9090 -^> PC 9090)...
    adb reverse tcp:9090 tcp:9090
    if %errorLevel% equ 0 (
        echo [SUCCESS] ADB reverse forward active! Phone can now connect via USB.
    ) else (
        echo [NOTICE] If no device was found, enable USB Debugging on your phone,
        echo plug in the USB cable, and re-run this script.
    )
)

echo.
echo [3/3] Starting Air Canvas Windows Server...
if exist "%~dp0AirCanvasServer.exe" (
    start "" "%~dp0AirCanvasServer.exe"
) else if exist "%~dp0AirCanvas.exe" (
    start "" "%~dp0AirCanvas.exe"
) else (
    echo Compiling and running AirCanvasServer.cs...
    call "%~dp0build_server.bat"
)

echo.
echo ==============================================================================
echo [READY] In your phone app, select: [USB Cable (127.0.0.1:9090)] -^> Connect!
echo Enjoy 0ms lag and smooth drawing!
echo ==============================================================================
timeout /t 5
