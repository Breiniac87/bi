'use client';
import { ReactNode, useRef, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as ChartTooltip,
  Legend,
  Area,
  Bar,
  Line,
  LabelList
} from 'recharts';
import { Hash, TrendingUp, BarChart3, LineChart as LineChartIcon, Search, X } from 'lucide-react';
import { format, parse } from 'date-fns';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { sortedPlotMetrics, sortSellersAlphabetically, type DataRow } from '@/lib/metrics';
import { ResizableSplitPane } from '@/components/ui/resizable-split-pane';
import { cn } from '@/lib/utils';

interface ComparativeChartSectionProps {
  id: string;
  title: string;
  icon: ReactNode;
  allSellers: string[];
  getSellerDailyData: (seller: string) => DataRow[];
  formatMetricValue: (value: any, metricName?: string) => string;
  unitFormat: string;
  chartColors: string[];
  className?: string;
}

export function ComparativeChartSection({
  id,
  title,
  icon,
  allSellers,
  getSellerDailyData,
  formatMetricValue,
  unitFormat,
  chartColors,
  className = ''
}: ComparativeChartSectionProps) {
  const [filterState, setFilterState] = useLocalStorage<'hidden' | 'compact' | 'full'>(`dashboard_${id}_state`, 'compact');
  const [chartType, setChartType] = useLocalStorage<'area' | 'bar' | 'line'>(`dashboard_${id}_type`, 'area');
  const [showValues, setShowValues] = useLocalStorage<boolean>(`dashboard_${id}_show_values`, false);
  const [sellers, setSellers] = useLocalStorage<string[]>(`dashboard_${id}_sellers`, allSellers.slice(0, 3));
  const [metric, setMetric] = useLocalStorage<string>(`dashboard_${id}_metric`, id === 'g1' ? 'Сумма заказов (всего)' : 'Заказов шт. (всего)');

  // Ограничение по выбору одновременных продавцов: не более 10
  const MAX_SELECTED_SELLERS = 10;

  // Активные продавцы (строго не более 10 для предотвращения переполнения графика)
  const activeSellers = useMemo(() => {
    return (sellers || []).slice(0, MAX_SELECTED_SELLERS);
  }, [sellers]);

  // Защита: если в сохраненном состоянии оказалось больше 10 продавцов, автоматически обрезаем
  useEffect(() => {
    if (sellers && sellers.length > MAX_SELECTED_SELLERS) {
      setSellers(sellers.slice(0, MAX_SELECTED_SELLERS));
    }
  }, [sellers, setSellers]);

  // Построение сводной матрицы дат для выбранных продавцов (максимум 10)
  const datesMap = new Map<string, DataRow>();
  activeSellers.forEach(seller => {
    const sellerData = getSellerDailyData(seller);
    sellerData.forEach((row: DataRow) => {
      const dStr = row['Дата'] as string;
      if (!datesMap.has(dStr)) {
        datesMap.set(dStr, {
          'Дата': dStr,
          date_fmt: format(parse(dStr, 'yyyy-MM-dd', new Date()), 'dd.MM')
        });
      }
      const existing = datesMap.get(dStr)!;
      existing[seller] = row as unknown as string | number;
    });
  });

  const chartData = Array.from(datesMap.values()).sort(
    (a, b) => new Date(a['Дата'] as string).getTime() - new Date(b['Дата'] as string).getTime()
  );

  const sellersScrollRef = useRef<HTMLDivElement>(null);
  const metricsScrollRef = useRef<HTMLDivElement>(null);

  // Сброс скролла в самый верх при переключении режима фильтра,
  // чтобы первая строка никогда не обрезалась
  useEffect(() => {
    if (sellersScrollRef.current) sellersScrollRef.current.scrollTop = 0;
    if (metricsScrollRef.current) metricsScrollRef.current.scrollTop = 0;
  }, [filterState]);

  const [sellerSearch, setSellerSearch] = useState('');

  const sortedSellers = useMemo(() => {
    return sortSellersAlphabetically(allSellers);
  }, [allSellers]);

  const filteredSellers = useMemo(() => {
    if (!sellerSearch.trim()) return sortedSellers;
    const q = sellerSearch.toLowerCase().trim();
    return sortedSellers.filter(s => s.toLowerCase().includes(q));
  }, [sortedSellers, sellerSearch]);

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-xl font-medium flex items-center gap-2">
          {icon} {title}
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center space-x-1 bg-muted p-1 rounded-lg">
            <button
              onClick={() => setShowValues(!showValues)}
              className={`px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1.5 ${
                showValues ? 'bg-background shadow font-medium' : 'hover:bg-background/50 text-muted-foreground'
              }`}
            >
              <Hash className="w-3.5 h-3.5" /> Значения
            </button>
          </div>
          <div className="flex items-center space-x-1 bg-muted p-1 rounded-lg">
            <button
              onClick={() => setChartType('area')}
              className={`px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1.5 ${
                chartType === 'area' ? 'bg-background shadow font-medium' : 'hover:bg-background/50 text-muted-foreground'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" /> Область
            </button>
            <button
              onClick={() => setChartType('bar')}
              className={`px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1.5 ${
                chartType === 'bar' ? 'bg-background shadow font-medium' : 'hover:bg-background/50 text-muted-foreground'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" /> Столбцы
            </button>
            <button
              onClick={() => setChartType('line')}
              className={`px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1.5 ${
                chartType === 'line' ? 'bg-background shadow font-medium' : 'hover:bg-background/50 text-muted-foreground'
              }`}
            >
              <LineChartIcon className="w-3.5 h-3.5" /> Линии
            </button>
          </div>
          <div className="flex items-center space-x-1 bg-muted p-1 rounded-lg">
            <button
              onClick={() => setFilterState('hidden')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                filterState === 'hidden' ? 'bg-background shadow' : 'hover:bg-background/50 text-muted-foreground'
              }`}
            >
              Скрыты
            </button>
            <button
              onClick={() => setFilterState('compact')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                filterState === 'compact' ? 'bg-background shadow' : 'hover:bg-background/50 text-muted-foreground'
              }`}
            >
              Компактно
            </button>
            <button
              onClick={() => setFilterState('full')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                filterState === 'full' ? 'bg-background shadow' : 'hover:bg-background/50 text-muted-foreground'
              }`}
            >
              Развернуты
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {filterState !== 'hidden' && (
          <Card className="w-full bg-slate-50/50 dark:bg-slate-900/50 text-card-foreground shadow-sm border border-red-500/60 dark:border-red-500/60">
            <CardContent className="p-3 sm:p-4">
              <ResizableSplitPane
                id={id}
                storageKey={`dashboard_${id}_split_pct`}
                defaultSplit={32}
                minPercent={18}
                maxPercent={65}
                left={
                  <div className="flex flex-col w-full min-w-0 pr-0 lg:pr-3">
                    {/* Header с подсчетом и кнопками Все/Сброс */}
                    <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-border/40">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-muted-foreground">
                          Продавцы:
                        </span>
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.2 rounded font-mono font-medium",
                          activeSellers.length >= MAX_SELECTED_SELLERS
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                            : "text-muted-foreground/80 bg-muted"
                        )}>
                          {sellerSearch.trim()
                            ? `${activeSellers.length}/${MAX_SELECTED_SELLERS} (${filteredSellers.length})`
                            : `${activeSellers.length}/${MAX_SELECTED_SELLERS}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (sellerSearch.trim()) {
                              const set = new Set([...activeSellers, ...filteredSellers]);
                              setSellers(Array.from(set).slice(0, MAX_SELECTED_SELLERS));
                            } else {
                              setSellers(sortedSellers.slice(0, MAX_SELECTED_SELLERS));
                            }
                          }}
                          className="text-[11px] px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
                          title={sellerSearch.trim() ? `Выбрать до ${MAX_SELECTED_SELLERS} найденных продавцов` : `Выбрать первые ${MAX_SELECTED_SELLERS} продавцов`}
                        >
                          {sellerSearch.trim() ? "Выбрать 10" : "Топ-10"}
                        </button>
                        <span className="text-muted-foreground/30 text-[10px]">|</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (sellerSearch.trim()) {
                              const toRemove = new Set(filteredSellers);
                              setSellers(activeSellers.filter(s => !toRemove.has(s)));
                            } else {
                              setSellers([]);
                            }
                          }}
                          className="text-[11px] px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
                          title={sellerSearch.trim() ? "Снять выбор с найденных продавцов" : "Снять выбор со всех продавцов"}
                        >
                          Сброс
                        </button>
                      </div>
                    </div>

                    {/* Предупреждение о достижении лимита в 10 продавцов */}
                    {activeSellers.length >= MAX_SELECTED_SELLERS && (
                      <div className="text-[10.5px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded mb-1.5 flex items-center justify-between">
                        <span>Максимум 10 продавцов</span>
                        <span className="text-[9.5px] opacity-75">снимите выбор для смены</span>
                      </div>
                    )}

                    {/* Компактная строка поиска по вхождению */}
                    <div className="relative mb-1.5">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60 pointer-events-none" />
                      <input
                        type="text"
                        value={sellerSearch}
                        onChange={(e) => setSellerSearch(e.target.value)}
                        placeholder="Поиск по названию..."
                        className="w-full h-7 pl-7 pr-7 text-xs bg-background/80 hover:bg-background focus:bg-background border border-border/60 rounded-md focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground/60 transition-colors"
                      />
                      {sellerSearch && (
                        <button
                          type="button"
                          onClick={() => setSellerSearch('')}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground p-0.5 rounded transition-colors"
                          title="Очистить поиск"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Скролл-контейнер со строгой высотой строк */}
                    <div
                      ref={sellersScrollRef}
                      className={cn(
                        "w-full transition-all pr-1",
                        filterState === 'compact'
                          ? "max-h-[175px] overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 hover:scrollbar-thumb-muted-foreground/40"
                          : ""
                      )}
                    >
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-x-2 gap-y-1 py-1">
                        {filteredSellers.map(seller => {
                          const isChecked = activeSellers.includes(seller);
                          const isMaxReached = activeSellers.length >= MAX_SELECTED_SELLERS;
                          const isDisabled = !isChecked && isMaxReached;

                          return (
                            <label
                              key={seller}
                              htmlFor={`${id}-${seller}`}
                              className={cn(
                                "flex items-center space-x-2 px-2 py-1 rounded-md transition-colors text-xs select-none min-h-[28px]",
                                isDisabled ? "opacity-40 cursor-not-allowed text-muted-foreground" : "cursor-pointer",
                                isChecked
                                  ? "bg-primary/10 text-primary font-medium"
                                  : !isDisabled && "hover:bg-muted/50 text-foreground/80"
                              )}
                              title={
                                isDisabled
                                  ? `Достигнут лимит: максимум ${MAX_SELECTED_SELLERS} одновременных продавцов. Снимите выбор с другого продавца.`
                                  : seller
                              }
                            >
                              <Checkbox
                                id={`${id}-${seller}`}
                                className="shrink-0"
                                checked={isChecked}
                                disabled={isDisabled}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    if (activeSellers.length < MAX_SELECTED_SELLERS) {
                                      setSellers([...activeSellers, seller]);
                                    }
                                  } else {
                                    setSellers(activeSellers.filter(s => s !== seller));
                                  }
                                }}
                              />
                              <span className="truncate leading-tight">{seller}</span>
                            </label>
                          );
                        })}
                      </div>
                      {filteredSellers.length === 0 && (
                        <div className="text-center py-4 text-xs text-muted-foreground">
                          Продавцы не найдены
                        </div>
                      )}
                    </div>
                  </div>
                }
                right={
                  <div className="flex flex-col w-full min-w-0 pl-0 lg:pl-3">
                    {/* Header с подсчетом и активной метрикой */}
                    <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-border/40">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-muted-foreground">
                          Целевая метрика:
                        </span>
                        <span className="text-[10px] text-muted-foreground/80 bg-muted px-1.5 py-0.2 rounded font-mono">
                          {sortedPlotMetrics.length}
                        </span>
                      </div>
                      <span className="text-[11px] text-primary font-medium truncate max-w-[220px]" title={metric}>
                        {metric}
                      </span>
                    </div>

                    {/* Скролл-контейнер метрик */}
                    <div
                      ref={metricsScrollRef}
                      className={cn(
                        "w-full transition-all pr-1",
                        filterState === 'compact'
                          ? "max-h-[175px] overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 hover:scrollbar-thumb-muted-foreground/40"
                          : ""
                      )}
                    >
                      <RadioGroup
                        value={metric}
                        onValueChange={(val) => setMetric(val || '')}
                        className="grid grid-cols-[repeat(auto-fill,minmax(155px,1fr))] gap-x-2 gap-y-1 py-1"
                      >
                        {sortedPlotMetrics.map(m => {
                          const isSelected = metric === m;
                          return (
                            <label
                              key={m}
                              htmlFor={`${id}-metric-${m}`}
                              className={cn(
                                "flex items-center space-x-2 px-2 py-1 rounded-md transition-colors cursor-pointer text-xs select-none min-h-[28px]",
                                isSelected
                                  ? "bg-primary/10 text-primary font-medium border border-primary/25 shadow-xs"
                                  : "hover:bg-muted/50 text-foreground/80 border border-transparent"
                              )}
                              title={m}
                            >
                              <RadioGroupItem value={m} id={`${id}-metric-${m}`} className="shrink-0" />
                              <span className="truncate leading-tight">{m}</span>
                            </label>
                          );
                        })}
                      </RadioGroup>
                    </div>
                  </div>
                }
              />
            </CardContent>
          </Card>
        )}

        <div className="w-full h-[500px]">
          {activeSellers.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <defs>
                  {activeSellers.map((seller, idx) => (
                    <linearGradient key={`color-${id}-${idx}`} id={`color-${id}-${idx}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColors[idx % chartColors.length]} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={chartColors[idx % chartColors.length]} stopOpacity={0.0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.3} />
                <XAxis dataKey="date_fmt" tickLine={false} axisLine={false} tickMargin={10} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  width={unitFormat === 'raw' ? 90 : 70}
                  tickFormatter={(val) => formatMetricValue(val, metric)}
                />
                <ChartTooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-background border rounded-lg shadow-lg p-3">
                          <p className="font-semibold mb-2">{label}</p>
                          {payload.map((p: any) => {
                            const val = p.payload[p.name]?.[metric];
                            return (
                              <div key={p.name} className="flex items-center gap-2 text-sm">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                                <span className="font-medium">{p.name}:</span>
                                <span>{val === null || val === undefined ? 'Нет данных' : formatMetricValue(val, metric)}</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend />
                {activeSellers.map((seller, idx) => {
                  const color = chartColors[idx % chartColors.length];
                  if (chartType === 'bar') {
                    return (
                      <Bar key={seller} dataKey={(row) => row[seller]?.[metric]} name={seller} fill={color} radius={[4, 4, 0, 0]}>
                        {showValues && (
                          <LabelList
                            position="top"
                            formatter={(val: any) => val === null || val === undefined ? '' : formatMetricValue(val, metric)}
                            style={{ fontSize: 10, fill: 'currentColor' }}
                          />
                        )}
                      </Bar>
                    );
                  }
                  if (chartType === 'line') {
                    return (
                      <Line
                        key={seller}
                        type="monotone"
                        dataKey={(row) => row[seller]?.[metric]}
                        name={seller}
                        stroke={color}
                        strokeWidth={2.5}
                        dot={showValues ? { r: 3 } : false}
                        connectNulls={false}
                      >
                        {showValues && (
                          <LabelList
                            position="top"
                            formatter={(val: any) => val === null || val === undefined ? '' : formatMetricValue(val, metric)}
                            style={{ fontSize: 10, fill: 'currentColor' }}
                          />
                        )}
                      </Line>
                    );
                  }
                  return (
                    <Area
                      key={seller}
                      type="monotone"
                      dataKey={(row) => row[seller]?.[metric]}
                      name={seller}
                      stroke={color}
                      fillOpacity={1}
                      fill={`url(#color-${id}-${idx})`}
                      strokeWidth={2}
                      dot={showValues ? { r: 3 } : false}
                      connectNulls={false}
                    >
                      {showValues && (
                        <LabelList
                          position="top"
                          formatter={(val: any) => val === null || val === undefined ? '' : formatMetricValue(val, metric)}
                          style={{ fontSize: 10, fill: 'currentColor' }}
                        />
                      )}
                    </Area>
                  );
                })}
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col h-full items-center justify-center bg-muted/10 border border-dashed border-border/60 rounded-lg p-6 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div className="text-sm font-medium text-foreground">
                Продавцы не выбраны
              </div>
              <div className="text-xs text-muted-foreground max-w-sm">
                Выберите от 1 до 10 продавцов в панели фильтра слева для построения сравнительного графика.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
