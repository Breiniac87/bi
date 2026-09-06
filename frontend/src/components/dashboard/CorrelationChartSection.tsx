'use client';

import { ReactNode, useRef, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
import { Hash, TrendingUp, BarChart3, LineChart as LineChartIcon } from 'lucide-react';
import { format, parse } from 'date-fns';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { sortedPlotMetrics, sortSellersAlphabetically, type DataRow } from '@/lib/metrics';
import { ResizableThreePane } from '@/components/ui/resizable-three-pane';
import { cn } from '@/lib/utils';

interface CorrelationChartSectionProps {
  id: string;
  title: string;
  icon: ReactNode;
  allSellers: string[];
  getSellerDailyData: (seller: string) => DataRow[];
  formatMetricValue: (value: any, metricName?: string) => string;
  unitFormat: string;
  chartColors: string[];
  defaultMetric1?: string;
  defaultMetric2?: string;
  className?: string;
}

export function CorrelationChartSection({
  id,
  title,
  icon,
  allSellers,
  getSellerDailyData,
  formatMetricValue,
  unitFormat,
  chartColors,
  defaultMetric1 = 'Расходы на РК',
  defaultMetric2 = 'Сумма заказов (всего)',
  className = ''
}: CorrelationChartSectionProps) {
  const [filterState, setFilterState] = useLocalStorage<'hidden' | 'compact' | 'full'>(`dashboard_${id}_state`, 'compact');
  const [chartType, setChartType] = useLocalStorage<'area' | 'bar' | 'line'>(`dashboard_${id}_type`, 'area');
  const [showValues, setShowValues] = useLocalStorage<boolean>(`dashboard_${id}_show_values`, false);
  const [player, setPlayer] = useLocalStorage<string>(`dashboard_${id}_player`, allSellers[0] || '');
  const [metric1, setMetric1] = useLocalStorage<string>(`dashboard_${id}_m1`, defaultMetric1);
  const [metric2, setMetric2] = useLocalStorage<string>(`dashboard_${id}_m2`, defaultMetric2);

  const rawSellerData = player ? getSellerDailyData(player) : [];
  const chartData = rawSellerData.map(r => {
    const dStr = r['Дата'] as string;
    return {
      ...r,
      date_fmt: dStr ? format(parse(dStr, 'yyyy-MM-dd', new Date()), 'dd.MM') : ''
    };
  });

  const color1 = chartColors[0];
  const color2 = chartColors[1];

  const sellerScrollRef = useRef<HTMLDivElement>(null);
  const m1ScrollRef = useRef<HTMLDivElement>(null);
  const m2ScrollRef = useRef<HTMLDivElement>(null);

  // Сброс скролла в самый верх при переключении режима фильтра
  useEffect(() => {
    if (sellerScrollRef.current) sellerScrollRef.current.scrollTop = 0;
    if (m1ScrollRef.current) m1ScrollRef.current.scrollTop = 0;
    if (m2ScrollRef.current) m2ScrollRef.current.scrollTop = 0;
  }, [filterState]);

  const sortedSellers = useMemo(() => {
    return sortSellersAlphabetically(allSellers);
  }, [allSellers]);

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
              <ResizableThreePane
                id={id}
                storageKey={`dashboard_${id}_three_split`}
                defaultSplit1={24}
                defaultSplit2={38}
                left={
                  <div className="flex flex-col w-full min-w-0 pr-0 lg:pr-3">
                    <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-border/40">
                      <span className="text-xs font-semibold text-muted-foreground">Продавец:</span>
                      <span className="text-[11px] text-primary font-medium truncate max-w-[120px]" title={player}>
                        {player}
                      </span>
                    </div>

                    <div
                      ref={sellerScrollRef}
                      className={cn(
                        "w-full transition-all pr-1",
                        filterState === 'compact'
                          ? "max-h-[175px] overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 hover:scrollbar-thumb-muted-foreground/40"
                          : ""
                      )}
                    >
                      <RadioGroup
                        value={player}
                        onValueChange={(val) => setPlayer(val || '')}
                        className="grid grid-cols-[repeat(auto-fill,minmax(115px,1fr))] gap-x-2 gap-y-1 py-1"
                      >
                        {sortedSellers.map(s => {
                          const isSelected = player === s;
                          return (
                            <label
                              key={s}
                              htmlFor={`${id}-player-${s}`}
                              className={cn(
                                "flex items-center space-x-2 px-2 py-1 rounded-md transition-colors cursor-pointer text-xs select-none min-h-[28px]",
                                isSelected
                                  ? "bg-primary/10 text-primary font-medium border border-primary/25 shadow-xs"
                                  : "hover:bg-muted/50 text-foreground/80 border border-transparent"
                              )}
                              title={s}
                            >
                              <RadioGroupItem value={s} id={`${id}-player-${s}`} className="shrink-0" />
                              <span className="truncate leading-tight">{s}</span>
                            </label>
                          );
                        })}
                      </RadioGroup>
                    </div>
                  </div>
                }
                middle={
                  <div className="flex flex-col w-full min-w-0 px-0 lg:px-2">
                    <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-border/40">
                      <span className="text-xs font-semibold text-muted-foreground truncate">Метрика 1 (Левая ось):</span>
                      <span className="text-[11px] font-medium truncate max-w-[160px]" style={{ color: color1 }} title={metric1}>
                        {metric1}
                      </span>
                    </div>

                    <div
                      ref={m1ScrollRef}
                      className={cn(
                        "w-full transition-all pr-1",
                        filterState === 'compact'
                          ? "max-h-[175px] overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 hover:scrollbar-thumb-muted-foreground/40"
                          : ""
                      )}
                    >
                      <RadioGroup
                        value={metric1}
                        onValueChange={(val) => setMetric1(val || '')}
                        className="grid grid-cols-[repeat(auto-fill,minmax(145px,1fr))] gap-x-2 gap-y-1 py-1"
                      >
                        {sortedPlotMetrics.map(m => {
                          const isSelected = metric1 === m;
                          return (
                            <label
                              key={m}
                              htmlFor={`${id}-m1-${m}`}
                              className={cn(
                                "flex items-center space-x-2 px-2 py-1 rounded-md transition-colors cursor-pointer text-xs select-none min-h-[28px]",
                                isSelected
                                  ? "bg-primary/10 text-primary font-medium border border-primary/25 shadow-xs"
                                  : "hover:bg-muted/50 text-foreground/80 border border-transparent"
                              )}
                              title={m}
                            >
                              <RadioGroupItem value={m} id={`${id}-m1-${m}`} className="shrink-0" />
                              <span className="truncate leading-tight">{m}</span>
                            </label>
                          );
                        })}
                      </RadioGroup>
                    </div>
                  </div>
                }
                right={
                  <div className="flex flex-col w-full min-w-0 pl-0 lg:pl-3">
                    <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-border/40">
                      <span className="text-xs font-semibold text-muted-foreground truncate">Метрика 2 (Правая ось):</span>
                      <span className="text-[11px] font-medium truncate max-w-[160px]" style={{ color: color2 }} title={metric2}>
                        {metric2}
                      </span>
                    </div>

                    <div
                      ref={m2ScrollRef}
                      className={cn(
                        "w-full transition-all pr-1",
                        filterState === 'compact'
                          ? "max-h-[175px] overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 hover:scrollbar-thumb-muted-foreground/40"
                          : ""
                      )}
                    >
                      <RadioGroup
                        value={metric2}
                        onValueChange={(val) => setMetric2(val || '')}
                        className="grid grid-cols-[repeat(auto-fill,minmax(145px,1fr))] gap-x-2 gap-y-1 py-1"
                      >
                        {sortedPlotMetrics.map(m => {
                          const isSelected = metric2 === m;
                          return (
                            <label
                              key={m}
                              htmlFor={`${id}-m2-${m}`}
                              className={cn(
                                "flex items-center space-x-2 px-2 py-1 rounded-md transition-colors cursor-pointer text-xs select-none min-h-[28px]",
                                isSelected
                                  ? "bg-primary/10 text-primary font-medium border border-primary/25 shadow-xs"
                                  : "hover:bg-muted/50 text-foreground/80 border border-transparent"
                              )}
                              title={m}
                            >
                              <RadioGroupItem value={m} id={`${id}-m2-${m}`} className="shrink-0" />
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

        <div className="w-full h-[500px] mt-6">
          {player ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
                <defs>
                  <linearGradient id={`color-${id}-1`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color1} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={color1} stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id={`color-${id}-2`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color2} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={color2} stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.3} />
                <XAxis dataKey="date_fmt" tickLine={false} axisLine={false} tickMargin={10} />
                <YAxis
                  yAxisId="left"
                  stroke={color1}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  width={unitFormat === 'raw' ? 90 : 70}
                  tickFormatter={(val) => formatMetricValue(val, metric1)}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke={color2}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  width={unitFormat === 'raw' ? 90 : 70}
                  tickFormatter={(val) => formatMetricValue(val, metric2)}
                />
                <ChartTooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-background border rounded-lg shadow-lg p-3">
                          <p className="font-semibold mb-2">
                            {label} ({player})
                          </p>
                          {payload.map((p: any) => {
                            const currentMetric = p.name;
                            return (
                              <div key={p.dataKey} className="flex items-center gap-2 text-sm">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                                <span className="font-medium">{p.name}:</span>
                                <span>{formatMetricValue(p.value, currentMetric)}</span>
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
                {chartType === 'bar' ? (
                  <>
                    <Bar yAxisId="left" dataKey={metric1} name={metric1} fill={color1} radius={[4, 4, 0, 0]}>
                      {showValues && (
                        <LabelList
                          position="top"
                          formatter={(val: any) => formatMetricValue(val, metric1)}
                          style={{ fontSize: 10, fill: 'currentColor' }}
                        />
                      )}
                    </Bar>
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey={metric2}
                      name={metric2}
                      stroke={color2}
                      strokeWidth={2.5}
                      dot={showValues ? { r: 3 } : false}
                      connectNulls
                    >
                      {showValues && (
                        <LabelList
                          position="top"
                          formatter={(val: any) => formatMetricValue(val, metric2)}
                          style={{ fontSize: 10, fill: 'currentColor' }}
                        />
                      )}
                    </Line>
                  </>
                ) : chartType === 'line' ? (
                  <>
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey={metric1}
                      name={metric1}
                      stroke={color1}
                      strokeWidth={2.5}
                      dot={showValues ? { r: 3 } : false}
                      connectNulls
                    >
                      {showValues && (
                        <LabelList
                          position="top"
                          formatter={(val: any) => formatMetricValue(val, metric1)}
                          style={{ fontSize: 10, fill: 'currentColor' }}
                        />
                      )}
                    </Line>
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey={metric2}
                      name={metric2}
                      stroke={color2}
                      strokeWidth={2.5}
                      dot={showValues ? { r: 3 } : false}
                      connectNulls
                    >
                      {showValues && (
                        <LabelList
                          position="top"
                          formatter={(val: any) => formatMetricValue(val, metric2)}
                          style={{ fontSize: 10, fill: 'currentColor' }}
                        />
                      )}
                    </Line>
                  </>
                ) : (
                  <>
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey={metric1}
                      name={metric1}
                      stroke={color1}
                      fillOpacity={1}
                      fill={`url(#color-${id}-1)`}
                      strokeWidth={2}
                      dot={showValues ? { r: 3 } : false}
                      connectNulls
                    >
                      {showValues && (
                        <LabelList
                          position="top"
                          formatter={(val: any) => formatMetricValue(val, metric1)}
                          style={{ fontSize: 10, fill: 'currentColor' }}
                        />
                      )}
                    </Area>
                    <Area
                      yAxisId="right"
                      type="monotone"
                      dataKey={metric2}
                      name={metric2}
                      stroke={color2}
                      fillOpacity={1}
                      fill={`url(#color-${id}-2)`}
                      strokeWidth={2}
                      dot={showValues ? { r: 3 } : false}
                      connectNulls
                    >
                      {showValues && (
                        <LabelList
                          position="top"
                          formatter={(val: any) => formatMetricValue(val, metric2)}
                          style={{ fontSize: 10, fill: 'currentColor' }}
                        />
                      )}
                    </Area>
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center bg-muted/10 rounded-lg text-muted-foreground">
              Выберите продавца
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
