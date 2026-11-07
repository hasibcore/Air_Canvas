@echo off
setlocal
echo =======================================================================
echo          Air Canvas Windows Native Server Compiler [DPI Aware]
echo =======================================================================
echo.

set "CSC="
if exist "%windir%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" (
    set "CSC=%windir%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
) else if exist "%windir%\Microsoft.NET\Framework\v4.0.30319\csc.exe" (
    set "CSC=%windir%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)

if not defined CSC (
    echo [ERROR] .NET Framework 4.0/4.5+ compiler csc.exe not found.
    echo Please install .NET Framework or Visual Studio Build Tools.
    pause
    exit /b 1
)

echo Found C# Compiler: %CSC%
echo Compiling AirCanvas Desktop Application and Server with app.ico...
echo.

set "ICON_FLAG="
if exist "%~dp0app.ico" (
    set ICON_FLAG="/win32icon:%~dp0app.ico"
)

REM 1. Compile Main Desktop Application: AirCanvas.exe
"%CSC%" /target:winexe /out:AirCanvas.exe /win32manifest:app.manifest %ICON_FLAG% /main:AirCanvas.Program /optimize+ /platform:anycpu /r:System.Drawing.dll /r:System.Windows.Forms.dll AirCanvasServer.cs AirCanvasDesktop.cs

REM 2. Compile Dedicated Console Diagnostic Server: AirCanvasServer.exe
"%CSC%" /target:exe /out:AirCanvasServer.exe /win32manifest:app.manifest %ICON_FLAG% /main:AirCanvas.Server.AirCanvasServer /optimize+ /platform:anycpu /r:System.Drawing.dll AirCanvasServer.cs

REM Keep AirCanvasApp.exe synchronized
if exist AirCanvas.exe (
    copy /y AirCanvas.exe AirCanvasApp.exe >nul
)

if %ERRORLEVEL% EQU 0 (
    echo.
    echo =======================================================================
    echo [SUCCESS] AirCanvas.exe and AirCanvasServer.exe compiled successfully!
    echo Logo/icon app.ico and PerMonitorV2 manifest embedded into both files!
    echo =======================================================================
    echo.
    echo Double-click 'AirCanvas.exe' to launch the Air Canvas Desktop Studio.
) else (
    echo.
    echo [ERROR] Build failed with exit code %ERRORLEVEL%.
    pause
)
endlocal
