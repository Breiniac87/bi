import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST() {
  console.log('Получен запрос на выключение сервера. Завершение работы...');

  // Удаляем server.pid чтобы лаунчеры знали, что сервер выключен
  let pidFile = '';
  const appData = process.env.APPDATA || process.env.LOCALAPPDATA;
  if (appData) {
    pidFile = path.join(appData, 'ECommerceDashboard', 'server.pid');
  } else if (process.env.HOME) {
    pidFile = path.join(process.env.HOME, 'Library', 'Application Support', 'ECommerceDashboard', 'server.pid');
  }
  if (!pidFile || !fs.existsSync(pidFile)) {
    const localPid = path.join(process.cwd(), 'data', 'server.pid');
    if (fs.existsSync(localPid)) pidFile = localPid;
  }

  if (pidFile) {
    try {
      if (fs.existsSync(/*turbopackIgnore: true*/ pidFile)) {
        fs.unlinkSync(/*turbopackIgnore: true*/ pidFile);
      }
    } catch {
      // ignore
    }
  }

  // Завершаем процесс после отправки ответа клиенту
  setTimeout(() => {
    process.exit(0);
  }, 250);

  return NextResponse.json({
    success: true,
    message: 'Сервер успешно останавливается'
  });
}
