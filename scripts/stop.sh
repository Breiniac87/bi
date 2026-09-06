#!/usr/bin/env bash

APP_DATA_DIR="$HOME/Library/Application Support/ECommerceDashboard"
PID_FILE="$APP_DATA_DIR/server.pid"
PORT_FILE="$APP_DATA_DIR/server.port"

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null || true
    echo "Сервер с PID $PID остановлен."
  fi
  rm -f "$PID_FILE"
fi

# Глушим процесс на фактически использовавшемся порту
if [ -f "$PORT_FILE" ]; then
  PORT=$(cat "$PORT_FILE")
  if [ -n "$PORT" ]; then
    lsof -ti:$PORT | xargs kill -9 2>/dev/null || true
  fi
  rm -f "$PORT_FILE"
fi

# Страховочная проверка дефолтного порта 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
echo "Сервер дашборда выключен."
