#!/usr/bin/env bash

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DATA_DIR="$HOME/Library/Application Support/ECommerceDashboard"
mkdir -p "$APP_DATA_DIR"

LOG_FILE="$APP_DATA_DIR/launch.log"

# Ротация логов: если размер превышает 500 КБ, сохраняем последние 1000 строк
if [ -f "$LOG_FILE" ]; then
  LOG_SIZE=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)
  if [ "$LOG_SIZE" -gt 500000 ]; then
    tail -n 1000 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
  fi
fi

exec >> "$LOG_FILE" 2>&1
echo "=== [$(date '+%Y-%m-%d %H:%M:%S')] Запуск E-Commerce Dashboard ==="
echo "DIR: $DIR"

# 1. Определение автономного Node.js
NODE_BIN=""
if [ -x "$DIR/../MacOS/node" ]; then
  NODE_BIN="$DIR/../MacOS/node"
elif command -v node >/dev/null 2>&1; then
  NODE_BIN=$(command -v node)
elif [ -x "/opt/homebrew/bin/node" ]; then
  NODE_BIN="/opt/homebrew/bin/node"
elif [ -x "/usr/local/bin/node" ]; then
  NODE_BIN="/usr/local/bin/node"
elif [ -d "$HOME/.nvm/versions/node" ]; then
  LATEST_NVM=$(ls -d "$HOME/.nvm/versions/node/"* 2>/dev/null | tail -n 1)
  if [ -x "$LATEST_NVM/bin/node" ]; then
    NODE_BIN="$LATEST_NVM/bin/node"
  fi
fi

echo "Используемый Node.js: $NODE_BIN ($("$NODE_BIN" -v 2>/dev/null || echo 'недоступен'))"

# 2. Определение расположения сервера (Standalone vs Development)
STANDALONE_DIR=""
if [ -f "$DIR/app/server.js" ]; then
  STANDALONE_DIR="$DIR/app"
elif [ -f "$DIR/../frontend/.next/standalone/server.js" ]; then
  STANDALONE_DIR="$DIR/../frontend/.next/standalone"
fi

# 3. Инициализация базы данных и конфига пользователя
USER_DB="$APP_DATA_DIR/dashboard.db"
USER_CFG="$APP_DATA_DIR/config.json"

if [ ! -f "$USER_DB" ]; then
  echo "Инициализация рабочей базы данных в $USER_DB..."
  if [ -f "$DIR/template.db" ]; then
    cp "$DIR/template.db" "$USER_DB"
  elif [ -f "$DIR/../dashboard.db" ]; then
    cp "$DIR/../dashboard.db" "$USER_DB"
  fi
fi

if [ ! -f "$USER_CFG" ]; then
  echo "Инициализация настроек пользователя в $USER_CFG..."
  if [ -f "$DIR/template_config.json" ]; then
    cp "$DIR/template_config.json" "$USER_CFG"
  elif [ -f "$DIR/../config.json" ]; then
    cp "$DIR/../config.json" "$USER_CFG"
  else
    DEFAULT_DATA_DIR="$HOME/Desktop/data"
    mkdir -p "$DEFAULT_DATA_DIR/ads" "$DEFAULT_DATA_DIR/sales"
    cat << EOF > "$USER_CFG"
{
  "ads_dir": "$DEFAULT_DATA_DIR/ads",
  "sales_dir": "$DEFAULT_DATA_DIR/sales"
}
EOF
  fi
fi

# Экспорт путей окружения для Next.js и Python
export DATABASE_PATH="$USER_DB"
export CONFIG_PATH="$USER_CFG"

# Экспорт пути к скомпилированному ETL бинарнику
if [ -x "$DIR/etl/sync_local_to_sqlite/sync_local_to_sqlite" ]; then
  export ETL_BIN_PATH="$DIR/etl/sync_local_to_sqlite/sync_local_to_sqlite"
  echo "ETL Binary: $ETL_BIN_PATH"
elif [ -f "$DIR/etl/sync_local_to_sqlite.py" ]; then
  export ETL_SCRIPT_PATH="$DIR/etl/sync_local_to_sqlite.py"
  echo "ETL Script: $ETL_SCRIPT_PATH"
fi

# 4. Поиск рабочего или свободного порта
# Если порт 3000 занят, но сервис не отвечает вообще - освобождаем его
PIDS_3000=$(lsof -ti :3000 2>/dev/null || true)
if [ -n "$PIDS_3000" ]; then
  if ! curl -s -f -m 2 "http://127.0.0.1:3000" >/dev/null 2>&1; then
    echo "Освобождаем зависший или сбойный порт 3000 (PIDs: $PIDS_3000)..."
    kill -9 $PIDS_3000 2>/dev/null || true
    sleep 0.5
  fi
fi

find_target_port() {
  local p=3000
  while [ $p -le 3020 ]; do
    if curl -s -f -m 2 "http://127.0.0.1:$p" >/dev/null 2>&1; then
      echo $p
      return 0
    fi
    if ! lsof -i :$p >/dev/null 2>&1; then
      echo $p
      return 0
    fi
    p=$((p + 1))
  done
  echo 3000
}

PORT=$(find_target_port)
URL="http://127.0.0.1:$PORT"
echo "Целевой адрес: $URL"
echo "$PORT" > "$APP_DATA_DIR/server.port"

is_running() {
  curl -s -f -m 2 "$URL" >/dev/null 2>&1
}

# 5. Запуск сервера
if ! is_running; then
  echo "Запуск сервера на порту $PORT..."
  echo "--- [$(date '+%Y-%m-%d %H:%M:%S')] Старт сервера $URL ---" > "$APP_DATA_DIR/server.log"

  if [ -n "$STANDALONE_DIR" ] && [ -x "$NODE_BIN" ]; then
    echo "Запуск автономного Standalone сервера из $STANDALONE_DIR..."
    cd "$STANDALONE_DIR"
    export PORT="$PORT"
    export HOSTNAME="0.0.0.0"
    nohup "$NODE_BIN" server.js >> "$APP_DATA_DIR/server.log" 2>&1 &
    SERVER_PID=$!
  else
    # Fallback на исходный код (dev-режим проекта)
    FRONTEND_DIR="$DIR/../frontend"
    echo "Запуск из исходников: $FRONTEND_DIR..."
    cd "$FRONTEND_DIR"
    export PATH="$(dirname "$NODE_BIN"):$PATH"
    export HOSTNAME="0.0.0.0"
    if [ -d "$FRONTEND_DIR/.next" ]; then
      nohup npm run start -- -p "$PORT" -H 0.0.0.0 >> "$APP_DATA_DIR/server.log" 2>&1 &
    else
      nohup npm run dev -- -p "$PORT" -H 0.0.0.0 >> "$APP_DATA_DIR/server.log" 2>&1 &
    fi
    SERVER_PID=$!
  fi

  echo $SERVER_PID > "$APP_DATA_DIR/server.pid"
  echo "PID сервера: $SERVER_PID"

  # Ожидание готовности до 15 секунд
  COUNT=0
  while ! is_running && [ $COUNT -lt 30 ]; do
    sleep 0.5
    COUNT=$((COUNT + 1))
  done
  # Небольшая пауза для полной готовности обработчиков роутов
  sleep 0.3
fi

SERVER_STATUS=$(is_running && echo 'РАБОТАЕТ' || echo 'НЕ ОТВЕЧАЕТ')
echo "Статус сервера: $SERVER_STATUS"

# 6. Открытие окна браузера
echo "Открытие в браузере: $URL"
open "$URL"

echo "=== Запуск завершен ==="
