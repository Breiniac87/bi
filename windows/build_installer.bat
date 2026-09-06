@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Сборка установщика E-Commerce Dashboard для Windows

set "DIR=%~dp0"
if "%DIR:~-1%"=="\" set "DIR=%DIR:~0,-1%"
set "PROJECT_ROOT=%DIR%\.."
set "STAGE_DIR=%PROJECT_ROOT%\dist_windows"
set "RELEASE_DIR=%PROJECT_ROOT%\release_windows"

echo ==========================================================
echo   Сборка автономного дистрибутива Setup.exe для Windows
echo   Целевой файл: %RELEASE_DIR%\E-Commerce-Dashboard-Setup.exe
echo ==========================================================

:: 1. Проверка окружения
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

:: 2. Очистка и создание промежуточных папок
if exist "%STAGE_DIR%" rmdir /s /q "%STAGE_DIR%"
if exist "%RELEASE_DIR%" rmdir /s /q "%RELEASE_DIR%"
mkdir "%STAGE_DIR%"
mkdir "%RELEASE_DIR%"
mkdir "%STAGE_DIR%\app"
mkdir "%STAGE_DIR%\etl"

:: 3. Подготовка шаблонов
echo --- [1/5] Подготовка шаблонов template.db и template_config.json ---
python -c "import sync_local_to_sqlite; sync_local_to_sqlite.init_db(r'%STAGE_DIR%\template.db')"

(
    echo {
    echo   "ads_dir": "",
    echo   "sales_dir": ""
    echo }
) > "%STAGE_DIR%\template_config.json"
echo [OK] Шаблоны подготовлены.

:: 4. Сборка Python ETL
echo --- [2/5] Компиляция Python ETL движка (PyInstaller) ---
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
echo [OK] ETL движок упакован.

:: 5. Сборка Next.js Standalone
echo --- [3/5] Сборка Next.js Standalone сервера ---
cd /d "%PROJECT_ROOT%\frontend"
call npm install
call npm run build
if errorlevel 1 (
    echo [ОШИБКА] Ошибка при сборке Next.js.
    pause
    exit /b 1
)

xcopy /e /h /i /y "%PROJECT_ROOT%\frontend\.next\standalone\*" "%STAGE_DIR%\app\" >nul
mkdir "%STAGE_DIR%\app\.next\static"
xcopy /e /i /y "%PROJECT_ROOT%\frontend\.next\static\*" "%STAGE_DIR%\app\.next\static\" >nul
if exist "%PROJECT_ROOT%\frontend\public" (
    mkdir "%STAGE_DIR%\app\public"
    xcopy /e /i /y "%PROJECT_ROOT%\frontend\public\*" "%STAGE_DIR%\app\public\" >nul
)

:: Упаковка рантайма node.exe
echo Копирование бинарника node.exe...
for /f "delims=" %%I in ('where node.exe') do (
    if not exist "%STAGE_DIR%\node.exe" copy /y "%%I" "%STAGE_DIR%\node.exe" >nul
)

:: 6. Копирование скриптов запуска и иконки
echo --- [4/5] Упаковка лаунчеров и ассетов ---
copy /y "%DIR%\launch.bat" "%STAGE_DIR%\launch.bat" >nul
copy /y "%DIR%\launcher.vbs" "%STAGE_DIR%\launcher.vbs" >nul
copy /y "%DIR%\stop.bat" "%STAGE_DIR%\stop.bat" >nul
copy /y "%DIR%\app_icon.ico" "%STAGE_DIR%\app_icon.ico" >nul

echo [OK] Промежуточный бандл готов в %STAGE_DIR%.

:: 7. Компиляция Inno Setup
echo --- [5/5] Создание установщика Setup.exe через Inno Setup ---
set "ISCC_EXE="
where iscc.exe >nul 2>&1
if not errorlevel 1 (
    set "ISCC_EXE=iscc.exe"
) else if exist "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" (
    set "ISCC_EXE=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
) else if exist "%ProgramFiles%\Inno Setup 6\ISCC.exe" (
    set "ISCC_EXE=%ProgramFiles%\Inno Setup 6\ISCC.exe"
) else if exist "%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" (
    set "ISCC_EXE=%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"
)

if defined ISCC_EXE (
    echo Запуск компилятора Inno Setup: "%ISCC_EXE%"...
    "%ISCC_EXE%" /DSourceDir="%STAGE_DIR%" "%DIR%\installer.iss"
    if errorlevel 1 (
        echo [ОШИБКА] Сборка инсталлятора не удалась.
        pause
        exit /b 1
    )
    echo ==========================================================
    echo   СБОРКА УСПЕШНО ЗАВЕРШЕНА!
    echo   Готовый файл установщика:
    echo   %RELEASE_DIR%\E-Commerce-Dashboard-Setup.exe
    echo ==========================================================
) else (
    echo [ИНФОРМАЦИЯ] Inno Setup не установлен.
    echo Скачайте бесплатный Inno Setup 6 (https://jrsoftware.org/isdl.php),
    echo чтобы скомпилировать единый файл Setup.exe.
    echo Бандл приложения собран и готов к работе в папке: %STAGE_DIR%
)

pause
exit /b 0
