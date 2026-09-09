@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title E-Commerce Analytics Dashboard

set "DIR=%~dp0"
if "%DIR:~-1%"=="\" set "DIR=%DIR:~0,-1%"
set "PROJECT_ROOT=%DIR%\.."

:: Определение рабочей папки данных (приоритет — папка data\ рядом со скриптом для portable-режима)
if exist "%DIR%\data" (
    set "APP_DATA_DIR=%DIR%\data"
) else (
    mkdir "%DIR%\data" >nul 2>&1
    if exist "%DIR%\data" (
        set "APP_DATA_DIR=%DIR%\data"
    ) else (
        set "APP_DATA_DIR=%APPDATA%\ECommerceDashboard"
        if not exist "!APP_DATA_DIR!" mkdir "!APP_DATA_DIR!"
    )
)

if not exist "%APP_DATA_DIR%\ads" mkdir "%APP_DATA_DIR%\ads"
if not exist "%APP_DATA_DIR%\sales" mkdir "%APP_DATA_DIR%\sales"
set "LOG_FILE=%APP_DATA_DIR%\server.log"

echo ==========================================================
echo   Запуск E-Commerce Analytics Dashboard (Portable)
echo ==========================================================
echo [%DATE% %TIME%] Запуск приложения >> "%LOG_FILE%"

:: 1. Поиск исполняемого файла node.exe
set "NODE_BIN="
if exist "%DIR%\node.exe" (
    set "NODE_BIN=%DIR%\node.exe"
) else if exist "%PROJECT_ROOT%\node.exe" (
    set "NODE_BIN=%PROJECT_ROOT%\node.exe"
) else (
    where node.exe >nul 2>&1
    if not errorlevel 1 (
        for /f "delims=" %%I in ('where node.exe') do (
            if not defined NODE_BIN set "NODE_BIN=%%I"
        )
    )
)

if not defined NODE_BIN (
    echo [ОШИБКА] Рантайм Node.js (node.exe) не найден!
    echo Убедитесь, что архив приложения распакован полностью.
    pause
    exit /b 1
)

:: 2. Инициализация рабочей базы данных и конфигурации
set "USER_DB=%APP_DATA_DIR%\dashboard.db"
set "USER_CFG=%APP_DATA_DIR%\config.json"

if not exist "%USER_DB%" (
    if exist "%DIR%\template.db" (
        copy /y "%DIR%\template.db" "%USER_DB%" >nul
    ) else if exist "%PROJECT_ROOT%\dashboard.db" (
        copy /y "%PROJECT_ROOT%\dashboard.db" "%USER_DB%" >nul
    )
)

if not exist "%USER_CFG%" (
    if exist "%DIR%\template_config.json" (
        copy /y "%DIR%\template_config.json" "%USER_CFG%" >nul
    ) else (
        (
            echo {
            echo   "ads_dir": "",
            echo   "sales_dir": ""
            echo }
        ) > "%USER_CFG%"
    )
)

set "DATABASE_PATH=%USER_DB%"
set "CONFIG_PATH=%USER_CFG%"
set "PORT=3000"
set "HOSTNAME=127.0.0.1"
set "NODE_ENV=production"

if exist "%DIR%\etl\sync_local_to_sqlite\sync_local_to_sqlite.exe" (
    set "ETL_BIN_PATH=%DIR%\etl\sync_local_to_sqlite\sync_local_to_sqlite.exe"
) else if exist "%PROJECT_ROOT%\dist\sync_local_to_sqlite\sync_local_to_sqlite.exe" (
    set "ETL_BIN_PATH=%PROJECT_ROOT%\dist\sync_local_to_sqlite\sync_local_to_sqlite.exe"
)

:: 3. Проверка, запущен ли уже сервер
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3000' -UseBasicParsing -TimeoutSec 1; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
if not errorlevel 1 (
    echo Сервер уже запущен. Открываем окно приложения...
    goto :OPEN_BROWSER
)

:: 4. Запуск сервера Next.js в фоне
echo Запуск локального сервера на порту 3000...
if exist "%DIR%\app\server.js" (
    cd /d "%DIR%\app"
    start "E-Commerce-Server" /MIN "%NODE_BIN%" server.js >> "%APP_DATA_DIR%\server.log" 2>&1
) else if exist "%PROJECT_ROOT%\frontend\.next\standalone\server.js" (
    if not exist "%PROJECT_ROOT%\frontend\.next\standalone\.next\static" (
        if exist "%PROJECT_ROOT%\frontend\.next\static" (
            xcopy /e /i /y "%PROJECT_ROOT%\frontend\.next\static" "%PROJECT_ROOT%\frontend\.next\standalone\.next\static" >nul 2>&1
        )
    )
    if not exist "%PROJECT_ROOT%\frontend\.next\standalone\public" (
        if exist "%PROJECT_ROOT%\frontend\public" (
            xcopy /e /i /y "%PROJECT_ROOT%\frontend\public" "%PROJECT_ROOT%\frontend\.next\standalone\public" >nul 2>&1
        )
    )
    cd /d "%PROJECT_ROOT%\frontend\.next\standalone"
    start "E-Commerce-Server" /MIN "%NODE_BIN%" server.js >> "%APP_DATA_DIR%\server.log" 2>&1
) else (
    cd /d "%PROJECT_ROOT%\frontend"
    start "E-Commerce-Server" /MIN npm run dev -- -p 3000 -H 127.0.0.1 >> "%APP_DATA_DIR%\server.log" 2>&1
)

:: 5. Ожидание готовности сервера
echo Ожидание ответа сервера...
powershell -NoProfile -Command "$ready = $false; for ($i=0; $i -lt 40; $i++) { try { $res = Invoke-WebRequest -Uri 'http://127.0.0.1:3000' -UseBasicParsing -TimeoutSec 1; if ($res.StatusCode -eq 200) { $ready = $true; break } } catch { Start-Sleep -Milliseconds 500 } }; if (-not $ready) { exit 1 }"

:OPEN_BROWSER
:: 6. Открытие окна программы через Microsoft Edge в режиме приложения
set "APP_URL=http://127.0.0.1:3000"
set "BROWSER_EXE="

if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
) else if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
) else if exist "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER_EXE=%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"
) else if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
)

echo [OK] Запуск окна приложения...

if defined BROWSER_EXE (
    start "" "%BROWSER_EXE%" --app="%APP_URL%" --user-data-dir="%APP_DATA_DIR%\EdgeProfile"
) else (
    start "" "%APP_URL%"
)

echo Приложение запущено.
exit /b 0
