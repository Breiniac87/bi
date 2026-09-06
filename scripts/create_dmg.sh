#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$DIR/.." && pwd)"
RELEASE_DIR="$PROJECT_ROOT/release_macos_m1"
APP_NAME="E-Commerce Dashboard.app"
APP_SRC="${1:-$RELEASE_DIR/$APP_NAME}"
VOL_NAME="E-Commerce Dashboard"
DMG_FILENAME="E-Commerce-Dashboard-M1.dmg"
FINAL_DMG="$RELEASE_DIR/$DMG_FILENAME"
DESKTOP_DMG="$HOME/Desktop/$DMG_FILENAME"

echo "=========================================================="
echo "  Создание профессионального macOS DMG установщика"
echo "  Целевой образ: $DMG_FILENAME"
echo "=========================================================="

if [ ! -d "$APP_SRC" ]; then
  echo "ОШИБКА: Бандл $APP_SRC не найден. Сначала запустите сборку приложения!"
  exit 1
fi

TEMP_STAGE="/tmp/dmg_stage_$$"
TEMP_RW="/tmp/dmg_rw_$$.dmg"
rm -rf "$TEMP_STAGE" "$TEMP_RW"
mkdir -p "$TEMP_STAGE"

echo "--- [1/5] Копирование компонентов в образ ---"
cp -R "$APP_SRC" "$TEMP_STAGE/$APP_NAME"
ln -s /Applications "$TEMP_STAGE/Applications"

# Иконка диска
if [ -f "$PROJECT_ROOT/scripts/AppIcon.icns" ]; then
  cp "$PROJECT_ROOT/scripts/AppIcon.icns" "$TEMP_STAGE/.VolumeIcon.icns"
fi

# Подсчет необходимого размера образа (+120 МБ буфера для HFS+ и метаданных)
APP_SIZE_MB=$(du -sm "$TEMP_STAGE" | cut -f1)
DMG_SIZE_MB=$((APP_SIZE_MB + 120))
echo "Размер данных: ${APP_SIZE_MB} МБ, создаем промежуточный образ: ${DMG_SIZE_MB} МБ"

echo "--- [2/5] Создание временного read-write образа HFS+ ---"
hdiutil create -srcfolder "$TEMP_STAGE" -volname "$VOL_NAME" -fs HFS+ -fsargs "-c c=64,a=16,e=16" -format UDRW -size "${DMG_SIZE_MB}m" "$TEMP_RW"
rm -rf "$TEMP_STAGE"

echo "--- [3/5] Монтирование и настройка внешнего вида Finder ---"
MOUNT_INFO=$(hdiutil attach -readwrite -noverify -noautoopen "$TEMP_RW")
DEVICE=$(echo "$MOUNT_INFO" | egrep '^/dev/' | head -n 1 | awk '{print $1}')
MOUNT_DIR=$(echo "$MOUNT_INFO" | grep '/Volumes/' | head -n 1 | awk -F '/Volumes/' '{print "/Volumes/" $2}')

echo "Смонтировано устройство: $DEVICE в $MOUNT_DIR"

# Установка флага иконки диска через SetFile
if [ -x "/usr/bin/SetFile" ] && [ -f "$MOUNT_DIR/.VolumeIcon.icns" ]; then
  /usr/bin/SetFile -a C "$MOUNT_DIR" 2>/dev/null || true
  /usr/bin/SetFile -a V "$MOUNT_DIR/.VolumeIcon.icns" 2>/dev/null || true
fi

# AppleScript для настройки окна (расположение иконок, размер окна, скрытие лишнего)
osascript -e "
tell application \"Finder\"
  tell disk \"$VOL_NAME\"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set the bounds of container window to {350, 180, 990, 540}
    set theViewOptions to the icon view options of container window
    set icon size of theViewOptions to 128
    set text size of theViewOptions to 12
    set arrangement of theViewOptions to not arranged
    set position of item \"$APP_NAME\" of container window to {160, 180}
    set position of item \"Applications\" of container window to {480, 180}
    close
    open
    update without registering applications
    delay 1
    close
  end tell
end tell
" || echo "Предупреждение Finder AppleScript (продолжаем)"

sync
sleep 1

echo "--- [4/5] Размонтирование устройства ---"
hdiutil detach "$DEVICE" || hdiutil detach "$DEVICE" -force

echo "--- [5/5] Сжатие в финальный read-only DMG (UDZO с максимальным сжатием) ---"
rm -f "$FINAL_DMG"
hdiutil convert "$TEMP_RW" -format UDZO -imagekey zlib-level=9 -o "$FINAL_DMG"
rm -f "$TEMP_RW"

# Очищаем старый файл с Рабочего стола, если остался
rm -f "$DESKTOP_DMG"

echo "=========================================================="
echo "  DMG УСТАНОВЩИК УСПЕШНО СОЗДАН!"
echo "  Файл сохранен строго в релиз: $FINAL_DMG ($(du -sh "$FINAL_DMG" | cut -f1))"
echo "=========================================================="
