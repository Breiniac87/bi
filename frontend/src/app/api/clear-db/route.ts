import { NextResponse } from 'next/server';
import { clearDatabase, getMetrics } from '@/lib/db';

export async function POST() {
  try {
    const res = clearDatabase();
    if (!res.success) {
      return NextResponse.json({ success: false, error: res.error }, { status: 500 });
    }

    const emptyData = getMetrics();
    return NextResponse.json({
      success: true,
      message: 'База данных успешно очищена',
      data: emptyData,
      status: {
        ads_rows: 0,
        sales_rows: 0,
        merged_rows: 0,
        unique_days: 0,
        sellers_count: 0,
        total_skus: 0,
        total_gmv: 0,
        total_expenses: 0,
        total_orders: 0,
        last_sync_time: null,
        processed_files_count: 0,
        date_range: { from: null, to: null }
      }
    });
  } catch (e: any) {
    console.error('Ошибка в POST /api/clear-db:', e);
    return NextResponse.json({ success: false, error: e.message || String(e) }, { status: 500 });
  }
}
