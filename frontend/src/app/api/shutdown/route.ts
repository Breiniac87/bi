import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST() {
  console.log('Получен запрос на выключение сервера. Завершение работы...');

  // Удаляем server.pid чтобы лаунчеры знали, что сервер выключен
  let pidFile = '';
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || process.env.LOCALAPPDATA;
    if (appData) {
      pidFile = path.join(appData, 'ECommerceDashboard', 'server.pid');
    }
  } else {
    const home = process.env.HOME || '';
    if (home) {
      pidFile = path.join(home, 'Library/Application Support/ECommerceDashboard/server.pid');
    }
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
