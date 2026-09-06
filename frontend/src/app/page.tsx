import { getMetrics } from '@/lib/db';
import { DashboardClient } from '@/components/DashboardClient';
import type { DataRow } from '@/lib/metrics';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Server Component (выполняется на сервере/node, имеет прямой доступ к SQLite)
export default async function DashboardPage() {
  const data = getMetrics() as unknown as DataRow[];

  return (
    <main className="min-h-screen bg-gray-50/50">
      <DashboardClient initialData={data} />
    </main>
  );
}
