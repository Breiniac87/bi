import { getMetrics } from '@/lib/db';
import { DashboardClient } from '@/components/DashboardClient';

// Server Component (выполняется на сервере/node, имеет прямой доступ к SQLite)
export default async function DashboardPage() {
  const data = getMetrics();

  return (
    <main className="min-h-screen bg-gray-50/50">
      {data.length === 0 ? (
        <div className="p-8">
          <h1 className="text-3xl font-bold mb-4">Данных пока нет</h1>
          <p>
            База данных SQLite (<code>dashboard.db</code>) пуста или не найдена.
            Запустите <code>python3 sync_yandex_to_sqlite.py</code> в корне проекта, чтобы синхронизировать данные с Яндекс.Диска.
          </p>
        </div>
      ) : (
        <DashboardClient initialData={data} />
      )}
    </main>
  );
}
