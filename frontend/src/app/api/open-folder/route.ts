import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

function getProjectRoot(): string {
  let curr = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(curr, 'data')) || fs.existsSync(path.join(curr, 'sync_local_to_sqlite.py'))) {
      return curr;
    }
    const parent = path.resolve(curr, '..');
    if (parent === curr) break;
    curr = parent;
  }
  return process.cwd();
}

function getConfigPath(): string {
  if (process.env.CONFIG_PATH && fs.existsSync(process.env.CONFIG_PATH)) {
    return process.env.CONFIG_PATH;
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || process.env.LOCALAPPDATA;
    if (appData) {
      const winCfg = path.join(appData, 'ECommerceDashboard', 'config.json');
      if (fs.existsSync(winCfg)) return winCfg;
    }
  }
  const home = process.env.HOME || '';
  if (home) {
    const appSupportCfg = path.join(home, 'Library/Application Support/ECommerceDashboard/config.json');
    if (fs.existsSync(appSupportCfg)) {
      return appSupportCfg;
    }
  }
  return path.join(getProjectRoot(), 'config.json');
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const folderType = body.type === 'ads' ? 'ads' : 'sales';
    const projectRoot = getProjectRoot();
    let targetPath = path.join(projectRoot, 'data', folderType);

    const cfgPath = getConfigPath();
    if (fs.existsSync(/*turbopackIgnore: true*/ cfgPath)) {
      try {
        const raw = fs.readFileSync(/*turbopackIgnore: true*/ cfgPath, 'utf-8');
        const cfg = JSON.parse(raw);
        const configuredPath = folderType === 'ads' ? cfg.ads_dir : cfg.sales_dir;
        if (configuredPath && fs.existsSync(/*turbopackIgnore: true*/ configuredPath)) {
          targetPath = configuredPath;
        }
      } catch (e) {
        console.error('Ошибка чтения config.json в open-folder:', e);
      }
    }

    if (!fs.existsSync(/*turbopackIgnore: true*/ targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }

    // В режиме dryRun (например, для тестов) только валидируем путь и доступность без открытия окна Проводника / Finder
    if (body.dryRun) {
      return NextResponse.json({ success: true, folder: targetPath, dryRun: true });
    }

    const openCmd = process.platform === 'win32'
      ? `explorer "${path.normalize(targetPath)}"`
      : `open "${targetPath}"`;

    return new Promise<NextResponse>((resolve) => {
      exec(openCmd, (error) => {
        if (error) {
          // На Windows explorer может вернуть код возврата 1 даже при успешном открытии папки
          if (process.platform === 'win32' && error.code === 1) {
            return resolve(NextResponse.json({ success: true, folder: targetPath }));
          }
          return resolve(NextResponse.json({ success: false, error: error.message }, { status: 500 }));
        }
        return resolve(NextResponse.json({ success: true, folder: targetPath }));
      });
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
