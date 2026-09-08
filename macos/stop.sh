#!/usr/bin/env bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
PROJECT_ROOT="$( cd "$DIR/.." >/dev/null 2>&1 && pwd )"

echo "=========================================================="
echo "  Остановка E-Commerce Analytics Dashboard"
echo "=========================================================="

# 1. Запрос на graceful shutdown через API
if curl -s -X POST http://127.0.0.1:3000/api/shutdown >/dev/null 2>&1; then
    echo "Отправлен сигнал завершения через API..."
    sleep 1
fi

# 2. Остановка по PID файлу
CANDIDATE_PIDS=(
    "$DIR/data/server.pid"
    "$PROJECT_ROOT/data/server.pid"
    "$HOME/Library/Application Support/ECommerceDashboard/data/server.pid"
    "$HOME/Library/Application Support/ECommerceDashboard/server.pid"
)

for PID_FILE in "${CANDIDATE_PIDS[@]}"; do
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE" 2>/dev/null || true)
        if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
            echo "Остановка процесса PID: $PID"
            kill -15 "$PID" 2>/dev/null || true
            sleep 0.5
            kill -9 "$PID" 2>/dev/null || true
        fi
        rm -f "$PID_FILE"
    fi
done

# 3. Очистка процессов, слушающих порт 3000 (если остались)
PORT_PID=$(lsof -ti :3000 2>/dev/null || true)
if [ -n "$PORT_PID" ]; then
    echo "Завершение оставшегося процесса на порту 3000 (PID: $PORT_PID)..."
    kill -15 $PORT_PID 2>/dev/null || true
    sleep 0.5
    kill -9 $PORT_PID 2>/dev/null || true
fi

echo "[OK] Все серверные процессы успешно остановлены."
