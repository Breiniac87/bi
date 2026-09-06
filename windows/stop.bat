@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

set "APP_DATA_DIR=%APPDATA%\ECommerceDashboard"
set "PORT_FILE=%APP_DATA_DIR%\server.port"

echo Остановка E-Commerce Dashboard...

if exist "%PORT_FILE%" (
    set /p PORT=<"%PORT_FILE%"
    set "PORT=!PORT: =!"
    if defined PORT (
        echo Отправка команды выключения на http://127.0.0.1:!PORT!/api/shutdown...
        powershell -NoProfile -Command "try { Invoke-RestMethod -Uri 'http://127.0.0.1:!PORT!/api/shutdown' -Method Post -TimeoutSec 2 } catch {}"
        timeout /t 1 /nobreak >nul
        powershell -NoProfile -Command "$conns = Get-NetTCPConnection -LocalPort !PORT! -State Listen -ErrorAction SilentlyContinue; if ($conns) { foreach ($c in $conns) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue } }"
    )
)

powershell -NoProfile -Command "$conns = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue; if ($conns) { foreach ($c in $conns) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue } }"

if exist "%APP_DATA_DIR%\server.pid" del /f /q "%APP_DATA_DIR%\server.pid" >nul 2>&1
if exist "%APP_DATA_DIR%\server.port" del /f /q "%APP_DATA_DIR%\server.port" >nul 2>&1

echo Сервер остановлен.
pause
