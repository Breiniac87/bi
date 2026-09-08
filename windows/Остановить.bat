@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Остановка E-Commerce Dashboard

set "DIR=%~dp0"
if "%DIR:~-1%"=="\" set "DIR=%DIR:~0,-1%"

echo ==========================================================
echo   Остановка E-Commerce Analytics Dashboard...
echo ==========================================================

:: 1. Остановка процессов, слушающих порт 3000
powershell -NoProfile -Command "$conns = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue; if ($conns) { foreach ($c in $conns) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue; Write-Host '✓ Завершен процесс порта 3000' } }"

:: 2. Остановка процессов node.exe, запущенных из нашей директории
powershell -NoProfile -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*%DIR%*' } | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue; Write-Host '✓ Завершен фоновый процесс Node.js' }"

:: 3. Очистка временных файлов PID если есть
if exist "%DIR%\data\server.pid" del /f /q "%DIR%\data\server.pid" >nul 2>&1
if exist "%APPDATA%\ECommerceDashboard\server.pid" del /f /q "%APPDATA%\ECommerceDashboard\server.pid" >nul 2>&1

echo.
echo [OK] Все компоненты дашборда успешно остановлены.
timeout /t 2 >nul
exit /b 0
