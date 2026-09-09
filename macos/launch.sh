#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
PROJECT_ROOT="$( cd "$DIR/.." >/dev/null 2>&1 && pwd )"

# Определение рабочей папки данных
if [ -d "$DIR/data" ]; then
    APP_DATA_DIR="$DIR/data"
elif [ -d "$PROJECT_ROOT/data" ]; then
    APP_DATA_DIR="$PROJECT_ROOT/data"
else
    APP_DATA_DIR="$HOME/Library/Application Support/ECommerceDashboard/data"
    mkdir -p "$APP_DATA_DIR"
fi

mkdir -p "$APP_DATA_DIR/ads"
mkdir -p "$APP_DATA_DIR/sales"
LOG_FILE="$APP_DATA_DIR/server.log"

echo "=========================================================="
echo "  Запуск E-Commerce Analytics Dashboard (macOS)"
echo "=========================================================="
echo "[$(date)] Запуск приложения" >> "$LOG_FILE"

# 1. Поиск исполняемого файла node
NODE_BIN=""
if [ -x "$DIR/node" ]; then
    NODE_BIN="$DIR/node"
elif [ -x "$PROJECT_ROOT/node" ]; then
    NODE_BIN="$PROJECT_ROOT/node"
elif command -v node >/dev/null 2>&1; then
    NODE_BIN="$(command -v node)"
elif [ -x "/opt/homebrew/bin/node" ]; then
    NODE_BIN="/opt/homebrew/bin/node"
elif [ -x "/usr/local/bin/node" ]; then
    NODE_BIN="/usr/local/bin/node"
else
    # Проверка NVM
    if [ -d "$HOME/.nvm/versions/node" ]; then
        LATEST_NVM_NODE=$(find "$HOME/.nvm/versions/node" -maxdepth 2 -name "node" -type f | sort -r | head -n 1 || true)
        if [ -x "$LATEST_NVM_NODE" ]; then
            NODE_BIN="$LATEST_NVM_NODE"
        fi
    fi
fi

if [ -z "$NODE_BIN" ]; then
    echo "[ОШИБКА] Рантайм Node.js не найден в системе!"
    echo "Установите Node.js 18+ с https://nodejs.org или через brew: brew install node"
    read -p "Нажмите Enter для выхода..."
    exit 1
fi

echo "Используется Node.js: $NODE_BIN ($($NODE_BIN -v))"

# 2. Инициализация базы данных и конфигурации
USER_DB="$APP_DATA_DIR/dashboard.db"
USER_CFG="$APP_DATA_DIR/config.json"

if [ ! -f "$USER_DB" ]; then
    if [ -f "$DIR/template.db" ]; then
        cp "$DIR/template.db" "$USER_DB"
    elif [ -f "$PROJECT_ROOT/dashboard.db" ]; then
        cp "$PROJECT_ROOT/dashboard.db" "$USER_DB"
    fi
fi

if [ ! -f "$USER_CFG" ]; then
    if [ -f "$DIR/template_config.json" ]; then
        cp "$DIR/template_config.json" "$USER_CFG"
    else
        cat <<EOF > "$USER_CFG"
{
  "ads_dir": "$APP_DATA_DIR/ads",
  "sales_dir": "$APP_DATA_DIR/sales"
}
EOF
    fi
fi

export DATABASE_PATH="$USER_DB"
export CONFIG_PATH="$USER_CFG"
export PORT="3000"
export HOSTNAME="127.0.0.1"
export NODE_ENV="production"

# ETL бинарник
if [ -x "$DIR/etl/sync_local_to_sqlite/sync_local_to_sqlite" ]; then
    export ETL_BIN_PATH="$DIR/etl/sync_local_to_sqlite/sync_local_to_sqlite"
elif [ -x "$PROJECT_ROOT/dist/sync_local_to_sqlite/sync_local_to_sqlite" ]; then
    export ETL_BIN_PATH="$PROJECT_ROOT/dist/sync_local_to_sqlite/sync_local_to_sqlite"
fi

# 3. Проверка, запущен ли уже сервер
if curl -s --connect-timeout 1 http://127.0.0.1:3000 >/dev/null 2>&1; then
    echo "Сервер уже запущен. Открываем интерфейс..."
else
    echo "Запуск локального сервера на порту 3000..."
    if [ -f "$DIR/app/server.js" ]; then
        cd "$DIR/app"
        "$NODE_BIN" server.js >> "$LOG_FILE" 2>&1 &
        SERVER_PID=$!
    elif [ -f "$PROJECT_ROOT/frontend/.next/standalone/server.js" ]; then
        if [ ! -d "$PROJECT_ROOT/frontend/.next/standalone/.next/static" ] && [ -d "$PROJECT_ROOT/frontend/.next/static" ]; then
            mkdir -p "$PROJECT_ROOT/frontend/.next/standalone/.next"
            cp -R "$PROJECT_ROOT/frontend/.next/static" "$PROJECT_ROOT/frontend/.next/standalone/.next/static"
        fi
        if [ ! -d "$PROJECT_ROOT/frontend/.next/standalone/public" ] && [ -d "$PROJECT_ROOT/frontend/public" ]; then
            cp -R "$PROJECT_ROOT/frontend/public" "$PROJECT_ROOT/frontend/.next/standalone/public"
        fi
        cd "$PROJECT_ROOT/frontend/.next/standalone"
        "$NODE_BIN" server.js >> "$LOG_FILE" 2>&1 &
        SERVER_PID=$!
    else
        cd "$PROJECT_ROOT/frontend"
        npm run dev -- -p 3000 -H 127.0.0.1 >> "$LOG_FILE" 2>&1 &
        SERVER_PID=$!
    fi

    echo "$SERVER_PID" > "$APP_DATA_DIR/server.pid"

    echo "Ожидание ответа сервера..."
    READY=0
    for i in {1..40}; do
        if curl -s --connect-timeout 1 http://127.0.0.1:3000 >/dev/null 2>&1; then
            READY=1
            break
        fi
        sleep 0.5
    done

    if [ "$READY" -ne 1 ]; then
        echo "[ОШИБКА] Сервер не ответил вовремя. Проверьте лог: $LOG_FILE"
        exit 1
    fi
fi

# 4. Открытие приложения
APP_URL="http://127.0.0.1:3000"

# Если есть Google Chrome, открываем в аккуратном режиме окна приложения (--app)
if [ -d "/Applications/Google Chrome.app" ]; then
    open -na "Google Chrome" --args --app="$APP_URL"
else
    open "$APP_URL"
fi

echo "Дашборд успешно запущен!"
