#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$DIR/.." && pwd)"
RELEASE_DIR="$PROJECT_ROOT/release_macos_m1"
APP_NAME="E-Commerce Dashboard.app"
TEMP_BUILD_DIR="/tmp/clean_app_stage_$$"
APP_TARGET="$TEMP_BUILD_DIR/$APP_NAME"

echo "=========================================================="
echo "  Подготовка чистого дистрибутива для macOS (M1 Apple Silicon)"
echo "  Целевая папка: $RELEASE_DIR"
echo "=========================================================="

# 1. Проверка архитектуры
ARCH=$(uname -m)
echo "Текущая архитектура сборщика: $ARCH"
if [ "$ARCH" != "arm64" ]; then
  echo "ВНИМАНИЕ: Сборка выполняется не на arm64 ($ARCH). Для M1 требуется arm64."
fi

# 2. Создание папки релиза
rm -rf "$RELEASE_DIR"/* 2>/dev/null || true
mkdir -p "$RELEASE_DIR"

# 3. Создание чистой базы-шаблона template.db (0 строк, полная схема)
echo "--- [1/6] Создание чистой схемы базы данных template.db ---"
CLEAN_DB="$PROJECT_ROOT/clean_template.db"
rm -f "$CLEAN_DB"

# Извлекаем схему из существующей базы без внутренней таблицы sqlite_sequence
sqlite3 "$DIR/../dashboard.db" ".schema" | grep -v "sqlite_sequence" | sqlite3 "$CLEAN_DB"
sqlite3 "$CLEAN_DB" "PRAGMA journal_mode = DELETE; VACUUM;"

ROWS_MERGED=$(sqlite3 "$CLEAN_DB" "SELECT count(*) FROM merged_data;")
ROWS_ADS=$(sqlite3 "$CLEAN_DB" "SELECT count(*) FROM ads;")
ROWS_SALES=$(sqlite3 "$CLEAN_DB" "SELECT count(*) FROM sales;")
ROWS_FILES=$(sqlite3 "$CLEAN_DB" "SELECT count(*) FROM processed_files;")

if [ "$ROWS_MERGED" -ne 0 ] || [ "$ROWS_ADS" -ne 0 ] || [ "$ROWS_SALES" -ne 0 ] || [ "$ROWS_FILES" -ne 0 ]; then
  echo "ОШИБКА: Чистая база содержит данные (merged: $ROWS_MERGED, ads: $ROWS_ADS, sales: $ROWS_SALES, files: $ROWS_FILES)!"
  exit 1
fi
echo "✓ Чистая база гарантированно пуста (merged: 0, ads: 0, sales: 0, files: 0, размер: $(du -sh "$CLEAN_DB" | cut -f1))"

# 4. Создание чистого шаблона конфигурации
CLEAN_CFG="$PROJECT_ROOT/clean_template_config.json"
cat << 'EOF' > "$CLEAN_CFG"
{
  "ads_dir": "",
  "sales_dir": ""
}
EOF
echo "✓ Чистый шаблон конфигурации готов"

# 5. Поиск рантайма Node.js (arm64)
NODE_SRC=""
if [ -x "$DIR/../E-Commerce Dashboard.app/Contents/MacOS/node" ]; then
  NODE_SRC="$DIR/../E-Commerce Dashboard.app/Contents/MacOS/node"
elif command -v node >/dev/null 2>&1; then
  NODE_SRC=$(command -v node)
fi

if [ -z "$NODE_SRC" ] || [ ! -x "$NODE_SRC" ]; then
  echo "ОШИБКА: Исполняемый файл node не найден!"
  exit 1
fi
echo "✓ Node.js рантайм: $NODE_SRC ($("$NODE_SRC" -v))"

# 6. Сборка Standalone версии Next.js
echo "--- [2/6] Сборка Next.js Standalone фронтенда ---"
cd "$PROJECT_ROOT/frontend"
rm -rf .next
npm run build
STANDALONE_SRC="$PROJECT_ROOT/frontend/.next/standalone"

# Убедимся, что статика скопирована
mkdir -p "$STANDALONE_SRC/.next/static"
cp -R "$PROJECT_ROOT/frontend/.next/static/"* "$STANDALONE_SRC/.next/static/" 2>/dev/null || true
if [ -d "$PROJECT_ROOT/frontend/public" ]; then
  mkdir -p "$STANDALONE_SRC/public"
  cp -R "$PROJECT_ROOT/frontend/public/"* "$STANDALONE_SRC/public/" 2>/dev/null || true
fi

# 7. Проверка ETL бинарника (arm64)
echo "--- [3/6] Проверка автономного Python ETL ---"
ETL_SRC="$PROJECT_ROOT/dist/sync_local_to_sqlite"
if [ ! -x "$ETL_SRC/sync_local_to_sqlite" ]; then
  echo "Сборка Python ETL через PyInstaller..."
  cd "$PROJECT_ROOT"
  ./venv/bin/pyinstaller --noconfirm sync_local_to_sqlite.spec
fi

# 8. Сборка структуры бандла .app
echo "--- [4/6] Сборка E-Commerce Dashboard.app ---"
mkdir -p "$APP_TARGET/Contents/MacOS"
mkdir -p "$APP_TARGET/Contents/Resources/app"
mkdir -p "$APP_TARGET/Contents/Resources/etl"

# Info.plist
cat << 'EOF' > "$APP_TARGET/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>ru</string>
    <key>CFBundleDisplayName</key>
    <string>E-Commerce Dashboard</string>
    <key>CFBundleExecutable</key>
    <string>launcher</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundleIdentifier</key>
    <string>com.ecommerce.analytics.dashboard</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>E-Commerce Dashboard</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>LSMinimumSystemVersion</key>
    <string>11.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>LSUIElement</key>
    <false/>
</dict>
</plist>
EOF

echo -n "APPL????" > "$APP_TARGET/Contents/PkgInfo"

# Упаковка Node.js
cp "$NODE_SRC" "$APP_TARGET/Contents/MacOS/node"
chmod +x "$APP_TARGET/Contents/MacOS/node"

# Компиляция лаунчера
clang -O2 "$PROJECT_ROOT/scripts/launcher.c" -o "$APP_TARGET/Contents/MacOS/launcher"
chmod +x "$APP_TARGET/Contents/MacOS/launcher"

# Ресурсы
cp "$PROJECT_ROOT/scripts/AppIcon.icns" "$APP_TARGET/Contents/Resources/AppIcon.icns"
cp "$PROJECT_ROOT/scripts/launch.sh" "$APP_TARGET/Contents/Resources/launch.sh"
chmod +x "$APP_TARGET/Contents/Resources/launch.sh"
cp "$PROJECT_ROOT/scripts/stop.sh" "$APP_TARGET/Contents/Resources/stop.sh"
chmod +x "$APP_TARGET/Contents/Resources/stop.sh"

# Чистые шаблоны
cp "$CLEAN_DB" "$APP_TARGET/Contents/Resources/template.db"
cp "$CLEAN_CFG" "$APP_TARGET/Contents/Resources/template_config.json"

# Next.js сервер
cp -R "$STANDALONE_SRC/." "$APP_TARGET/Contents/Resources/app/"
cp -R "$PROJECT_ROOT/frontend/.next/static" "$APP_TARGET/Contents/Resources/app/.next/static"
if [ -d "$PROJECT_ROOT/frontend/public" ]; then
  cp -R "$PROJECT_ROOT/frontend/public" "$APP_TARGET/Contents/Resources/app/public"
fi

# ETL движок
cp -R "$ETL_SRC" "$APP_TARGET/Contents/Resources/etl/"
chmod +x "$APP_TARGET/Contents/Resources/etl/sync_local_to_sqlite/sync_local_to_sqlite"

# Подпись приложения
xattr -cr "$APP_TARGET" 2>/dev/null || true
codesign --force --deep --sign - "$APP_TARGET"
touch "$APP_TARGET"

echo "✓ Чистый бандл приложения создан в промежуточной области (размер: $(du -sh "$APP_TARGET" | cut -f1))"

# 9. Создание профессионального DMG установщика
echo "--- [5/5] Сборка нативного macOS DMG установщика ---"
mkdir -p "$RELEASE_DIR"
rm -rf "$RELEASE_DIR"/* 2>/dev/null || true

"$PROJECT_ROOT/scripts/create_dmg.sh" "$APP_TARGET"

# Очистка временных файлов сборщика
echo "Очистка временных сборочных файлов..."
rm -rf "$TEMP_BUILD_DIR"
rm -f "$CLEAN_DB" "$CLEAN_CFG"

# Гарантируем, что в папке релиза строго только DMG файл и ничего лишнего
find "$RELEASE_DIR" -mindepth 1 ! -name "E-Commerce-Dashboard-M1.dmg" ! -name ".*" -exec rm -rf {} + 2>/dev/null || true

echo "=========================================================="
echo "  СБОРКА ЧИСТОГО РЕЛИЗА ДЛЯ M1 УСПЕШНО ЗАВЕРШЕНА!"
echo "  В папке $RELEASE_DIR создан ИСКЛЮЧИТЕЛЬНО DMG файл:"
ls -lh "$RELEASE_DIR"
echo "=========================================================="
