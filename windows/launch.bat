@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title E-Commerce Analytics Dashboard

set "DIR=%~dp0"
if "%DIR:~-1%"=="\" set "DIR=%DIR:~0,-1%"
set "PROJECT_ROOT=%DIR%\.."

set "APP_DATA_DIR=%APPDATA%\ECommerceDashboard"
if not exist "%APP_DATA_DIR%" mkdir "%APP_DATA_DIR%"
set "LOG_FILE=%APP_DATA_DIR%\launch.log"

echo ==========================================================
echo   Запуск E-Commerce Analytics Dashboard на Windows 10/11
echo ==========================================================
echo [%DATE% %TIME%] Запуск приложения через windows\launch.bat >> "%LOG_FILE%"

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
    echo.
    echo [ОШИБКА] Рантайм Node.js (node.exe) не найден!
    echo Установите Node.js 18+ или 20+ с официального сайта: https://nodejs.org/
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
    set "DEFAULT_DATA_DIR=%USERPROFILE%\Desktop\data"
    if not exist "!DEFAULT_DATA_DIR!\ads" mkdir "!DEFAULT_DATA_DIR!\ads"
    if not exist "!DEFAULT_DATA_DIR!\sales" mkdir "!DEFAULT_DATA_DIR!\sales"
    (
        echo {
        echo   "ads_dir": "!DEFAULT_DATA_DIR!\ads",
        echo   "sales_dir": "!DEFAULT_DATA_DIR!\sales"
        echo }
    ) > "%USER_CFG%"
)

set "DATABASE_PATH=%USER_DB%"
set "CONFIG_PATH=%USER_CFG%"

if exist "%DIR%\etl\sync_local_to_sqlite\sync_local_to_sqlite.exe" (
    set "ETL_BIN_PATH=%DIR%\etl\sync_local_to_sqlite\sync_local_to_sqlite.exe"
) else if exist "%PROJECT_ROOT%\dist\sync_local_to_sqlite\sync_local_to_sqlite.exe" (
    set "ETL_BIN_PATH=%PROJECT_ROOT%\dist\sync_local_to_sqlite\sync_local_to_sqlite.exe"
)

:: 3. Поиск свободного порта в диапазоне 3000-3020
set "PORT=3000"
for /f "usebackq tokens=*" %%P in (`powershell -NoProfile -Command "3000..3020 | Where-Object { $p = $_; -not (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) } | Select-Object -First 1"`) do (
    set "PORT=%%P"
)
if "%PORT%"=="" set "PORT=3000"
echo %PORT% > "%APP_DATA_DIR%\server.port"

:: 4. Запуск сервера Next.js
echo Запуск локального сервера на порту %PORT%...
set "HOSTNAME=127.0.0.1"

if exist "%DIR%\app\server.js" (
    cd /d "%DIR%\app"
    start "E-Commerce-Server" /B "%NODE_BIN%" server.js >> "%APP_DATA_DIR%\server.log" 2>&1
) else if exist "%PROJECT_ROOT%\frontend\.next\standalone\server.js" (
    cd /d "%PROJECT_ROOT%\frontend\.next\standalone"
    start "E-Commerce-Server" /B "%NODE_BIN%" server.js >> "%APP_DATA_DIR%\server.log" 2>&1
) else (
    cd /d "%PROJECT_ROOT%\frontend"
    start "E-Commerce-Server" /B npm run dev -- -p %PORT% -H 127.0.0.1 >> "%APP_DATA_DIR%\server.log" 2>&1
)

:: 5. Ожидание готовности сервера
echo Ожидание ответа сервера...
powershell -NoProfile -Command "$ready = $false; for ($i=0; $i -lt 30; $i++) { try { $res = Invoke-WebRequest -Uri 'http://127.0.0.1:%PORT%' -UseBasicParsing -TimeoutSec 1; if ($res.StatusCode -eq 200) { $ready = $true; break } } catch { Start-Sleep -Milliseconds 500 } }; if (-not $ready) { exit 1 }"

:: 6. Открытие окна программы через Microsoft Edge в режиме приложения
set "APP_URL=http://127.0.0.1:%PORT%"
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
    start /wait "" "%BROWSER_EXE%" --app="%APP_URL%" --user-data-dir="%APP_DATA_DIR%\EdgeProfile"
) else (
    start "" "%APP_URL%"
    exit /b 0
)

:: 7. Закрытие окна пользователем -> Остановка сервера
echo Окно закрыто пользователем. Остановка сервера...
powershell -NoProfile -Command "try { Invoke-RestMethod -Uri 'http://127.0.0.1:%PORT%/api/shutdown' -Method Post -TimeoutSec 2 } catch {}"
timeout /t 1 /nobreak >nul
powershell -NoProfile -Command "$conns = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue; if ($conns) { foreach ($c in $conns) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue } }"

echo Готово.
exit /b 0
