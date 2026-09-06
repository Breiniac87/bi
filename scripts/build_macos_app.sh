#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$DIR/.." && pwd)"
APP_NAME="E-Commerce Dashboard.app"
BUILD_DIR="$PROJECT_ROOT/$APP_NAME"
DESKTOP_DIR="$HOME/Desktop/$APP_NAME"

echo "=================================================="
echo "  Сборка автономного Standalone macOS приложения"
echo "  Цель: $APP_NAME"
echo "=================================================="

# 1. Поиск бинарника Node.js для встраивания в бандл
NODE_SRC=""
if command -v node >/dev/null 2>&1; then
  NODE_SRC=$(command -v node)
elif [ -d "$HOME/.nvm/versions/node" ]; then
  LATEST_NVM=$(ls -d "$HOME/.nvm/versions/node/"* 2>/dev/null | tail -n 1)
  if [ -x "$LATEST_NVM/bin/node" ]; then
    NODE_SRC="$LATEST_NVM/bin/node"
  fi
fi

if [ -z "$NODE_SRC" ] || [ ! -x "$NODE_SRC" ]; then
  echo "ОШИБКА: Исполняемый файл node не найден для упаковки!"
  exit 1
fi
echo "✓ Node.js найден: $NODE_SRC ($("$NODE_SRC" -v))"

# 2. Сборка Standalone версии Next.js фронтенда
echo "--- [1/5] Сборка Next.js (Standalone) ---"
cd "$PROJECT_ROOT/frontend"
npm run build

STANDALONE_SRC="$PROJECT_ROOT/frontend/.next/standalone"
if [ ! -d "$STANDALONE_SRC" ]; then
  echo "ОШИБКА: Директория standalone не создана. Проверьте frontend/next.config.ts"
  exit 1
fi

# Копируем статические ассеты, требуемые Next.js standalone
echo "Копирование статики (.next/static и public)..."
mkdir -p "$STANDALONE_SRC/.next/static"
cp -R "$PROJECT_ROOT/frontend/.next/static/"* "$STANDALONE_SRC/.next/static/" 2>/dev/null || true
if [ -d "$PROJECT_ROOT/frontend/public" ]; then
  mkdir -p "$STANDALONE_SRC/public"
  cp -R "$PROJECT_ROOT/frontend/public/"* "$STANDALONE_SRC/public/" 2>/dev/null || true
fi
echo "✓ Standalone Next.js готов (размер: $(du -sh "$STANDALONE_SRC" | cut -f1))"

# 3. Сборка / Проверка автономного бинарника Python ETL
echo "--- [2/5] Подготовка Python ETL движка ---"
cd "$PROJECT_ROOT"
if [ ! -f "$PROJECT_ROOT/dist/sync_local_to_sqlite/sync_local_to_sqlite" ] || [ "$PROJECT_ROOT/sync_local_to_sqlite.py" -nt "$PROJECT_ROOT/dist/sync_local_to_sqlite/sync_local_to_sqlite" ]; then
  echo "Компиляция sync_local_to_sqlite через PyInstaller..."
  ./venv/bin/pyinstaller --noconfirm sync_local_to_sqlite.spec
fi
echo "✓ Python ETL движок готов (размер: $(du -sh "$PROJECT_ROOT/dist/sync_local_to_sqlite" | cut -f1))"

# 4. Формирование структуры бандла .app
echo "--- [3/5] Создание структуры macOS App Bundle ---"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/Contents/MacOS"
mkdir -p "$BUILD_DIR/Contents/Resources/app"
mkdir -p "$BUILD_DIR/Contents/Resources/etl"

# Info.plist
cat << 'EOF' > "$BUILD_DIR/Contents/Info.plist"
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

# PkgInfo
echo -n "APPL????" > "$BUILD_DIR/Contents/PkgInfo"

# Упаковка Node.js бинарника в Contents/MacOS/
echo "Копирование рантайма Node.js..."
cp "$NODE_SRC" "$BUILD_DIR/Contents/MacOS/node"
chmod +x "$BUILD_DIR/Contents/MacOS/node"

# Компиляция нативного лаунчера
echo "Компиляция нативного лаунчера (Mach-O)..."
clang -O2 "$PROJECT_ROOT/scripts/launcher.c" -o "$BUILD_DIR/Contents/MacOS/launcher"
chmod +x "$BUILD_DIR/Contents/MacOS/launcher"

# Копирование ресурсов
if [ -f "$PROJECT_ROOT/scripts/AppIcon.icns" ]; then
  cp "$PROJECT_ROOT/scripts/AppIcon.icns" "$BUILD_DIR/Contents/Resources/AppIcon.icns"
fi
cp "$PROJECT_ROOT/scripts/launch.sh" "$BUILD_DIR/Contents/Resources/launch.sh"
chmod +x "$BUILD_DIR/Contents/Resources/launch.sh"
cp "$PROJECT_ROOT/scripts/stop.sh" "$BUILD_DIR/Contents/Resources/stop.sh"
chmod +x "$BUILD_DIR/Contents/Resources/stop.sh"

# Копирование шаблона базы данных и конфига
if [ -f "$PROJECT_ROOT/dashboard.db" ]; then
  cp "$PROJECT_ROOT/dashboard.db" "$BUILD_DIR/Contents/Resources/template.db"
fi
if [ -f "$PROJECT_ROOT/config.json" ]; then
  cp "$PROJECT_ROOT/config.json" "$BUILD_DIR/Contents/Resources/template_config.json"
fi

# Упаковка standalone фронтенда
echo "Упаковка веб-сервера..."
cp -R "$STANDALONE_SRC/." "$BUILD_DIR/Contents/Resources/app/"
cp -R "$PROJECT_ROOT/frontend/.next/static" "$BUILD_DIR/Contents/Resources/app/.next/static"
if [ -d "$PROJECT_ROOT/frontend/public" ]; then
  cp -R "$PROJECT_ROOT/frontend/public" "$BUILD_DIR/Contents/Resources/app/public"
fi

# Упаковка автономного ETL
echo "Упаковка ETL движка..."
cp -R "$PROJECT_ROOT/dist/sync_local_to_sqlite" "$BUILD_DIR/Contents/Resources/etl/"
chmod +x "$BUILD_DIR/Contents/Resources/etl/sync_local_to_sqlite/sync_local_to_sqlite"

# 5. Снятие карантина и цифровая ad-hoc подпись
echo "--- [4/5] Подпись и регистрация в macOS ---"
xattr -cr "$BUILD_DIR" 2>/dev/null || true
codesign --force --deep --sign - "$BUILD_DIR"
touch "$BUILD_DIR"

# 6. Копирование на Рабочий стол
echo "--- [5/5] Размещение на Рабочем столе ---"
rm -rf "$DESKTOP_DIR"
cp -R "$BUILD_DIR" "$DESKTOP_DIR"
xattr -cr "$DESKTOP_DIR" 2>/dev/null || true
codesign --force --deep --sign - "$DESKTOP_DIR" 2>/dev/null || true
touch "$DESKTOP_DIR"

echo "=================================================="
echo "  СБОРКА УСПЕШНО ЗАВЕРШЕНА!"
echo "  Размер бандла: $(du -sh "$DESKTOP_DIR" | cut -f1)"
echo "  Локация: $DESKTOP_DIR"
echo "=================================================="
