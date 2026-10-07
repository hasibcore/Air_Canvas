@echo off
:: AIRCanvas Windows Firewall Rule Setup
:: Grants permission for TCP Port 9090 and ADB reverse connections
echo Configuring Windows Defender Firewall for AIRCanvas Server (Port 9090)...
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [REQUESTING ADMIN PRIVILEGES]
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

netsh advfirewall firewall delete rule name="AIRCanvas Server Port 9090" >nul 2>&1
netsh advfirewall firewall add rule name="AIRCanvas Server Port 9090" dir=in action=allow protocol=TCP localport=9090 profile=any
netsh advfirewall firewall add rule name="AIRCanvas Server App" dir=in action=allow program="%~dp0AirCanvas.exe" enable=yes profile=any

echo.
echo ===================================================================
echo [SUCCESS] Windows Defender Firewall configured for AIRCanvas!
echo Inbound TCP Port 9090 is allowed across Private, Domain, and Public.
echo ===================================================================
timeout /t 3 >nul
