import Database from 'better-sqlite3';
import path from 'path';

// База данных находится на уровень выше папки frontend (в dashbord_2)
const dbPath = path.resolve(process.cwd(), '../dashboard.db');

let db: Database.Database | undefined;
try {
  db = new Database(dbPath, { readonly: true });
} catch (e) {
  console.warn("База данных dashboard.db не найдена или недоступна", e);
}

export function getMetrics() {
  if (!db) return [];
  try {
    // Теперь читаем готовую таблицу merged_data, которую собирает Python скрипт
    const stmt = db.prepare("SELECT * FROM merged_data ORDER BY Дата ASC");
    return stmt.all();
  } catch (e) {
    console.error("Ошибка при чтении метрик", e);
    return [];
  }
}
