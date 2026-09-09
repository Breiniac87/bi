@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Сборка портативной версии E-Commerce Dashboard для Windows

set "DIR=%~dp0"
if "%DIR:~-1%"=="\" set "DIR=%DIR:~0,-1%"
set "PROJECT_ROOT=%DIR%\.."
set "STAGE_DIR=%PROJECT_ROOT%\dist_windows\E-Commerce-Dashboard-Portable"
set "RELEASE_DIR=%PROJECT_ROOT%\release_windows"

echo ==========================================================
echo   Сборка портативной (Portable) версии для Windows
echo   Папка: %STAGE_DIR%
echo ==========================================================

:: 1. Проверка наличия Node.js и Python
where node.exe >nul 2>&1
if errorlevel 1 (
    echo [ОШИБКА] Node.js не найден в системе. Установите Node.js 18+ с https://nodejs.org/
    pause
    exit /b 1
)

where python.exe >nul 2>&1
if errorlevel 1 (
    echo [ОШИБКА] Python не найден в системе. Установите Python 3.10+ с https://python.org/
    pause
    exit /b 1
)

:: Определение версии программы
set "APP_VERSION=1.0.4"
for /f "tokens=2 delims=:, " %%a in ('findstr /r "\"version\":" "%PROJECT_ROOT%\frontend\package.json"') do (
    set "RAW_VER=%%~a"
    set "APP_VERSION=!RAW_VER:"=!"
)

echo Версия приложения: %APP_VERSION%

:: 2. Очистка и создание структуры папок
if exist "%STAGE_DIR%" rmdir /s /q "%STAGE_DIR%"
if not exist "%RELEASE_DIR%" mkdir "%RELEASE_DIR%"
mkdir "%STAGE_DIR%\app"
mkdir "%STAGE_DIR%\etl"
mkdir "%STAGE_DIR%\data\ads"
mkdir "%STAGE_DIR%\data\sales"

:: 3. Подготовка шаблонов базы данных и конфигурации
echo --- [1/6] Инициализация шаблона базы данных SQLite ---
python -c "import sync_local_to_sqlite; sync_local_to_sqlite.init_db(r'%STAGE_DIR%\template.db')"
copy /y "%STAGE_DIR%\template.db" "%STAGE_DIR%\data\dashboard.db" >nul

(
    echo {
    echo   "ads_dir": "",
    echo   "sales_dir": ""
    echo }
) > "%STAGE_DIR%\template_config.json"
copy /y "%STAGE_DIR%\template_config.json" "%STAGE_DIR%\data\config.json" >nul
echo [OK] Шаблоны и изолированная папка data\ подготовлены.

:: 4. Сборка Python ETL
echo --- [2/6] Компиляция Python ETL движка (PyInstaller) ---
cd /d "%PROJECT_ROOT%"
python -m pip install -r requirements.txt pyinstaller pillow --quiet
pyinstaller --noconfirm sync_local_to_sqlite.spec
if errorlevel 1 (
    echo [ОШИБКА] Ошибка при сборке PyInstaller.
    pause
    exit /b 1
)

mkdir "%STAGE_DIR%\etl\sync_local_to_sqlite"
xcopy /e /i /y "%PROJECT_ROOT%\dist\sync_local_to_sqlite\*" "%STAGE_DIR%\etl\sync_local_to_sqlite\" >nul
echo [OK] Автономный ETL движок упакован.

:: 5. Сборка Next.js Standalone сервера
echo --- [3/6] Сборка Next.js Standalone сервера ---
cd /d "%PROJECT_ROOT%\frontend"
call npm install
call npm run build
if errorlevel 1 (
    echo [ОШИБКА] Ошибка при сборке Next.js.
    pause
    exit /b 1
)

echo Упаковка Standalone сервера и статических ассетов (CSS/JS)...
cd /d "%PROJECT_ROOT%"
call node "%PROJECT_ROOT%\scripts\assemble_app.js" "%STAGE_DIR%\app"
if errorlevel 1 (
    echo [ОШИБКА] Ошибка при компоновке приложения Next.js.
    pause
    exit /b 1
)
echo [OK] Next.js Standalone собран с полным комплектом стилей и ассетов.

:: 6. Упаковка рантайма node.exe
echo --- [4/6] Упаковка автономного node.exe ---
for /f "delims=" %%I in ('where node.exe') do (
    if not exist "%STAGE_DIR%\node.exe" copy /y "%%I" "%STAGE_DIR%\node.exe" >nul
)
if not exist "%STAGE_DIR%\node.exe" (
    echo Загрузка официального node.exe x64...
    powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.18.0/win-x64/node.exe' -OutFile '%STAGE_DIR%\node.exe'"
)
echo [OK] Рантайм Node.js упакован в корень приложения.

:: 7. Компиляция нативного лаунчера E-Commerce Dashboard.exe
echo --- [5/6] Компиляция нативного лаунчера (E-Commerce Dashboard.exe) ---
set "LAUNCHER_COMPILED=0"
where cl.exe >nul 2>&1
if not errorlevel 1 (
    echo Компиляция через MSVC cl.exe...
    rc.exe /fo "%DIR%\app_icon.res" "%DIR%\app_icon.rc" >nul 2>&1
    cl.exe /O2 /W3 /DUNICODE /D_UNICODE "%DIR%\launcher.c" "%DIR%\app_icon.res" /Fe:"%STAGE_DIR%\E-Commerce Dashboard.exe" user32.lib shell32.lib wininet.lib shlwapi.lib /link /SUBSYSTEM:WINDOWS >nul 2>&1
    if exist "%STAGE_DIR%\E-Commerce Dashboard.exe" set "LAUNCHER_COMPILED=1"
)

if "%LAUNCHER_COMPILED%"=="0" (
    where gcc.exe >nul 2>&1
    if not errorlevel 1 (
        echo Компиляция через GCC MinGW...
        windres "%DIR%\app_icon.rc" -O coff -o "%DIR%\app_icon.res" >nul 2>&1
        gcc -O2 -mwindows "%DIR%\launcher.c" "%DIR%\app_icon.res" -o "%STAGE_DIR%\E-Commerce Dashboard.exe" -luser32 -lshell32 -lwininet -lshlwapi >nul 2>&1
        if exist "%STAGE_DIR%\E-Commerce Dashboard.exe" set "LAUNCHER_COMPILED=1"
    )
)

if "%LAUNCHER_COMPILED%"=="1" (
    echo [OK] Исполняемый файл 'E-Commerce Dashboard.exe' успешно создан.
) else (
    echo [ПРЕДУПРЕЖДЕНИЕ] Компилятор C/C++ не обнаружен. Будет использоваться стартовый скрипт 'Запустить Дашборд.bat'.
)

:: Копирование стартовых скриптов, памятки и иконки
copy /y "%DIR%\Запустить Дашборд.bat" "%STAGE_DIR%\Запустить Дашборд.bat" >nul
copy /y "%DIR%\Остановить.bat" "%STAGE_DIR%\Остановить.bat" >nul
copy /y "%DIR%\ИНСТРУКЦИЯ.txt" "%STAGE_DIR%\ИНСТРУКЦИЯ.txt" >nul
copy /y "%DIR%\app_icon.ico" "%STAGE_DIR%\app_icon.ico" >nul

:: 8. Упаковка в ZIP-архив
echo --- [6/6] Создание ZIP-архива для удобной передачи ---
python "%PROJECT_ROOT%\scripts\make_portable_zip.py" "%STAGE_DIR%" "%ZIP_PATH%"


echo ==========================================================
echo   СБОРКА ПОРТАТИВНОЙ ВЕРСИИ УСПЕШНО ЗАВЕРШЕНА!
echo ==========================================================
echo Готовая папка приложения:
echo   %STAGE_DIR%
echo.
echo Архив для передачи:
echo   %ZIP_PATH%
echo.
echo Для запуска дважды кликните на "E-Commerce Dashboard.exe"
echo или "Запустить Дашборд.bat" внутри готовой папки.
echo ==========================================================

pause
exit /b 0
