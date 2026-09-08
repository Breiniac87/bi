#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
PROJECT_ROOT="$( cd "$DIR/.." >/dev/null 2>&1 && pwd )"
STAGE_DIR="$PROJECT_ROOT/dist_macos/E-Commerce-Dashboard-macOS"
APP_BUNDLE_NAME="E-Commerce Dashboard.app"
APP_BUNDLE_PATH="$DIR/$APP_BUNDLE_NAME"
STAGE_APP_PATH="$STAGE_DIR/$APP_BUNDLE_NAME"
RELEASE_DIR="$PROJECT_ROOT/release_macos"

echo "=========================================================="
echo "  Сборка нативной версии E-Commerce Dashboard для macOS"
echo "  Платформа: $(uname -s) $(uname -m)"
echo "=========================================================="

# 1. Проверка наличия необходимых инструментов
if ! command -v node >/dev/null 2>&1; then
    echo "[ОШИБКА] Node.js не найден в системе. Установите Node.js 18+ с https://nodejs.org"
    exit 1
fi

if ! command -v clang >/dev/null 2>&1; then
    echo "[ОШИБКА] Apple Clang не найден. Установите Xcode Command Line Tools: xcode-select --install"
    exit 1
fi

PYTHON_CMD="python3"
if [ -x "$PROJECT_ROOT/venv/bin/python3" ]; then
    PYTHON_CMD="$PROJECT_ROOT/venv/bin/python3"
fi

# Определение версии приложения
APP_VERSION="1.0.2"
if [ -f "$PROJECT_ROOT/frontend/package.json" ]; then
    APP_VERSION=$(node -p "require('$PROJECT_ROOT/frontend/package.json').version || '1.0.2'")
fi
echo "Версия приложения: $APP_VERSION"

# 2. Очистка и создание структуры папок
echo "--- [1/6] Подготовка папок дистрибутива ---"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"
mkdir -p "$RELEASE_DIR"

# Функция сборки единого .app бандла
assemble_app_bundle() {
    local TARGET_APP="$1"
    rm -rf "$TARGET_APP"
    mkdir -p "$TARGET_APP/Contents/MacOS"
    mkdir -p "$TARGET_APP/Contents/Resources"
    mkdir -p "$TARGET_APP/Contents/Resources/app"
    mkdir -p "$TARGET_APP/Contents/Resources/etl"
    mkdir -p "$TARGET_APP/Contents/Resources/data/ads"
    mkdir -p "$TARGET_APP/Contents/Resources/data/sales"

    # Info.plist
    cp "$DIR/Info.plist" "$TARGET_APP/Contents/Info.plist"
    # Замена версии в Info.plist
    sed -i '' "s/[0-9]\{1,\}\.[0-9]\{1,\}\.[0-9]\{1,\}/$APP_VERSION/g" "$TARGET_APP/Contents/Info.plist" 2>/dev/null || true

    # Иконка
    if [ -f "$DIR/AppIcon.icns" ]; then
        cp "$DIR/AppIcon.icns" "$TARGET_APP/Contents/Resources/AppIcon.icns"
    fi

    # Исполняемый файл лаунчера
    cp "$DIR/E-Commerce Dashboard" "$TARGET_APP/Contents/MacOS/E-Commerce Dashboard"
    chmod +x "$TARGET_APP/Contents/MacOS/E-Commerce Dashboard"

    # Next.js Standalone (копируем все файлы включая скрытую папку .next и статику через скрипт)
    node "$PROJECT_ROOT/scripts/assemble_app.js" "$TARGET_APP/Contents/Resources/app"

    # ETL движок (бинарник и скрипт)
    if [ -d "$PROJECT_ROOT/dist/sync_local_to_sqlite" ]; then
        mkdir -p "$TARGET_APP/Contents/Resources/etl/sync_local_to_sqlite"
        cp -R "$PROJECT_ROOT/dist/sync_local_to_sqlite/"* "$TARGET_APP/Contents/Resources/etl/sync_local_to_sqlite/"
        chmod +x "$TARGET_APP/Contents/Resources/etl/sync_local_to_sqlite/sync_local_to_sqlite"
    fi
    if [ -f "$PROJECT_ROOT/sync_local_to_sqlite.py" ]; then
        cp "$PROJECT_ROOT/sync_local_to_sqlite.py" "$TARGET_APP/Contents/Resources/etl/sync_local_to_sqlite.py"
    fi

    # Автономный рантайм Node.js
    if [ -x "$DIR/node" ]; then
        cp "$DIR/node" "$TARGET_APP/Contents/Resources/node"
        chmod +x "$TARGET_APP/Contents/Resources/node"
    elif command -v node >/dev/null 2>&1; then
        cp "$(command -v node)" "$TARGET_APP/Contents/Resources/node"
        chmod +x "$TARGET_APP/Contents/Resources/node"
    fi

    # Начальная пустая база данных (чистая структура таблиц без строк) и чистый конфиг для релиза
    PYTHONPATH="$PROJECT_ROOT" "$PYTHON_CMD" -c "import sync_local_to_sqlite; sync_local_to_sqlite.init_db('$TARGET_APP/Contents/Resources/data/dashboard.db')"
    cat <<EOF > "$TARGET_APP/Contents/Resources/data/config.json"
{
  "ads_dir": "",
  "sales_dir": ""
}
EOF
}

# 3. Иконка .icns
echo "--- [2/6] Проверка и подготовка macOS иконки (.icns) ---"
if [ ! -f "$DIR/AppIcon.icns" ]; then
    ICON_SRC="$PROJECT_ROOT/frontend/src/app/icon.png"
    if [ -f "$ICON_SRC" ]; then
        ICONSET_TMP="/tmp/dashboard_icon_build.iconset"
        mkdir -p "$ICONSET_TMP"
        sips -z 16 16     "$ICON_SRC" --out "$ICONSET_TMP/icon_16x16.png" >/dev/null
        sips -z 32 32     "$ICON_SRC" --out "$ICONSET_TMP/icon_16x16@2x.png" >/dev/null
        sips -z 32 32     "$ICON_SRC" --out "$ICONSET_TMP/icon_32x32.png" >/dev/null
        sips -z 64 64     "$ICON_SRC" --out "$ICONSET_TMP/icon_32x32@2x.png" >/dev/null
        sips -z 128 128   "$ICON_SRC" --out "$ICONSET_TMP/icon_128x128.png" >/dev/null
        sips -z 256 256   "$ICON_SRC" --out "$ICONSET_TMP/icon_128x128@2x.png" >/dev/null
        sips -z 256 256   "$ICON_SRC" --out "$ICONSET_TMP/icon_256x256.png" >/dev/null
        sips -z 512 512   "$ICON_SRC" --out "$ICONSET_TMP/icon_256x256@2x.png" >/dev/null
        sips -z 512 512   "$ICON_SRC" --out "$ICONSET_TMP/icon_512x512.png" >/dev/null
        sips -z 1024 1024 "$ICON_SRC" --out "$ICONSET_TMP/icon_512x512@2x.png" >/dev/null
        iconutil -c icns "$ICONSET_TMP" -o "$DIR/AppIcon.icns"
        rm -rf "$ICONSET_TMP"
    fi
fi
echo "[OK] Иконка AppIcon.icns готова."

# 4. Компиляция Python ETL движка (PyInstaller)
echo "--- [3/6] Компиляция Python ETL движка (PyInstaller) ---"
cd "$PROJECT_ROOT"
"$PYTHON_CMD" -m pip install -r requirements.txt pyinstaller pillow --quiet
"$PYTHON_CMD" -m PyInstaller --noconfirm sync_local_to_sqlite.spec
echo "[OK] Автономный ETL движок собран в dist/sync_local_to_sqlite."

# 5. Сборка Next.js Standalone
echo "--- [4/6] Сборка Next.js Standalone сервера ---"
cd "$PROJECT_ROOT/frontend"
npm install
npm run build
echo "[OK] Next.js Standalone сервер успешно собран."

# 6. Компиляция нативного лаунчера
echo "--- [5/6] Компиляция нативного лаунчера (Cocoa + WebKit) ---"
cd "$DIR"
clang -O2 -framework Cocoa -framework WebKit launcher.m -o "$DIR/E-Commerce Dashboard"
echo "[OK] Исполняемый файл 'E-Commerce Dashboard' скомпилирован."

# 7. Формирование .app бандлов
echo "--- [6/6] Сборка и упаковка бандла приложения ---"
# Бандл прямо в папке macos/ для удобного запуска
assemble_app_bundle "$APP_BUNDLE_PATH"
echo "[OK] Создан бандл: $APP_BUNDLE_PATH"

# Бандл для дистрибутива в dist_macos/
assemble_app_bundle "$STAGE_APP_PATH"

# Копирование скриптов и руководства в папку дистрибутива
cp "$DIR/Запустить Дашборд.command" "$STAGE_DIR/"
cp "$DIR/Остановить.command" "$STAGE_DIR/"
cp "$DIR/launch.sh" "$STAGE_DIR/"
cp "$DIR/stop.sh" "$STAGE_DIR/"
if [ -f "$DIR/ИНСТРУКЦИЯ_MACOS.txt" ]; then
    cp "$DIR/ИНСТРУКЦИЯ_MACOS.txt" "$STAGE_DIR/"
fi

# Портативная папка данных в дистрибутиве с чистой пустой базой данных
mkdir -p "$STAGE_DIR/data/ads"
mkdir -p "$STAGE_DIR/data/sales"
PYTHONPATH="$PROJECT_ROOT" "$PYTHON_CMD" -c "import sync_local_to_sqlite; sync_local_to_sqlite.init_db('$STAGE_DIR/data/dashboard.db')"
cat <<EOF > "$STAGE_DIR/data/config.json"
{
  "ads_dir": "",
  "sales_dir": ""
}
EOF

# Права на исполнение
chmod +x "$APP_BUNDLE_PATH/Contents/MacOS/E-Commerce Dashboard"
chmod +x "$STAGE_APP_PATH/Contents/MacOS/E-Commerce Dashboard"
chmod +x "$DIR/"*.command "$DIR/"*.sh
chmod +x "$STAGE_DIR/"*.command "$STAGE_DIR/"*.sh

# Создание ZIP-архива
ZIP_NAME="E-Commerce-Dashboard-macOS-v${APP_VERSION}.zip"
ZIP_PATH="$RELEASE_DIR/$ZIP_NAME"
rm -f "$ZIP_PATH"
echo "Создание ZIP-архива: $ZIP_PATH ..."
cd "$PROJECT_ROOT/dist_macos"
ditto -c -k --sequesterRsrc --keepParent "E-Commerce-Dashboard-macOS" "$ZIP_PATH"

echo "=========================================================="
echo "  СБОРКА ДЛЯ macOS УСПЕШНО ЗАВЕРШЕНА!"
echo "=========================================================="
echo "1. Готовое приложение для запуска прямо сейчас:"
echo "   $APP_BUNDLE_PATH"
echo ""
echo "2. Папка автономного дистрибутива:"
echo "   $STAGE_DIR"
echo ""
echo "3. Релизный архив для передачи:"
echo "   $ZIP_PATH"
echo "=========================================================="
