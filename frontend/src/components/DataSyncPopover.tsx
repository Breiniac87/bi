'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Database,
  FolderOpen,
  RefreshCw,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FolderSearch,
  ExternalLink,
  Clock,
  CalendarDays,
  Store,
  Package,
  TrendingUp,
  CreditCard,
  AlertTriangle,
  Layers,
  Trash2
} from 'lucide-react';
import type { DataRow } from '@/lib/metrics';

interface SyncStatus {
  ads_rows: number;
  sales_rows: number;
  merged_rows: number;
  unique_days: number;
  sellers_count: number;
  total_skus: number;
  total_gmv: number;
  total_expenses: number;
  total_orders: number;
  last_sync_time: string | null;
  processed_files_count: number;
  date_range: {
    from: string | null;
    to: string | null;
  };
  recent_files: Array<{
    name: string;
    type: string | null;
    processed_at: string;
    rows: number;
  }>;
  config?: {
    ads_dir: string;
    sales_dir: string;
  };
}

interface DataSyncPopoverProps {
  onDataUpdated: (newData: DataRow[]) => void;
}

export function DataSyncPopover({ onDataUpdated }: DataSyncPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'rebuild' | 'clear' | null>(null);
  const [isSelectingSales, setIsSelectingSales] = useState(false);
  const [isSelectingAds, setIsSelectingAds] = useState(false);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [salesDir, setSalesDir] = useState<string>('');
  const [adsDir, setAdsDir] = useState<string>('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);

  const fetchStatus = async () => {
    setIsRefreshingStatus(true);
    try {
      const res = await fetch('/api/sync');
      const data = await res.json();
      if (data.success && data.status) {
        setStatus(data.status);
        if (data.status.config) {
          setSalesDir(data.status.config.sales_dir || '');
          setAdsDir(data.status.config.ads_dir || '');
        }
      }
    } catch (e) {
      console.error('Ошибка получения статуса БД:', e);
    } finally {
      setIsRefreshingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleSelectFolder = async (type: 'sales' | 'ads') => {
    if (type === 'sales') setIsSelectingSales(true);
    else setIsSelectingAds(true);

    setMessage(null);
    try {
      const res = await fetch('/api/select-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type })
      });
      const data = await res.json();

      if (data.canceled) {
        return;
      }

      if (data.success && data.path) {
        if (type === 'sales') {
          setSalesDir(data.path);
          setMessage({
            type: 'success',
            text: `Папка отчетов по продажам выбрана!`
          });
        } else {
          setAdsDir(data.path);
          setMessage({
            type: 'success',
            text: `Папка отчетов по рекламе выбрана!`
          });
        }
      } else if (data.error && !data.error.includes('-128') && !data.error.includes('Отменено')) {
        setMessage({
          type: 'error',
          text: `Ошибка выбора папки: ${data.error}`
        });
      }
    } catch (e: any) {
      setMessage({
        type: 'error',
        text: `Ошибка: ${e.message}`
      });
    } finally {
      if (type === 'sales') setIsSelectingSales(false);
      else setIsSelectingAds(false);
    }
  };

  const handleOpenFolder = async (type: 'ads' | 'sales') => {
    try {
      await fetch('/api/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type })
      });
    } catch (e) {
      console.error('Ошибка открытия папки:', e);
    }
  };

  const handleSync = async () => {
    setIsLoading(true);
    setMessage(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await res.json();

      if (data.success) {
        const syncRes = data.syncResult;
        if (syncRes?.status) {
          setStatus(syncRes.status);
        } else {
          fetchStatus();
        }

        if (syncRes?.summary_message) {
          const hasChanges = (
            (syncRes.new_ads_files && syncRes.new_ads_files > 0) ||
            (syncRes.new_sales_files && syncRes.new_sales_files > 0) ||
            (syncRes.renamed_files && syncRes.renamed_files.length > 0) ||
            (syncRes.modified_files && syncRes.modified_files.length > 0) ||
            (syncRes.deleted_files && syncRes.deleted_files.length > 0) ||
            (syncRes.skipped_duplicates && syncRes.skipped_duplicates.length > 0)
          );

          setMessage({
            type: hasChanges ? 'success' : 'info',
            text: syncRes.summary_message
          });
        } else {
          const newAds = syncRes?.new_ads_files || 0;
          const newSales = syncRes?.new_sales_files || 0;
          const netRows = syncRes?.net_rows_added ?? 0;
          if (newAds > 0 || newSales > 0) {
            setMessage({
              type: 'success',
              text: `Загружено новых файлов: реклама (${newAds}), продажи (${newSales}). Чистый прирост: ${netRows.toLocaleString('ru-RU')} строк. Дашборд обновлен!`
            });
          } else {
            setMessage({
              type: 'info',
              text: 'Новых файлов в выбранных папках не обнаружено. Данные актуальны.'
            });
          }
        }

        if (data.data && Array.isArray(data.data) && data.data.length > 0) {
          onDataUpdated(data.data);
        }
      } else {
        setMessage({
          type: 'error',
          text: `Ошибка: ${data.error || 'Не удалось выполнить синхронизацию'}`
        });
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isAbort = err.name === 'AbortError';
      setMessage({
        type: 'error',
        text: isAbort ? 'Превышено время ожидания ответа сервера (60 сек).' : `Сетевая ошибка: ${err.message}`
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRebuildAll = async () => {
    setIsRebuilding(true);
    setMessage(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rebuildAll: true }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await res.json();

      if (data.success) {
        if (data.syncResult?.status) {
          setStatus(data.syncResult.status);
        } else {
          fetchStatus();
        }
        setConfirmAction(null);
        setMessage({
          type: 'success',
          text: `База данных полностью пересчитана с нуля! Загружено строк: реклама (${data.syncResult?.ads_rows_added?.toLocaleString('ru-RU') || 0}), продажи (${data.syncResult?.sales_rows_added?.toLocaleString('ru-RU') || 0}).`
        });

        if (data.data && Array.isArray(data.data) && data.data.length > 0) {
          onDataUpdated(data.data);
        }
      } else {
        setMessage({
          type: 'error',
          text: `Ошибка пересчета: ${data.error || 'Не удалось пересчитать базу'}`
        });
      }
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: `Сетевая ошибка: ${err.message}`
      });
    } finally {
      setIsRebuilding(false);
      setConfirmAction(null);
    }
  };

  const handleClearDb = async () => {
    setIsClearing(true);
    setMessage(null);
    try {
      const res = await fetch('/api/clear-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();

      if (data.success) {
        setStatus(data.status || {
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
          date_range: { from: null, to: null },
          config: { ads_dir: adsDir, sales_dir: salesDir }
        });
        setMessage({
          type: 'success',
          text: 'База данных успешно очищена! Все строки удалены.'
        });
        setConfirmAction(null);
        onDataUpdated([]);
      } else {
        setMessage({
          type: 'error',
          text: `Ошибка очистки: ${data.error || 'Не удалось очистить базу данных'}`
        });
      }
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: `Сетевая ошибка при очистке: ${err.message}`
      });
    } finally {
      setIsClearing(false);
    }
  };

  const formatPathDisplay = (fullPath: string) => {
    if (!fullPath) return 'Папка не выбрана';
    const parts = fullPath.split('/');
    if (parts.length > 3) {
      return '.../' + parts.slice(-2).join('/');
    }
    return fullPath;
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      const d = new Date(dateStr.replace(' ', 'T'));
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const formatDateOnly = (dStr: string | null) => {
    if (!dStr) return '';
    try {
      const [y, m, d] = dStr.split('-');
      if (y && m && d) return `${d}.${m}.${y}`;
      return dStr;
    } catch {
      return dStr;
    }
  };

  const formatCurrency = (val: number) => {
    if (val >= 1_000_000) {
      return `${(val / 1_000_000).toFixed(1).replace('.', ',')} млн ₽`;
    }
    return `${Math.round(val).toLocaleString('ru-RU')} ₽`;
  };

  const getDaysLabel = (count: number) => {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod100 >= 11 && mod100 <= 14) return 'дней';
    if (mod10 === 1) return 'день';
    if (mod10 >= 2 && mod10 <= 4) return 'дня';
    return 'дней';
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        className="h-8 px-2.5 inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary/30 hover:border-primary bg-background shadow-xs text-xs font-medium shrink-0 hover:bg-muted transition-colors cursor-pointer"
        title="Управление источниками данных и синхронизация"
      >
        <Database className="h-3.5 w-3.5 text-primary shrink-0" />
        <span>Данные</span>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[620px] max-w-[96vw] max-h-[92vh] overflow-y-auto p-4 space-y-3.5 shadow-2xl border bg-card text-card-foreground"
      >
        {/* Шапка поповера + Блок В (Время последнего обновления) */}
        <div className="flex items-start justify-between border-b pb-2.5">
          <div>
            <h4 className="font-semibold text-sm flex items-center gap-1.5 text-foreground">
              <Database className="w-4 h-4 text-primary" /> Источники данных
            </h4>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground/70" />
              {status?.last_sync_time ? (
                <span>
                  Обновлено: <strong className="font-medium text-foreground">{formatDateTime(status.last_sync_time)}</strong>
                </span>
              ) : (
                <span>Синхронизация еще не выполнялась</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={fetchStatus}
            disabled={isRefreshingStatus}
            title="Обновить информацию о базе данных"
            aria-label="Обновить информацию о базе данных"
            className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-muted disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingStatus ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* 2 Папки источников данных в компактной 2-колоночной сетке */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Папка: Продажи */}
          <div className="space-y-1.5 p-2.5 rounded-lg border bg-muted/30 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <FolderOpen className="w-3.5 h-3.5" /> Отчеты по продажам
              </div>
              {salesDir && (
                <button
                  type="button"
                  onClick={() => handleOpenFolder('sales')}
                  className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
                  title="Открыть в Проводнике / Finder"
                >
                  <span>Открыть</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
            <div
              className="text-xs font-mono text-muted-foreground truncate bg-background px-2 py-1 rounded border"
              title={salesDir || 'Папка не выбрана'}
            >
              {formatPathDisplay(salesDir)}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleSelectFolder('sales')}
              disabled={isSelectingSales}
              className="w-full h-7 text-xs flex items-center justify-center gap-1.5"
            >
              {isSelectingSales ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Выбор папки...</span>
                </>
              ) : (
                <>
                  <FolderSearch className="w-3.5 h-3.5" />
                  <span>Указать папку продаж...</span>
                </>
              )}
            </Button>
          </div>

          {/* Папка: Реклама */}
          <div className="space-y-1.5 p-2.5 rounded-lg border bg-muted/30 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
                <FolderOpen className="w-3.5 h-3.5" /> Отчеты по рекламе
              </div>
              {adsDir && (
                <button
                  type="button"
                  onClick={() => handleOpenFolder('ads')}
                  className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
                  title="Открыть в Проводнике / Finder"
                >
                  <span>Открыть</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
            <div
              className="text-xs font-mono text-muted-foreground truncate bg-background px-2 py-1 rounded border"
              title={adsDir || 'Папка не выбрана'}
            >
              {formatPathDisplay(adsDir)}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleSelectFolder('ads')}
              disabled={isSelectingAds}
              className="w-full h-7 text-xs flex items-center justify-center gap-1.5"
            >
              {isSelectingAds ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Выбор папки...</span>
                </>
              ) : (
                <>
                  <FolderSearch className="w-3.5 h-3.5" />
                  <span>Указать папку рекламы...</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Блок А: Бизнес-сводка по базе данных - отображается только когда в базе есть загруженные данные */}
        {status && status.merged_rows > 0 && (
          <div className="rounded-lg border bg-gradient-to-br from-card to-muted/30 p-3 space-y-2.5 shadow-sm">
            {/* Верхняя плашка: Период данных */}
            <div className="flex items-center justify-between text-xs pb-2 border-b border-border/60">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <CalendarDays className="w-3.5 h-3.5 text-primary" />
                <span className="text-muted-foreground">Период:</span>
                {status.date_range.from && status.date_range.to ? (
                  <span className="font-mono font-semibold text-foreground">
                    {formatDateOnly(status.date_range.from)} — {formatDateOnly(status.date_range.to)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Нет данных</span>
                )}
              </div>
              {status.unique_days > 0 && (
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  {status.unique_days} {getDaysLabel(status.unique_days)}
                </span>
              )}
            </div>

            {/* Сетка ключевых бизнес-метрик: 4 колонки в одну компактную строку */}
            {status.merged_rows > 0 ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {/* Выручка (GMV) */}
                  <div className="bg-background/80 rounded-md p-2 border border-border/50">
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <TrendingUp className="w-3 h-3 text-emerald-500 shrink-0" />
                      <span className="truncate">Выручка (GMV)</span>
                    </div>
                    <div className="text-sm font-bold text-foreground mt-0.5">
                      {formatCurrency(status.total_gmv)}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                      Заказов: <span className="font-medium text-foreground">{status.total_orders.toLocaleString('ru-RU')}</span>
                    </div>
                  </div>

                  {/* Рекламный бюджет */}
                  <div className="bg-background/80 rounded-md p-2 border border-border/50">
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <CreditCard className="w-3 h-3 text-blue-500 shrink-0" />
                      <span className="truncate">Бюджет рекламы</span>
                    </div>
                    <div className="text-sm font-bold text-foreground mt-0.5">
                      {formatCurrency(status.total_expenses)}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                      ДРР: <span className="font-medium text-foreground">{status.total_gmv > 0 ? ((status.total_expenses / status.total_gmv) * 100).toFixed(1) : 0}%</span>
                    </div>
                  </div>

                  {/* Магазинов */}
                  <div className="bg-background/80 rounded-md p-2 border border-border/50">
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Store className="w-3 h-3 text-amber-500 shrink-0" />
                      <span className="truncate">Магазинов</span>
                    </div>
                    <div className="text-sm font-bold text-foreground mt-0.5">
                      {status.sellers_count}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      продавцов
                    </div>
                  </div>

                  {/* Артикулов (SKU) */}
                  <div className="bg-background/80 rounded-md p-2 border border-border/50">
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Package className="w-3 h-3 text-purple-500 shrink-0" />
                      <span className="truncate">Товаров в РК</span>
                    </div>
                    <div className="text-sm font-bold text-foreground mt-0.5">
                      {status.total_skus.toLocaleString('ru-RU')}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      уник. SKU
                    </div>
                  </div>
                </div>

                {/* Технические детали базы: аккуратная горизонтальная строка */}
                <div className="pt-1.5 border-t border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Layers className="w-3 h-3 text-primary shrink-0" />
                    <span>Аналитических записей:</span>
                    <span className="font-semibold text-primary">
                      {status.merged_rows.toLocaleString('ru-RU')}
                    </span>
                    <span className="text-[10px] text-muted-foreground">(сводные срезы)</span>
                  </div>
                  <div>
                    Исходных строк: <span className="font-medium text-foreground">Реклама: {status.ads_rows.toLocaleString('ru-RU')}</span> · <span className="font-medium text-foreground">Продажи: {status.sales_rows.toLocaleString('ru-RU')}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-3 text-xs text-muted-foreground">
                База пока пуста. Выберите папки и запустите синхронизацию.
              </div>
            )}
          </div>
        )}

        {/* Сообщение об успешности или ошибке */}
        {message && (
          <div
            className={`p-2 rounded-md text-xs flex items-start gap-2 ${
              message.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                : message.type === 'error'
                ? 'bg-destructive/10 text-destructive border border-destructive/20'
                : 'bg-primary/10 text-primary border border-primary/20'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span className="leading-snug">{message.text}</span>
          </div>
        )}

        {/* Действия: Синхронизация, Пересчет и Полная очистка БД */}
        <div className="pt-1">
          {confirmAction === null ? (
            <div className="space-y-2">
              <Button
                type="button"
                onClick={handleSync}
                disabled={isLoading || isRebuilding || isClearing}
                className="w-full flex items-center justify-center gap-2 h-9 font-medium text-xs shadow-sm"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Синхронизация данных с базой...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Синхронизировать данные в папках с базой данных</span>
                  </>
                )}
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmAction('rebuild')}
                  disabled={isLoading || isRebuilding || isClearing}
                  className="flex-1 h-8 text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 transition-colors"
                  title="Очистить кэш и перечитать все файлы с нуля"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Пересчитать всё с нуля</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmAction('clear')}
                  disabled={isLoading || isRebuilding || isClearing || (status !== null && status.merged_rows === 0)}
                  className="flex-1 h-8 text-xs text-destructive border-destructive/30 hover:border-destructive hover:bg-destructive/10 flex items-center justify-center gap-1.5 transition-colors"
                  title="Полностью очистить базу данных и удалить все записи"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Очистить базу данных</span>
                </Button>
              </div>
            </div>
          ) : confirmAction === 'rebuild' ? (
            <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-xs space-y-2.5 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-semibold text-destructive">Пересчитать базу с нуля?</div>
                  <div className="text-[11px] text-muted-foreground">
                    Кэш будет очищен, все файлы из папок продаж и рекламы будут прочитаны заново.
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={isRebuilding}
                  onClick={() => setConfirmAction(null)}
                  className="text-xs h-7 px-3"
                >
                  Отмена
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="destructive"
                  disabled={isRebuilding}
                  onClick={handleRebuildAll}
                  className="text-xs h-7 px-3"
                >
                  {isRebuilding ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Пересчет...</span>
                    </>
                  ) : (
                    <span>Да, пересчитать всё</span>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-lg border border-destructive/40 bg-destructive/5 text-xs space-y-3 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold text-destructive text-sm">Полная очистка базы данных?</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    Все аналитические записи, данные по рекламе, продажам и история обработанных файлов будут безвозвратно удалены. База данных станет полностью пустой.
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1 border-t border-destructive/20">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isClearing}
                  onClick={() => setConfirmAction(null)}
                  className="text-xs h-8 px-3"
                >
                  Отмена
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={isClearing}
                  onClick={handleClearDb}
                  className="text-xs h-8 px-3 flex items-center gap-1.5 shadow-sm"
                >
                  {isClearing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Очистка базы...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Да, полностью очистить базу</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
