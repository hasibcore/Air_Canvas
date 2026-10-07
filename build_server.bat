@echo off
setlocal
echo =======================================================================
echo          Air Canvas Windows Native Server Compiler (DPI Aware)
echo =======================================================================
echo.

:: Locate .NET Framework csc.exe compiler
set CSC=""
if exist "%windir%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" (
    set CSC="%windir%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
) else if exist "%windir%\Microsoft.NET\Framework\v4.0.30319\csc.exe" (
    set CSC="%windir%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)

if %CSC%=="" (
    echo [ERROR] .NET Framework 4.0/4.5+ compiler (csc.exe) not found.
    echo Please install .NET Framework or Visual Studio Build Tools.
    pause
    exit /b 1
)

echo Found C# Compiler: %CSC%
echo Compiling AirCanvasServer.cs with PerMonitorV2 manifest...
echo.

%CSC% /target:exe /out:AirCanvasServer.exe /win32manifest:app.manifest /optimize+ /platform:anycpu /r:System.Drawing.dll AirCanvasServer.cs

if %ERRORLEVEL% EQU 0 (
    echo.
    echo =======================================================================
    echo [SUCCESS] AirCanvasServer.exe compiled successfully!
    echo PerMonitorV2 manifest embedded: DPI scaling offset is permanently resolved.
    echo =======================================================================
    echo.
    echo Launching AirCanvasServer.exe in diagnostic test mode...
    AirCanvasServer.exe
) else (
    echo.
    echo [ERROR] Build failed with exit code %ERRORLEVEL%.
    pause
)
endlocal
