import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

function getAppDataDir(): string {
  const appData = process.env.APPDATA || process.env.LOCALAPPDATA;
  if (appData) {
    return path.join(appData, 'ECommerceDashboard');
  }
  const userProfile = process.env.USERPROFILE || '';
  if (userProfile) {
    return path.join(userProfile, 'AppData', 'Roaming', 'ECommerceDashboard');
  }
  if (process.env.HOME) {
    return path.join(process.env.HOME, 'Library', 'Application Support', 'ECommerceDashboard');
  }
  return '';
}

function resolveDbPath(): string {
  if (process.env.DATABASE_PATH && fs.existsSync(/*turbopackIgnore: true*/ process.env.DATABASE_PATH)) {
    return process.env.DATABASE_PATH;
  }
  const cwd = process.cwd();
  const portableCandidates = [
    path.resolve(cwd, 'data', 'dashboard.db'),
    path.resolve(cwd, '../data', 'dashboard.db'),
    path.resolve(cwd, '../../data', 'dashboard.db')
  ];
  for (const p of portableCandidates) {
    if (fs.existsSync(/*turbopackIgnore: true*/ p)) {
      return p;
    }
  }
  const appDataDir = getAppDataDir();
  if (appDataDir) {
    const appDb = path.join(appDataDir, 'dashboard.db');
    if (fs.existsSync(/*turbopackIgnore: true*/ appDb)) {
      return appDb;
    }
  }
  const candidates = [
    path.resolve(process.cwd(), 'dashboard.db'),
    path.resolve(process.cwd(), '../dashboard.db'),
    path.resolve(process.cwd(), '../../dashboard.db'),
    path.resolve(__dirname, '../../dashboard.db'),
    path.resolve(__dirname, '../../../dashboard.db')
  ];
  for (const c of candidates) {
    if (fs.existsSync(/*turbopackIgnore: true*/ c)) {
      return c;
    }
  }
  return candidates[0];
}

export function getMetrics() {
  const dbPath = resolveDbPath();
  try {
    const db = new Database(dbPath, { readonly: true });
    try {
      const stmt = db.prepare("SELECT * FROM merged_data ORDER BY Дата ASC");
      return stmt.all();
    } finally {
      db.close();
    }
  } catch (e) {
    console.error("Ошибка при чтении метрик из SQLite (" + dbPath + "):", e);
    return [];
  }
}

export function clearDatabase(): { success: boolean; error?: string } {
  const dbPath = resolveDbPath();
  try {
    const db = new Database(dbPath);
    try {
      db.exec(`
        DELETE FROM merged_data;
        DELETE FROM ads;
        DELETE FROM sales;
        DELETE FROM processed_files;
        VACUUM;
      `);
      return { success: true };
    } finally {
      db.close();
    }
  } catch (e: any) {
    console.error("Ошибка при полной очистке SQLite (" + dbPath + "):", e);
    return { success: false, error: e?.message || String(e) };
  }
}

