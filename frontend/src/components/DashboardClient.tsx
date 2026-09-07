'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Calendar as CalendarIcon, Book, Database, BarChart3, Activity, Power, Loader2, Sparkles, Info, FileSpreadsheet, RefreshCw, AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { format, parse, isBefore, isAfter } from 'date-fns';
import { useLocalStorage, useLocalLocalDate } from '@/hooks/use-local-storage';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Link from 'next/link';
import { calculateMetrics, sortSellersAlphabetically, type DataRow } from '@/lib/metrics';
import { Checkbox } from '@/components/ui/checkbox';
import { ThemeToggle } from '@/components/theme-toggle';
import { DataSyncPopover } from '@/components/DataSyncPopover';
import { ComparativeChartSection } from '@/components/dashboard/ComparativeChartSection';
import { CorrelationChartSection } from '@/components/dashboard/CorrelationChartSection';
import { APP_VERSION } from '@/lib/version';

const CHART_COLORS = [
  '#2563eb', '#16a34a', '#dc2626', '#ca8a04', '#9333ea', '#0891b2', '#ea580c', '#4f46e5'
];

const PREDEFINED_RK_TYPES = [
  'Единая ставка',
  'Ручная ставка',
  'Органика (без рекламы)',
] as const;

const RK_LABELS: Record<string, string> = {
  'Единая ставка': 'Единая ставка',
  'Ручная ставка': 'Ручная ставка',
  'Органика (без рекламы)': 'Органика',
  'Органика': 'Органика',
};

function getRkLabel(rk: string): string {
  return RK_LABELS[rk] || rk;
}

const UNIT_LABELS: Record<string, string> = {
  auto: 'Авто (сокращ.)',
  raw: 'Натуральные ед.',
  thousands: 'Тысячи (тыс.)',
  millions: 'Миллионы (млн)',
};

function getMinMaxDates(rows: DataRow[]) {
  if (!rows || rows.length === 0) return { minDate: undefined, maxDate: undefined };
  const dates = rows
    .map(r => r['Дата'] as string)
    .filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  if (dates.length === 0) return { minDate: undefined, maxDate: undefined };
  return {
    minDate: parse(dates[0], 'yyyy-MM-dd', new Date()),
    maxDate: parse(dates[dates.length - 1], 'yyyy-MM-dd', new Date())
  };
}

export function DashboardClient({ initialData }: { initialData: DataRow[] }) {
  const [data, setData] = useState<DataRow[]>(initialData);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [isStopped, setIsStopped] = useState(false);

  const handleShutdown = useCallback(async () => {
    if (!window.confirm('Завершить работу приложения и закрыть вкладку дашборда?')) return;
    setIsShuttingDown(true);

    try {
      await fetch('/api/shutdown', { method: 'POST', keepalive: true });
    } catch {
      // Игнорируем разрыв соединения при остановке сервера
    }

    // 1. Попытка закрыть текущую вкладку
    setTimeout(() => {
      try {
        window.open('', '_self', '');
        window.close();
      } catch (e) {
        console.warn('Автозакрытие вкладки отклонено политикой браузера:', e);
      }
      // 2. Если браузер отклонил вызов window.close(), показываем оверлей
      setIsStopped(true);
      setIsShuttingDown(false);
    }, 200);
  }, []);

  // ГЛОБАЛЬНЫЕ ФИЛЬТРЫ
  const allRkTypes = useMemo(() => {
    const typesFromData = data
      .map(d => (d['Тип РК'] as string)?.trim())
      .filter((t): t is string => Boolean(t) && t !== 'null' && t !== 'undefined' && t !== '');
    return Array.from(new Set([...PREDEFINED_RK_TYPES, ...typesFromData]));
  }, [data]);

  const [selectedRkTypes, setSelectedRkTypes] = useLocalStorage<string[]>(
    'dashboard_rkTypes',
    [...PREDEFINED_RK_TYPES]
  );

  // Всегда по умолчанию выбраны все значения (даже если ранее сохранился пустой массив)
  useEffect(() => {
    if (!selectedRkTypes || selectedRkTypes.length === 0) {
      setSelectedRkTypes(allRkTypes);
    }
  }, [allRkTypes, selectedRkTypes, setSelectedRkTypes]);

  const initialDates = useMemo(() => getMinMaxDates(initialData), [initialData]);
  const [dateFrom, setDateFrom] = useLocalLocalDate('dashboard_dateFrom', initialDates.minDate);
  const [dateTo, setDateTo] = useLocalLocalDate('dashboard_dateTo', initialDates.maxDate);

  // Если даты еще не установлены, но данные появились/загружены в БД, подставляем min и max
  useEffect(() => {
    if (data.length > 0 && (!dateFrom || !dateTo)) {
      const { minDate, maxDate } = getMinMaxDates(data);
      if (!dateFrom && minDate) setDateFrom(minDate);
      if (!dateTo && maxDate) setDateTo(maxDate);
    }
  }, [data, dateFrom, dateTo, setDateFrom, setDateTo]);

  // Обработчик обновления данных после синхронизации (подставляет min/max даты и выбирает все типы РК)
  const handleDataUpdated = useCallback((newData: DataRow[]) => {
    setData(newData);
    if (newData && newData.length > 0) {
      const { minDate, maxDate } = getMinMaxDates(newData);
      if (minDate) setDateFrom(minDate);
      if (maxDate) setDateTo(maxDate);

      const typesFromNewData = newData
        .map(d => (d['Тип РК'] as string)?.trim())
        .filter((t): t is string => Boolean(t) && t !== 'null' && t !== 'undefined' && t !== '');
      const allNewRk = Array.from(new Set([...PREDEFINED_RK_TYPES, ...typesFromNewData]));
      setSelectedRkTypes(allNewRk);
    } else {
      // База данных полностью очищена: сбрасываем фильтры дат
      setDateFrom(undefined);
      setDateTo(undefined);
      setSelectedRkTypes([...PREDEFINED_RK_TYPES]);
    }
  }, [setDateFrom, setDateTo, setSelectedRkTypes]);

  const [unitFormat, setUnitFormat] = useLocalStorage<'auto' | 'raw' | 'thousands' | 'millions'>('dashboard_unitFormat', 'auto');

  // Базовая фильтрация по глобальным фильтрам
  const filteredBase = useMemo(() => {
    return data.filter(row => {
      const rowDate = parse(row['Дата'] as string, 'yyyy-MM-dd', new Date());
      const passRk = selectedRkTypes.includes(row['Тип РК'] as string) ||
        (selectedRkTypes.includes('Органика (без рекламы)') && (row['Тип РК'] === 'Органика' || !row['Тип РК']));
      const passFrom = dateFrom ? !isBefore(rowDate, dateFrom) : true;
      const passTo = dateTo ? !isAfter(rowDate, dateTo) : true;
      return passRk && passFrom && passTo;
    });
  }, [data, selectedRkTypes, dateFrom, dateTo]);

  // Списки продавцов (фильтруем неизвестных и сортируем по алфавиту)
  const allSellers = useMemo(() => {
    const rawSellers = Array.from(new Set(filteredBase.map(d => d.name as string)));
    return sortSellersAlphabetically(
      rawSellers.filter(s => s && s !== 'nan' && !s.startsWith('Продавец '))
    );
  }, [filteredBase]);

  // O(1) Мемоизированный индекс агрегатов продавцов по дням
  const sellerDailyMap = useMemo(() => {
    const map = new Map<string, DataRow[]>();
    const bySellerByDate: Record<string, Record<string, DataRow>> = {};

    for (let i = 0; i < filteredBase.length; i++) {
      const curr = filteredBase[i];
      const seller = curr.name as string;
      if (!seller) continue;
      const date = curr['Дата'] as string;
      if (!date) continue;

      if (!bySellerByDate[seller]) {
        bySellerByDate[seller] = {};
      }
      if (!bySellerByDate[seller][date]) {
        bySellerByDate[seller][date] = {
          ...curr,
          'Расходы на РК': 0, 'Показы': 0, 'Клики': 0, 'Корзины (всего)': 0,
          'Заказов шт. (по РК)': 0, 'Сумма заказов (по РК)': 0, 'Заказов шт. (всего)': 0,
          'Сумма заказов (всего)': 0, 'Сумма выкупов': 0, 'Отмены шт.': 0, 'Возвраты шт.': 0
        };
      }
      const acc = bySellerByDate[seller][date];
      acc['Расходы на РК'] = Number(acc['Расходы на РК'] || 0) + Number(curr['Расходы на РК'] || 0);
      acc['Показы'] = Number(acc['Показы'] || 0) + Number(curr['Показы'] || 0);
      acc['Клики'] = Number(acc['Клики'] || 0) + Number(curr['Клики'] || 0);
      acc['Корзины (всего)'] = Number(acc['Корзины (всего)'] || 0) + Number(curr['Корзины (всего)'] || 0);
      acc['Заказов шт. (по РК)'] = Number(acc['Заказов шт. (по РК)'] || 0) + Number(curr['Заказов шт. (по РК)'] || 0);
      acc['Сумма заказов (по РК)'] = Number(acc['Сумма заказов (по РК)'] || 0) + Number(curr['Сумма заказов (по РК)'] || 0);
      acc['Заказов шт. (всего)'] = Number(acc['Заказов шт. (всего)'] || 0) + Number(curr['Заказов шт. (всего)'] || 0);
      acc['Сумма заказов (всего)'] = Number(acc['Сумма заказов (всего)'] || 0) + Number(curr['Сумма заказов (всего)'] || 0);
      acc['Сумма выкупов'] = Number(acc['Сумма выкупов'] || 0) + Number(curr['Сумма выкупов'] || 0);
      acc['Отмены шт.'] = Number(acc['Отмены шт.'] || 0) + Number(curr['Отмены шт.'] || 0);
      acc['Возвраты шт.'] = Number(acc['Возвраты шт.'] || 0) + Number(curr['Возвраты шт.'] || 0);
    }

    for (const seller in bySellerByDate) {
      const sorted = Object.values(bySellerByDate[seller])
        .sort((a, b) => new Date(a['Дата'] as string).getTime() - new Date(b['Дата'] as string).getTime())
        .map(r => calculateMetrics(r));
      map.set(seller, sorted);
    }

    return map;
  }, [filteredBase]);

  const getSellerDailyData = useCallback((sellerName: string): DataRow[] => {
    return sellerDailyMap.get(sellerName) || [];
  }, [sellerDailyMap]);

  const formatMetricValue = useCallback((value: any, metricName?: string) => {
    if (value === undefined || value === null || isNaN(Number(value)) || Number(value) === 0) return '';
    const val = Number(value);

    // 1. Проценты (CTR, CR, ДРР, СПП, доли)
    if (metricName && (metricName.includes('%') || metricName.includes('ДРР'))) {
      return `${val.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`;
    }

    // 2. Коэффициенты (ROAS, Halo)
    if (metricName && (metricName.includes('ROAS') || metricName.includes('Halo'))) {
      return `${val.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}`;
    }

    // 3. Абсолютные / денежные показатели с учетом выбранной размерности
    if (unitFormat === 'raw') {
      return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(val);
    }
    if (unitFormat === 'thousands') {
      return (val / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' тыс.';
    }
    if (unitFormat === 'millions') {
      return (val / 1000000).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' млн';
    }
    return new Intl.NumberFormat('ru-RU', { notation: 'compact', compactDisplay: 'short' }).format(val);
  }, [unitFormat]);

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Акцентная карточка с фильтрами и панелью управления */}
      <div className="w-full max-w-[1920px] mx-auto px-3 sm:px-6 lg:px-8 py-2.5 mb-2">
        <Card className="bg-muted/40 border-muted shadow-sm">
          <CardContent className="px-3 py-2 sm:px-4 sm:py-2 flex flex-wrap items-center justify-center gap-x-4 lg:gap-x-5 gap-y-2">
            {/* Блок 1: Период анализа */}
            <div className="flex flex-col items-center justify-center shrink-0">
              <label className="text-[11px] font-medium text-muted-foreground text-center block mb-1 leading-none">
                Период анализа
              </label>
              <div className="flex items-center gap-1">
                <Popover>
                  <PopoverTrigger className="flex items-center h-8 w-[114px] sm:w-[118px] justify-start rounded-md border border-input bg-background px-2 py-1 text-xs font-normal shadow-sm hover:bg-accent hover:text-accent-foreground text-left">
                    <CalendarIcon className="mr-1 h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="truncate">{dateFrom ? format(dateFrom, 'dd.MM.yyyy') : 'Дата С'}</span>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={dateFrom} defaultMonth={dateFrom} onSelect={(val) => setDateFrom(val)} />
                  </PopoverContent>
                </Popover>
                <span className="text-muted-foreground text-[10px]">–</span>
                <Popover>
                  <PopoverTrigger className="flex items-center h-8 w-[114px] sm:w-[118px] justify-start rounded-md border border-input bg-background px-2 py-1 text-xs font-normal shadow-sm hover:bg-accent hover:text-accent-foreground text-left">
                    <CalendarIcon className="mr-1 h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="truncate">{dateTo ? format(dateTo, 'dd.MM.yyyy') : 'Дата ПО'}</span>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={dateTo} defaultMonth={dateTo} onSelect={(val) => setDateTo(val)} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Блок 2: Тип РК */}
            <div className="flex flex-col items-center justify-center shrink-0">
              <div className="flex items-center justify-center gap-1 mb-1 leading-none">
                <label className="text-[11px] font-medium text-muted-foreground text-center leading-none">
                  Тип РК
                </label>
                <Popover>
                  <PopoverTrigger
                    className="inline-flex items-center justify-center text-muted-foreground hover:text-primary transition-colors cursor-pointer rounded-full p-0.5"
                    title="Справка по типам рекламных кампаний и учету продаж"
                  >
                    <Info className="h-3 w-3" />
                  </PopoverTrigger>
                  <PopoverContent
                    align="center"
                    side="bottom"
                    className="w-[330px] sm:w-[370px] p-3.5 space-y-2.5 shadow-xl border bg-popover text-popover-foreground text-xs"
                  >
                    <div className="flex items-center justify-between border-b pb-2">
                      <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                        <Info className="h-3.5 w-3.5 text-primary" />
                        <span>Типы рекламных кампаний</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {/* Органика (без рекламы) */}
                      <div className="rounded-md border p-2 bg-muted/30 space-y-1">
                        <div className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span>Органика (без рекламы)</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          По товару были продажи или выкупы, но реклама в этот день <strong>не крутилась</strong>. Фильтр позволяет оценить чистый естественный спрос без влияния рекламных расходов.
                        </p>
                      </div>

                      {/* Единая ставка */}
                      <div className="rounded-md border p-2 bg-muted/30 space-y-1">
                        <div className="flex items-center gap-1.5 font-medium text-blue-600 dark:text-blue-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          <span>Единая ставка (АРК)</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Автоматическая рекламная кампания. Ставка устанавливается на всю кампанию, а алгоритмы площадки сами распределяют показы между поиском, каталогом и рекомендациями.
                        </p>
                      </div>

                      {/* Ручная ставка */}
                      <div className="rounded-md border p-2 bg-muted/30 space-y-1">
                        <div className="flex items-center gap-1.5 font-medium text-purple-600 dark:text-purple-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                          <span>Ручная ставка</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Кампании с ручным раздельным управлением ставками для каждого типа размещения (отдельно Поиск, Каталог, Карточка товара).
                        </p>
                      </div>

                      {/* Аллокация продаж (Вес РК) */}
                      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 space-y-1">
                        <div className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
                          <Sparkles className="w-3 h-3 text-amber-500" />
                          <span>Защита от задвоения (Вес РК)</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Если на один товар за день действовало несколько кампаний, общие продажи не дублируются, а справедливо распределяются пропорционально расходам каждой РК:
                          <span className="block mt-1 font-mono text-[10px] text-foreground/80 bg-background/80 px-1.5 py-0.5 rounded border">
                            Вес РК = Расход РК / Все расходы на товар за день
                          </span>
                        </p>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-2.5 sm:gap-3 border rounded-md px-2.5 h-8 bg-background shadow-sm">
                {allRkTypes.map(rk => (
                  <div key={rk} className="flex items-center space-x-1.5">
                    <Checkbox
                      id={`rk-${rk}`}
                      checked={selectedRkTypes.includes(rk)}
                      onCheckedChange={(checked) => {
                        if (checked) setSelectedRkTypes([...selectedRkTypes, rk]);
                        else setSelectedRkTypes(selectedRkTypes.filter(r => r !== rk));
                      }}
                      className="h-3.5 w-3.5"
                    />
                    <label
                      htmlFor={`rk-${rk}`}
                      className="text-xs font-normal text-foreground cursor-pointer leading-none whitespace-nowrap select-none"
                      title={rk}
                    >
                      {getRkLabel(rk)}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Блок 3: Размерность */}
            <div className="flex flex-col items-center justify-center shrink-0">
              <label className="text-[11px] font-medium text-muted-foreground text-center block mb-1 leading-none">
                Размерность
              </label>
              <Select value={unitFormat} onValueChange={(val) => setUnitFormat(val as any)}>
                <SelectTrigger className="w-[125px] sm:w-[135px] h-8 bg-background shadow-sm text-xs">
                  <SelectValue placeholder="Размерность">
                    {(val: string | null) => (val && UNIT_LABELS[val] ? UNIT_LABELS[val] : 'Авто (сокращ.)')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Авто (сокращ.)</SelectItem>
                  <SelectItem value="raw">Натуральные ед.</SelectItem>
                  <SelectItem value="thousands">Тысячи (тыс.)</SelectItem>
                  <SelectItem value="millions">Миллионы (млн)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Блок 4: Управление и действия */}
            <div className="flex flex-col items-center justify-center shrink-0">
              <div className="flex items-center justify-center gap-1.5 mb-1 leading-none">
                <label className="text-[11px] font-medium text-muted-foreground text-center block leading-none">
                  Управление
                </label>
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 leading-none tracking-tight" title={`Версия приложения: v${APP_VERSION}`}>
                  v{APP_VERSION}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Link href="/dictionary" passHref>
                  <Button variant="outline" size="icon" className="h-8 w-8 shrink-0 shadow-sm" title="Справочник метрик">
                    <Book className="h-3.5 w-3.5" />
                  </Button>
                </Link>
                <ThemeToggle />
                <DataSyncPopover onDataUpdated={handleDataUpdated} />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleShutdown}
                  disabled={isShuttingDown}
                  className="h-8 px-2.5 flex items-center gap-1.5 border-destructive/40 hover:border-destructive hover:bg-destructive/10 text-destructive bg-background shadow-sm text-xs font-medium shrink-0 transition-colors"
                  title="Завершить работу приложения, остановить сервер и закрыть вкладку"
                >
                  {isShuttingDown ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Power className="h-3.5 w-3.5" />
                  )}
                  <span>Завершить работу</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="w-full px-4 md:px-8 lg:px-12 space-y-12 max-w-[2560px] mx-auto">
        {data.length === 0 ? (
          <div className="max-w-4xl mx-auto my-6 space-y-6">
            <Card className="border-border/60 bg-gradient-to-b from-card via-card/95 to-muted/20 shadow-md overflow-hidden">
              <CardContent className="p-6 sm:p-8 space-y-6">
                {/* Заголовок */}
                <div className="text-center space-y-2">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-inner border border-primary/20">
                    <Database className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    База данных пока пуста
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
                    Для построения аналитических графиков и срезов выполните первую загрузку отчетов по продажам и рекламе.
                  </p>
                </div>

                {/* 3 простых шага загрузки */}
                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    <span>Порядок первой загрузки данных:</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Шаг 1 */}
                    <div className="rounded-xl border bg-background/60 p-4 space-y-2 flex flex-col shadow-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
                          1
                        </span>
                        <span className="font-semibold text-xs text-foreground">Нажмите «Данные»</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed flex-1">
                        В блоке <b>«Управление»</b> на верхней панели нажмите кнопку <b>«Данные»</b> (расположена слева от кнопки «Завершить работу»).
                      </p>
                    </div>

                    {/* Шаг 2 */}
                    <div className="rounded-xl border bg-background/60 p-4 space-y-2 flex flex-col shadow-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
                          2
                        </span>
                        <span className="font-semibold text-xs text-foreground">Укажите папки</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed flex-1">
                        Выберите папку с отчетами по <b>продажам</b> и папку с отчетами по <b>рекламе</b> (кнопки откроют стандартный диалог Finder).
                      </p>
                    </div>

                    {/* Шаг 3 */}
                    <div className="rounded-xl border bg-background/60 p-4 space-y-2 flex flex-col shadow-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
                          3
                        </span>
                        <span className="font-semibold text-xs text-foreground">Синхронизируйте</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed flex-1">
                        Нажмите кнопку <b>«Синхронизировать данные в папках с базой данных»</b> для запуска импорта файлов в базу.
                      </p>
                    </div>
                  </div>
                </div>

                {/* БЛОК ПОВЫШЕННОГО ВНИМАНИЯ: Формат дат */}
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10 p-4 sm:p-5 space-y-3">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold text-xs sm:text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>Формат дат в отчетах (критически важно для корректной обработки):</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="rounded-lg border border-amber-500/20 bg-background/80 p-3 space-y-1">
                      <span className="font-semibold text-foreground block">Допустимые форматы даты:</span>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        • <b>ДД.ММ.ГГГГ</b> (напр. <code className="text-[10px] px-1 py-0.5 rounded bg-muted text-foreground">15.05.2024</code>)<br />
                        • <b>ГГГГ-ММ-ДД</b> (напр. <code className="text-[10px] px-1 py-0.5 rounded bg-muted text-foreground">2024-05-15</code>)<br />
                        • Стандартный нативный тип даты Excel
                      </p>
                    </div>

                    <div className="rounded-lg border border-amber-500/20 bg-background/80 p-3 space-y-1">
                      <span className="font-semibold text-foreground block">Названия колонок с датами:</span>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        • В отчетах продаж: колонка <b>«Период»</b> (или <b>«Дата»</b>)<br />
                        • В отчетах рекламы: колонка <b>«Дата»</b> (или <b>«event_date»</b>)
                      </p>
                    </div>

                    <div className="rounded-lg border border-amber-500/20 bg-background/80 p-3 space-y-1">
                      <span className="font-semibold text-foreground block">Недопустимо (вызовет ошибку):</span>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        • Одиночные числа (напр. только день <code className="text-[10px] px-1 py-0.5 rounded bg-muted text-foreground">1..31</code> или номер месяца)<br />
                        • Года вне диапазона <b>2000–2050 гг.</b>
                      </p>
                    </div>
                  </div>
                </div>

                {/* На что еще обратить внимание */}
                <div className="rounded-xl border border-border/80 bg-muted/30 p-4 sm:p-5 space-y-3">
                  <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-blue-500 shrink-0" />
                    <span>Требования к файлам и важные моменты:</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="flex items-start gap-2.5 text-muted-foreground bg-background/60 p-3 rounded-lg border border-border/50">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-foreground block">Форматы файлов и шапка:</span>
                        <span className="block text-[11px] mt-0.5 leading-relaxed">
                          Поддерживаются таблицы <b>.xlsx</b>, <b>.xls</b> и <b>.csv</b> (кодировка UTF-8). Первая строка файла обязательно должна быть строкой заголовков (без пустых строк над ней и без объединенных ячеек в шапке).
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5 text-muted-foreground bg-background/60 p-3 rounded-lg border border-border/50">
                      <CalendarIcon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-foreground block">Связка данных (склейка):</span>
                        <span className="block text-[11px] mt-0.5 leading-relaxed">
                          Для точного сопоставления продаж и рекламы в таблицах должны присутствовать идентификаторы: товар (<b>id_товара</b> / <b>nm_id</b> / <b>item_id</b>) и продавец (<b>id_продавца</b> / <b>supplier_id</b>).
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5 text-muted-foreground bg-background/60 p-3 rounded-lg border border-border/50">
                      <RefreshCw className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-foreground block">Инкрементальная синхронизация:</span>
                        <span className="block text-[11px] mt-0.5 leading-relaxed">
                          При поступлении новых отчетов просто сохраняйте их в выбранные папки. Система распознает изменения и добавит только свежие файлы без создания дубликатов.
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5 text-muted-foreground bg-background/60 p-3 rounded-lg border border-border/50">
                      <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-foreground block">Очистка при неверных данных:</span>
                        <span className="block text-[11px] mt-0.5 leading-relaxed">
                          Если в базу ошибочно попали поврежденные файлы, в меню «Данные» доступна кнопка <b>«Очистить базу данных»</b> (потребуется подтверждение действия).
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          filteredBase.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground bg-muted/20 rounded-lg">
              Нет данных по выбранному диапазону дат или типам РК.
            </div>
          ) : (
            <>
              {/* ГРАФИК #1: Сравнительный анализ продавцов №1 */}
              <ComparativeChartSection
                id="g1"
                title="Сравнительный анализ продавцов №1"
                icon={<BarChart3 className="w-6 h-6 text-primary" />}
                allSellers={allSellers}
                getSellerDailyData={getSellerDailyData}
                formatMetricValue={formatMetricValue}
                unitFormat={unitFormat}
                chartColors={CHART_COLORS}
                className="pt-4"
              />

              {/* ГРАФИК #2: Влияние игрока №1 */}
              <CorrelationChartSection
                id="g2"
                title="Влияние игрока №1"
                icon={<Activity className="w-6 h-6 text-primary" />}
                allSellers={allSellers}
                getSellerDailyData={getSellerDailyData}
                formatMetricValue={formatMetricValue}
                unitFormat={unitFormat}
                chartColors={CHART_COLORS}
                defaultMetric1="Расходы на РК"
                defaultMetric2="Сумма заказов (всего)"
                className="border-t pt-8"
              />

              {/* ГРАФИК #3: Сравнительный анализ продавцов №2 */}
              <ComparativeChartSection
                id="g3"
                title="Сравнительный анализ продавцов №2"
                icon={<BarChart3 className="w-6 h-6 text-primary" />}
                allSellers={allSellers}
                getSellerDailyData={getSellerDailyData}
                formatMetricValue={formatMetricValue}
                unitFormat={unitFormat}
                chartColors={CHART_COLORS}
                className="border-t pt-8"
              />

              {/* ГРАФИК #4: Влияние игрока №2 */}
              <CorrelationChartSection
                id="g4"
                title="Влияние игрока №2"
                icon={<Activity className="w-6 h-6 text-primary" />}
                allSellers={allSellers}
                getSellerDailyData={getSellerDailyData}
                formatMetricValue={formatMetricValue}
                unitFormat={unitFormat}
                chartColors={CHART_COLORS}
                defaultMetric1="Клики"
                defaultMetric2="Заказов шт. (всего)"
                className="border-t pt-8"
              />
            </>
          )
        )}
      </div>

      {/* Нижняя информационная плашка с версией приложения */}
      <footer className="w-full max-w-[1920px] mx-auto px-4 md:px-8 py-6 mt-12 border-t border-border/40 text-center">
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-2">
          <span>E-Commerce Analytics Dashboard</span>
          <span>•</span>
          <span className="font-mono font-medium text-foreground/80">v{APP_VERSION}</span>
          <span>•</span>
          <span>Автономный режим Windows</span>
        </p>
      </footer>

      {/* Полноэкранный оверлей после выключения сервера */}
      {isStopped && (
        <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-card border rounded-2xl p-8 max-w-md w-full shadow-2xl text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto text-destructive">
              <Power className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold">Приложение завершило работу</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Локальный сервер успешно остановлен, сетевой порт освобожден.
            </p>
            <div className="pt-2 flex flex-col items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.open('', '_self', '');
                  window.close();
                }}
                className="w-full text-xs font-medium"
              >
                Закрыть вкладку (⌘ + W)
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
