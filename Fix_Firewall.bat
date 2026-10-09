@echo off
:: AIRCanvas Windows Firewall Rule Setup
:: Grants permission for TCP Port 9090, UDP 9091, Web Ports 3000-3050, and ADB reverse connections
title Air Canvas - Windows Firewall Unblocker
echo Configuring Windows Defender Firewall for AIRCanvas Server...
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [REQUESTING ADMIN PRIVILEGES]
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

netsh advfirewall firewall delete rule name="AIRCanvas Server Port 9090" >nul 2>&1
netsh advfirewall firewall add rule name="AIRCanvas Server Port 9090" dir=in action=allow protocol=TCP localport=9090 profile=any

netsh advfirewall firewall delete rule name="AIRCanvas Discovery Port 9091" >nul 2>&1
netsh advfirewall firewall add rule name="AIRCanvas Discovery Port 9091" dir=in action=allow protocol=UDP localport=9091 profile=any

netsh advfirewall firewall delete rule name="AIRCanvas Web Ports 3000-3050" >nul 2>&1
netsh advfirewall firewall add rule name="AIRCanvas Web Ports 3000-3050" dir=in action=allow protocol=TCP localport=3000-3050 profile=any

netsh advfirewall firewall delete rule name="AIRCanvas Server App" >nul 2>&1
netsh advfirewall firewall add rule name="AIRCanvas Server App" dir=in action=allow program="%~dp0AirCanvas.exe" enable=yes profile=any

netsh advfirewall firewall delete rule name="AIRCanvasServer App" >nul 2>&1
netsh advfirewall firewall add rule name="AIRCanvasServer App" dir=in action=allow program="%~dp0AirCanvasServer.exe" enable=yes profile=any

echo.
echo ===================================================================
echo [SUCCESS] Windows Defender Firewall configured for AIRCanvas!
echo Inbound TCP Port 9090, UDP Port 9091, and Web Ports 3000-3050
echo are fully allowed across all network profiles (Private and Public).
echo Both Wi-Fi, Ethernet, and USB connections can now connect seamlessly!
echo ===================================================================
timeout /t 4
