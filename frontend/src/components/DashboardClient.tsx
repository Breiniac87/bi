'use client';

import { useState, useMemo } from 'react';
import { useLocalStorage, useLocalLocalDate } from '@/hooks/use-local-storage';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChartTooltip } from '@/components/ui/chart';
import { Area, AreaChart, Bar, BarChart, Line, LineChart, ComposedChart, CartesianGrid, XAxis, YAxis, Legend, ResponsiveContainer, LabelList } from 'recharts';
import { format, parse, isAfter, isBefore } from 'date-fns';
import { Calendar as CalendarIcon, BarChart3, Activity, TrendingUp, LineChart as LineChartIcon, Hash } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { calculateMetrics, plotMetrics, type DataRow } from '@/lib/metrics';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ThemeToggle } from '@/components/theme-toggle';

const CHART_COLORS = [
  '#2563eb', '#16a34a', '#dc2626', '#ca8a04', '#9333ea', '#0891b2', '#ea580c', '#4f46e5'
];

export function DashboardClient({ initialData }: { initialData: DataRow[] }) {
  const [data] = useState<DataRow[]>(initialData);

  // ГЛОБАЛЬНЫЕ ФИЛЬТРЫ
  const allRkTypes = useMemo(() => Array.from(new Set(data.map(d => d['Тип РК'] as string))).sort(), [data]);
  const [selectedRkTypes, setSelectedRkTypes] = useLocalStorage<string[]>('dashboard_rkTypes', allRkTypes);
  
  const [dateFrom, setDateFrom] = useLocalLocalDate('dashboard_dateFrom',
    data.length > 0 ? parse(data[0]['Дата'] as string, 'yyyy-MM-dd', new Date()) : undefined
  );
  const [dateTo, setDateTo] = useLocalLocalDate('dashboard_dateTo',
    data.length > 0 ? parse(data[data.length - 1]['Дата'] as string, 'yyyy-MM-dd', new Date()) : undefined
  );

  // Базовая фильтрация по глобальным фильтрам
  const filteredBase = useMemo(() => {
    return data.filter(row => {
      const rowDate = parse(row['Дата'] as string, 'yyyy-MM-dd', new Date());
      const passRk = selectedRkTypes.includes(row['Тип РК'] as string);
      const passFrom = dateFrom ? !isBefore(rowDate, dateFrom) : true;
      const passTo = dateTo ? !isAfter(rowDate, dateTo) : true;
      return passRk && passFrom && passTo;
    });
  }, [data, selectedRkTypes, dateFrom, dateTo]);

  // Списки продавцов (фильтруем неизвестных)
  const allSellers = useMemo(() => {
    const rawSellers = Array.from(new Set(filteredBase.map(d => d.name as string)));
    return rawSellers
      .filter(s => s && s !== 'nan' && !s.startsWith('Продавец '))
      .sort();
  }, [filteredBase]);

  // Стейты режимов видимости и типов графиков
  const [filterStateG1, setFilterStateG1] = useLocalStorage<'hidden' | 'compact' | 'full'>('dashboard_g1_state', 'compact');
  const [filterStateG2, setFilterStateG2] = useLocalStorage<'hidden' | 'compact' | 'full'>('dashboard_g2_state', 'compact');
  const [filterStateG3, setFilterStateG3] = useLocalStorage<'hidden' | 'compact' | 'full'>('dashboard_g3_state', 'compact');
  const [filterStateG4, setFilterStateG4] = useLocalStorage<'hidden' | 'compact' | 'full'>('dashboard_g4_state', 'compact');

  const [chartTypeG1, setChartTypeG1] = useLocalStorage<'area' | 'bar' | 'line'>('dashboard_g1_type', 'area');
  const [chartTypeG2, setChartTypeG2] = useLocalStorage<'area' | 'bar' | 'line'>('dashboard_g2_type', 'area');
  const [chartTypeG3, setChartTypeG3] = useLocalStorage<'area' | 'bar' | 'line'>('dashboard_g3_type', 'area');
  const [chartTypeG4, setChartTypeG4] = useLocalStorage<'area' | 'bar' | 'line'>('dashboard_g4_type', 'area');

  const [showValuesG1, setShowValuesG1] = useLocalStorage<boolean>('dashboard_g1_show_values', false);
  const [showValuesG2, setShowValuesG2] = useLocalStorage<boolean>('dashboard_g2_show_values', false);
  const [showValuesG3, setShowValuesG3] = useLocalStorage<boolean>('dashboard_g3_show_values', false);
  const [showValuesG4, setShowValuesG4] = useLocalStorage<boolean>('dashboard_g4_show_values', false);

  const [unitFormat, setUnitFormat] = useLocalStorage<'auto' | 'raw' | 'thousands' | 'millions'>('dashboard_unitFormat', 'auto');

  const formatMetricValue = (value: any, metricName?: string) => {
    if (value === undefined || value === null || isNaN(Number(value)) || Number(value) === 0) return '';
    const val = Number(value);

    // 1. Проценты (CTR, CR, ДРР, СПП, доли) всегда отображаются в % и игнорируют масштабирование
    if (metricName && (metricName.includes('%') || metricName.includes('ДРР'))) {
      return `${val.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`;
    }

    // 2. Коэффициенты (ROAS, Halo) отображаются как простые дроби
    if (metricName && (metricName.includes('ROAS') || metricName.includes('Halo'))) {
      return `${val.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}`;
    }

    // 3. Абсолютные / денежные показатели с учетом выбранной размерности unitFormat
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
  };

  const [sellersG1, setSellersG1] = useLocalStorage<string[]>('dashboard_g1_sellers', allSellers.slice(0, 3));
  const [metricG1, setMetricG1] = useLocalStorage<string>('dashboard_g1_metric', 'Сумма заказов (всего)');

  const [playerG2, setPlayerG2] = useLocalStorage<string>('dashboard_g2_player', allSellers[0] || '');
  const [metric1G2, setMetric1G2] = useLocalStorage<string>('dashboard_g2_m1', 'Расходы на РК');
  const [metric2G2, setMetric2G2] = useLocalStorage<string>('dashboard_g2_m2', 'Сумма заказов (всего)');

  const [sellersG3, setSellersG3] = useLocalStorage<string[]>('dashboard_g3_sellers', allSellers.slice(0, 3));
  const [metricG3, setMetricG3] = useLocalStorage<string>('dashboard_g3_metric', 'Заказов шт. (всего)');

  const [playerG4, setPlayerG4] = useLocalStorage<string>('dashboard_g4_player', allSellers[0] || '');
  const [metric1G4, setMetric1G4] = useLocalStorage<string>('dashboard_g4_m1', 'Клики');
  const [metric2G4, setMetric2G4] = useLocalStorage<string>('dashboard_g4_m2', 'Заказов шт. (всего)');

  // Функция для агрегации данных продавца по дням (для конкретного графика)
  const getSellerDailyData = (sellerName: string) => {
    const sellerRows = filteredBase.filter(r => r.name === sellerName);
    const daily = sellerRows.reduce((acc, curr) => {
      const date = curr['Дата'] as string;
      if (!acc[date]) {
        acc[date] = { ...curr, 'Расходы на РК': 0, 'Показы': 0, 'Клики': 0, 'Корзины (всего)': 0, 'Заказов шт. (по РК)': 0, 'Сумма заказов (по РК)': 0, 'Заказов шт. (всего)': 0, 'Сумма заказов (всего)': 0, 'Сумма выкупов': 0, 'Отмены шт.': 0, 'Возвраты шт.': 0 };
      }
      acc[date]['Расходы на РК'] += Number(curr['Расходы на РК'] || 0);
      acc[date]['Показы'] += Number(curr['Показы'] || 0);
      acc[date]['Клики'] += Number(curr['Клики'] || 0);
      acc[date]['Корзины (всего)'] += Number(curr['Корзины (всего)'] || 0);
      acc[date]['Заказов шт. (по РК)'] += Number(curr['Заказов шт. (по РК)'] || 0);
      acc[date]['Сумма заказов (по РК)'] += Number(curr['Сумма заказов (по РК)'] || 0);
      acc[date]['Заказов шт. (всего)'] += Number(curr['Заказов шт. (всего)'] || 0);
      acc[date]['Сумма заказов (всего)'] += Number(curr['Сумма заказов (всего)'] || 0);
      acc[date]['Сумма выкупов'] += Number(curr['Сумма выкупов'] || 0);
      acc[date]['Отмены шт.'] += Number(curr['Отмены шт.'] || 0);
      acc[date]['Возвраты шт.'] += Number(curr['Возвраты шт.'] || 0);
      return acc;
    }, {} as Record<string, DataRow>);
    
    return Object.values(daily)
      .sort((a: DataRow, b: DataRow) => new Date(a['Дата'] as string).getTime() - new Date(b['Дата'] as string).getTime())
      .map(row => calculateMetrics(row));
  };

  const buildComparativeData = (selectedSellers: string[]) => {
    const datesMap = new Map<string, DataRow>();
    selectedSellers.forEach(seller => {
      const sellerData = getSellerDailyData(seller);
      sellerData.forEach((row: DataRow) => {
        if (!datesMap.has(row['Дата'] as string)) datesMap.set(row['Дата'] as string, { 'Дата': row['Дата'], date_fmt: format(parse(row['Дата'] as string, 'yyyy-MM-dd', new Date()), 'dd.MM') });
        const existing = datesMap.get(row['Дата'] as string)!;
        existing[seller] = row as unknown as string | number;
      });
    });
    return Array.from(datesMap.values()).sort((a, b) => new Date(a['Дата'] as string).getTime() - new Date(b['Дата'] as string).getTime());
  };

  const chartData1 = buildComparativeData(sellersG1);
  const chartData3 = buildComparativeData(sellersG3);
  const chartData2 = playerG2 ? getSellerDailyData(playerG2).map(r => ({...r, date_fmt: format(parse(r['Дата'] as string, 'yyyy-MM-dd', new Date()), 'dd.MM')})) : [];
  const chartData4 = playerG4 ? getSellerDailyData(playerG4).map(r => ({...r, date_fmt: format(parse(r['Дата'] as string, 'yyyy-MM-dd', new Date()), 'dd.MM')})) : [];

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Акцентная карточка с фильтрами */}
      <div className="w-full max-w-[1920px] mx-auto px-4 md:px-8 lg:px-12 pt-8 mb-8">
        <Card className="bg-muted/40 border-muted shadow-sm">
          <CardContent className="px-4 py-2 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-col md:flex-row gap-6 md:items-center w-full justify-center">
              <div className="flex flex-col items-center justify-center">
                <label className="text-sm font-medium text-muted-foreground text-center block mb-2">Период анализа</label>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger className="flex items-center h-10 w-[140px] justify-start rounded-md border border-input bg-background px-4 py-2 text-sm font-normal shadow-sm hover:bg-accent hover:text-accent-foreground text-left">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateFrom ? format(dateFrom, 'dd.MM.yyyy') : <span>Дата С</span>}
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={dateFrom} defaultMonth={dateFrom} onSelect={(val) => setDateFrom(val)} />
                    </PopoverContent>
                  </Popover>
                  <span className="text-muted-foreground">-</span>
                  <Popover>
                    <PopoverTrigger className="flex items-center h-10 w-[140px] justify-start rounded-md border border-input bg-background px-4 py-2 text-sm font-normal shadow-sm hover:bg-accent hover:text-accent-foreground text-left">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateTo ? format(dateTo, 'dd.MM.yyyy') : <span>Дата ПО</span>}
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={dateTo} defaultMonth={dateTo} onSelect={(val) => setDateTo(val)} />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="flex flex-col items-center justify-center">
                <label className="text-sm font-medium text-muted-foreground text-center block mb-2">Тип РК</label>
                <div className="flex items-center gap-4 border rounded-md px-4 h-10 bg-background shadow-sm">
                  {allRkTypes.map(rk => (
                    <div key={rk} className="flex items-center space-x-2">
                      <Checkbox id={`rk-${rk}`} checked={selectedRkTypes.includes(rk)} onCheckedChange={(checked) => { if (checked) setSelectedRkTypes([...selectedRkTypes, rk]); else setSelectedRkTypes(selectedRkTypes.filter(r => r !== rk)); }} />
                      <label htmlFor={`rk-${rk}`} className="text-sm cursor-pointer leading-none whitespace-nowrap">{rk}</label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col items-center justify-center">
                <label className="text-sm font-medium text-muted-foreground text-center block mb-2">Размерность</label>
                <Select value={unitFormat} onValueChange={(val) => setUnitFormat(val as any)}>
                  <SelectTrigger className="w-[185px] h-10 bg-background shadow-sm">
                    <SelectValue placeholder="Размерность" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Авто (сокращенно)</SelectItem>
                    <SelectItem value="raw">Натуральные ед.</SelectItem>
                    <SelectItem value="thousands">Тысячи (тыс.)</SelectItem>
                    <SelectItem value="millions">Миллионы (млн)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <ThemeToggle />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="w-full px-4 md:px-8 lg:px-12 space-y-12 max-w-[2560px] mx-auto">
        {filteredBase.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground bg-muted/20 rounded-lg">
            Нет данных по выбранному диапазону дат или типам РК.
          </div>
        ) : (
          <>
            {/* ГРАФИК #1 */}
            <div className="space-y-4 pt-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <h2 className="text-xl font-medium flex items-center gap-2"><BarChart3 className="w-6 h-6 text-primary" /> Сравнительный анализ продавцов №1</h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center space-x-1 bg-muted p-1 rounded-lg">
                    <button onClick={() => setShowValuesG1(!showValuesG1)} className={`px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1.5 ${showValuesG1 ? 'bg-background shadow font-medium' : 'hover:bg-background/50 text-muted-foreground'}`}>
                      <Hash className="w-3.5 h-3.5" /> Значения
                    </button>
                  </div>
                  <div className="flex items-center space-x-1 bg-muted p-1 rounded-lg">
                    <button onClick={() => setChartTypeG1('area')} className={`px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1.5 ${chartTypeG1 === 'area' ? 'bg-background shadow font-medium' : 'hover:bg-background/50 text-muted-foreground'}`}>
                      <TrendingUp className="w-3.5 h-3.5" /> Область
                    </button>
                    <button onClick={() => setChartTypeG1('bar')} className={`px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1.5 ${chartTypeG1 === 'bar' ? 'bg-background shadow font-medium' : 'hover:bg-background/50 text-muted-foreground'}`}>
                      <BarChart3 className="w-3.5 h-3.5" /> Столбцы
                    </button>
                    <button onClick={() => setChartTypeG1('line')} className={`px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1.5 ${chartTypeG1 === 'line' ? 'bg-background shadow font-medium' : 'hover:bg-background/50 text-muted-foreground'}`}>
                      <LineChartIcon className="w-3.5 h-3.5" /> Линии
                    </button>
                  </div>
                  <div className="flex items-center space-x-1 bg-muted p-1 rounded-lg">
                    <button onClick={() => setFilterStateG1('hidden')} className={`px-3 py-1 text-xs rounded-md transition-colors ${filterStateG1 === 'hidden' ? 'bg-background shadow' : 'hover:bg-background/50 text-muted-foreground'}`}>Скрыты</button>
                    <button onClick={() => setFilterStateG1('compact')} className={`px-3 py-1 text-xs rounded-md transition-colors ${filterStateG1 === 'compact' ? 'bg-background shadow' : 'hover:bg-background/50 text-muted-foreground'}`}>Компактно</button>
                    <button onClick={() => setFilterStateG1('full')} className={`px-3 py-1 text-xs rounded-md transition-colors ${filterStateG1 === 'full' ? 'bg-background shadow' : 'hover:bg-background/50 text-muted-foreground'}`}>Развернуты</button>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-4">
                {filterStateG1 !== 'hidden' && (
                  <Card className="w-full bg-slate-50/50 dark:bg-slate-900/50 text-card-foreground shadow-sm border border-red-500/60 dark:border-red-500/60">
                    <CardContent className="grid grid-cols-1 lg:grid-cols-[1fr_auto_2fr] gap-6 px-4 py-2">
                      <div className="flex flex-col w-full">
                        <label className="text-sm font-medium text-muted-foreground text-center block mb-2">Продавцы:</label>
                        <div className={`grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-x-3 gap-y-2 pt-1 ${filterStateG1 === 'compact' ? 'max-h-[160px] overflow-y-auto' : ''}`}>
                          {allSellers.map(seller => (
                            <div key={seller} className="flex items-start space-x-2">
                              <Checkbox id={`g1-${seller}`} className="mt-0.5" checked={sellersG1.includes(seller)} onCheckedChange={(checked) => { if (checked) setSellersG1([...sellersG1, seller]); else setSellersG1(sellersG1.filter(s => s !== seller)); }} />
                              <label htmlFor={`g1-${seller}`} className="text-sm cursor-pointer leading-tight break-words" title={seller}>{seller}</label>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <div className="w-px bg-border/50 hidden lg:block"></div>
                      
                      <div className="flex flex-col w-full">
                        <label className="text-sm font-medium text-muted-foreground text-center block mb-2">Целевая метрика:</label>
                        <RadioGroup value={metricG1} onValueChange={(val) => setMetricG1(val || '')} className={`grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-x-3 gap-y-2 pt-1 ${filterStateG1 === 'compact' ? 'max-h-[160px] overflow-y-auto' : ''}`}>
                          {plotMetrics.map(m => (
                            <div key={m} className="flex items-start space-x-2">
                              <RadioGroupItem value={m} id={`g1-metric-${m}`} className="mt-0.5" />
                              <label htmlFor={`g1-metric-${m}`} className="text-sm cursor-pointer leading-tight break-words">{m}</label>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>
                    </CardContent>
                  </Card>
                )}
                <div className="w-full h-[500px]">
                  {sellersG1.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData1} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                        <defs>
                          {sellersG1.map((seller, idx) => (
                            <linearGradient key={`colorG1-${idx}`} id={`colorG1-${idx}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={CHART_COLORS[idx % CHART_COLORS.length]} stopOpacity={0.4}/>
                              <stop offset="95%" stopColor={CHART_COLORS[idx % CHART_COLORS.length]} stopOpacity={0.0}/>
                            </linearGradient>
                          ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.3} />
                        <XAxis dataKey="date_fmt" tickLine={false} axisLine={false} tickMargin={10} />
                        <YAxis tickLine={false} axisLine={false} tickMargin={10} width={unitFormat === 'raw' ? 90 : 70} tickFormatter={(val) => formatMetricValue(val, metricG1)} />
                        <ChartTooltip content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-background border rounded-lg shadow-lg p-3">
                                <p className="font-semibold mb-2">{label}</p>
                                {payload.map((p: { name: string; color: string; payload: Record<string, DataRow> }) => (
                                  <div key={p.name} className="flex items-center gap-2 text-sm">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                                    <span className="font-medium">{p.name}:</span>
                                    <span>{formatMetricValue(p.payload[p.name]?.[metricG1], metricG1) || 0}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          }
                          return null;
                        }} />
                        <Legend />
                        {sellersG1.map((seller, idx) => {
                          const color = CHART_COLORS[idx % CHART_COLORS.length];
                          if (chartTypeG1 === 'bar') {
                            return (
                              <Bar key={seller} dataKey={(row) => row[seller]?.[metricG1]} name={seller} fill={color} radius={[4, 4, 0, 0]}>
                                {showValuesG1 && <LabelList position="top" formatter={(val: any) => formatMetricValue(val, metricG1)} style={{ fontSize: 10, fill: 'currentColor' }} />}
                              </Bar>
                            );
                          }
                          if (chartTypeG1 === 'line') {
                            return (
                              <Line key={seller} type="monotone" dataKey={(row) => row[seller]?.[metricG1]} name={seller} stroke={color} strokeWidth={2.5} dot={showValuesG1 ? { r: 3 } : false} connectNulls>
                                {showValuesG1 && <LabelList position="top" formatter={(val: any) => formatMetricValue(val, metricG1)} style={{ fontSize: 10, fill: 'currentColor' }} />}
                              </Line>
                            );
                          }
                          return (
                            <Area key={seller} type="monotone" dataKey={(row) => row[seller]?.[metricG1]} name={seller} stroke={color} fillOpacity={1} fill={`url(#colorG1-${idx})`} strokeWidth={2} dot={showValuesG1 ? { r: 3 } : false} connectNulls>
                              {showValuesG1 && <LabelList position="top" formatter={(val: any) => formatMetricValue(val, metricG1)} style={{ fontSize: 10, fill: 'currentColor' }} />}
                            </Area>
                          );
                        })}
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center bg-muted/10 rounded-lg text-muted-foreground">Выберите продавцов сверху</div>
                  )}
                </div>
              </div>
            </div>

            {/* ГРАФИК #2 */}
            <div className="space-y-4 border-t pt-8">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <h2 className="text-xl font-medium flex items-center gap-2"><Activity className="w-6 h-6 text-primary" /> Влияние игрока №1</h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center space-x-1 bg-muted p-1 rounded-lg">
                    <button onClick={() => setShowValuesG2(!showValuesG2)} className={`px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1.5 ${showValuesG2 ? 'bg-background shadow font-medium' : 'hover:bg-background/50 text-muted-foreground'}`}>
                      <Hash className="w-3.5 h-3.5" /> Значения
                    </button>
                  </div>
                  <div className="flex items-center space-x-1 bg-muted p-1 rounded-lg">
                    <button onClick={() => setChartTypeG2('area')} className={`px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1.5 ${chartTypeG2 === 'area' ? 'bg-background shadow font-medium' : 'hover:bg-background/50 text-muted-foreground'}`}>
                      <TrendingUp className="w-3.5 h-3.5" /> Область
                    </button>
                    <button onClick={() => setChartTypeG2('bar')} className={`px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1.5 ${chartTypeG2 === 'bar' ? 'bg-background shadow font-medium' : 'hover:bg-background/50 text-muted-foreground'}`}>
                      <BarChart3 className="w-3.5 h-3.5" /> Столбцы
                    </button>
                    <button onClick={() => setChartTypeG2('line')} className={`px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1.5 ${chartTypeG2 === 'line' ? 'bg-background shadow font-medium' : 'hover:bg-background/50 text-muted-foreground'}`}>
                      <LineChartIcon className="w-3.5 h-3.5" /> Линии
                    </button>
                  </div>
                  <div className="flex items-center space-x-1 bg-muted p-1 rounded-lg">
                    <button onClick={() => setFilterStateG2('hidden')} className={`px-3 py-1 text-xs rounded-md transition-colors ${filterStateG2 === 'hidden' ? 'bg-background shadow' : 'hover:bg-background/50 text-muted-foreground'}`}>Скрыты</button>
                    <button onClick={() => setFilterStateG2('compact')} className={`px-3 py-1 text-xs rounded-md transition-colors ${filterStateG2 === 'compact' ? 'bg-background shadow' : 'hover:bg-background/50 text-muted-foreground'}`}>Компактно</button>
                    <button onClick={() => setFilterStateG2('full')} className={`px-3 py-1 text-xs rounded-md transition-colors ${filterStateG2 === 'full' ? 'bg-background shadow' : 'hover:bg-background/50 text-muted-foreground'}`}>Развернуты</button>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-4">
                {filterStateG2 !== 'hidden' && (
                  <Card className="w-full bg-slate-50/50 dark:bg-slate-900/50 text-card-foreground shadow-sm border border-red-500/60 dark:border-red-500/60">
                    <CardContent className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1.5fr_auto_1.5fr] gap-6 px-4 py-2">
                      
                      <div className="flex flex-col w-full">
                        <label className="text-sm font-medium text-muted-foreground text-center block mb-2">Продавец:</label>
                        <RadioGroup value={playerG2} onValueChange={(val) => setPlayerG2(val || '')} className={`grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-x-3 gap-y-2 pt-1 ${filterStateG2 === 'compact' ? 'max-h-[160px] overflow-y-auto' : ''}`}>
                          {allSellers.map(s => (
                            <div key={s} className="flex items-start space-x-2">
                              <RadioGroupItem value={s} id={`g2-player-${s}`} className="mt-0.5" />
                              <label htmlFor={`g2-player-${s}`} className="text-sm cursor-pointer leading-tight break-words">{s}</label>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>

                      <div className="w-px bg-border/50 hidden lg:block"></div>
                      
                      <div className="flex flex-col w-full">
                        <label className="text-sm font-medium text-muted-foreground text-center block mb-2">Метрика 1 (Левая ось):</label>
                        <RadioGroup value={metric1G2} onValueChange={(val) => setMetric1G2(val || '')} className={`grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-x-3 gap-y-2 pt-1 ${filterStateG2 === 'compact' ? 'max-h-[160px] overflow-y-auto' : ''}`}>
                          {plotMetrics.map(m => (
                            <div key={m} className="flex items-start space-x-2">
                              <RadioGroupItem value={m} id={`g2-m1-${m}`} className="mt-0.5" />
                              <label htmlFor={`g2-m1-${m}`} className="text-sm cursor-pointer leading-tight break-words">{m}</label>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>

                      <div className="w-px bg-border/50 hidden lg:block"></div>
                      
                      <div className="flex flex-col w-full">
                        <label className="text-sm font-medium text-muted-foreground text-center block mb-2">Метрика 2 (Правая ось):</label>
                        <RadioGroup value={metric2G2} onValueChange={(val) => setMetric2G2(val || '')} className={`grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-x-3 gap-y-2 pt-1 ${filterStateG2 === 'compact' ? 'max-h-[160px] overflow-y-auto' : ''}`}>
                          {plotMetrics.map(m => (
                            <div key={m} className="flex items-start space-x-2">
                              <RadioGroupItem value={m} id={`g2-m2-${m}`} className="mt-0.5" />
                              <label htmlFor={`g2-m2-${m}`} className="text-sm cursor-pointer leading-tight break-words">{m}</label>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>

                    </CardContent>
                  </Card>
                )}
              </div>
              <div className="w-full h-[500px] mt-6">
                {playerG2 ? (
                  <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData2} margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
                        <defs>
                          <linearGradient id="colorG2-1" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={CHART_COLORS[0]} stopOpacity={0.4}/>
                            <stop offset="95%" stopColor={CHART_COLORS[0]} stopOpacity={0.0}/>
                          </linearGradient>
                          <linearGradient id="colorG2-2" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={CHART_COLORS[1]} stopOpacity={0.4}/>
                            <stop offset="95%" stopColor={CHART_COLORS[1]} stopOpacity={0.0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.3} />
                        <XAxis dataKey="date_fmt" tickLine={false} axisLine={false} tickMargin={10} />
                        <YAxis yAxisId="left" stroke={CHART_COLORS[0]} tickLine={false} axisLine={false} tickMargin={10} width={unitFormat === 'raw' ? 90 : 70} tickFormatter={(val) => formatMetricValue(val, metric1G2)} />
                        <YAxis yAxisId="right" orientation="right" stroke={CHART_COLORS[1]} tickLine={false} axisLine={false} tickMargin={10} width={unitFormat === 'raw' ? 90 : 70} tickFormatter={(val) => formatMetricValue(val, metric2G2)} />
                        <ChartTooltip content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-background border rounded-lg shadow-lg p-3">
                                <p className="font-semibold mb-2">{label} ({playerG2})</p>
                                {payload.map((p: { dataKey: string; color: string; name: string; value: number }) => {
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
                        }} />
                        <Legend />
                        {chartTypeG2 === 'bar' ? (
                          <>
                            <Bar yAxisId="left" dataKey={metric1G2} name={metric1G2} fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]}>
                              {showValuesG2 && <LabelList position="top" formatter={(val: any) => formatMetricValue(val, metric1G2)} style={{ fontSize: 10, fill: 'currentColor' }} />}
                            </Bar>
                            <Line yAxisId="right" type="monotone" dataKey={metric2G2} name={metric2G2} stroke={CHART_COLORS[1]} strokeWidth={2.5} dot={showValuesG2 ? { r: 3 } : false} connectNulls>
                              {showValuesG2 && <LabelList position="top" formatter={(val: any) => formatMetricValue(val, metric2G2)} style={{ fontSize: 10, fill: 'currentColor' }} />}
                            </Line>
                          </>
                        ) : chartTypeG2 === 'line' ? (
                          <>
                            <Line yAxisId="left" type="monotone" dataKey={metric1G2} name={metric1G2} stroke={CHART_COLORS[0]} strokeWidth={2.5} dot={showValuesG2 ? { r: 3 } : false} connectNulls>
                              {showValuesG2 && <LabelList position="top" formatter={(val: any) => formatMetricValue(val, metric1G2)} style={{ fontSize: 10, fill: 'currentColor' }} />}
                            </Line>
                            <Line yAxisId="right" type="monotone" dataKey={metric2G2} name={metric2G2} stroke={CHART_COLORS[1]} strokeWidth={2.5} dot={showValuesG2 ? { r: 3 } : false} connectNulls>
                              {showValuesG2 && <LabelList position="top" formatter={(val: any) => formatMetricValue(val, metric2G2)} style={{ fontSize: 10, fill: 'currentColor' }} />}
                            </Line>
                          </>
                        ) : (
                          <>
                            <Area yAxisId="left" type="monotone" dataKey={metric1G2} name={metric1G2} stroke={CHART_COLORS[0]} fillOpacity={1} fill="url(#colorG2-1)" strokeWidth={2} dot={showValuesG2 ? { r: 3 } : false} connectNulls>
                              {showValuesG2 && <LabelList position="top" formatter={(val: any) => formatMetricValue(val, metric1G2)} style={{ fontSize: 10, fill: 'currentColor' }} />}
                            </Area>
                            <Area yAxisId="right" type="monotone" dataKey={metric2G2} name={metric2G2} stroke={CHART_COLORS[1]} fillOpacity={1} fill="url(#colorG2-2)" strokeWidth={2} dot={showValuesG2 ? { r: 3 } : false} connectNulls>
                              {showValuesG2 && <LabelList position="top" formatter={(val: any) => formatMetricValue(val, metric2G2)} style={{ fontSize: 10, fill: 'currentColor' }} />}
                            </Area>
                          </>
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center bg-muted/10 rounded-lg text-muted-foreground">Выберите продавца</div>
                )}
              </div>
            </div>

            {/* ГРАФИК #3 */}
            <div className="space-y-4 border-t pt-8">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <h2 className="text-xl font-medium flex items-center gap-2"><BarChart3 className="w-6 h-6 text-primary" /> Сравнительный анализ продавцов №2</h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center space-x-1 bg-muted p-1 rounded-lg">
                    <button onClick={() => setShowValuesG3(!showValuesG3)} className={`px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1.5 ${showValuesG3 ? 'bg-background shadow font-medium' : 'hover:bg-background/50 text-muted-foreground'}`}>
                      <Hash className="w-3.5 h-3.5" /> Значения
                    </button>
                  </div>
                  <div className="flex items-center space-x-1 bg-muted p-1 rounded-lg">
                    <button onClick={() => setChartTypeG3('area')} className={`px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1.5 ${chartTypeG3 === 'area' ? 'bg-background shadow font-medium' : 'hover:bg-background/50 text-muted-foreground'}`}>
                      <TrendingUp className="w-3.5 h-3.5" /> Область
                    </button>
                    <button onClick={() => setChartTypeG3('bar')} className={`px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1.5 ${chartTypeG3 === 'bar' ? 'bg-background shadow font-medium' : 'hover:bg-background/50 text-muted-foreground'}`}>
                      <BarChart3 className="w-3.5 h-3.5" /> Столбцы
                    </button>
                    <button onClick={() => setChartTypeG3('line')} className={`px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1.5 ${chartTypeG3 === 'line' ? 'bg-background shadow font-medium' : 'hover:bg-background/50 text-muted-foreground'}`}>
                      <LineChartIcon className="w-3.5 h-3.5" /> Линии
                    </button>
                  </div>
                  <div className="flex items-center space-x-1 bg-muted p-1 rounded-lg">
                    <button onClick={() => setFilterStateG3('hidden')} className={`px-3 py-1 text-xs rounded-md transition-colors ${filterStateG3 === 'hidden' ? 'bg-background shadow' : 'hover:bg-background/50 text-muted-foreground'}`}>Скрыты</button>
                    <button onClick={() => setFilterStateG3('compact')} className={`px-3 py-1 text-xs rounded-md transition-colors ${filterStateG3 === 'compact' ? 'bg-background shadow' : 'hover:bg-background/50 text-muted-foreground'}`}>Компактно</button>
                    <button onClick={() => setFilterStateG3('full')} className={`px-3 py-1 text-xs rounded-md transition-colors ${filterStateG3 === 'full' ? 'bg-background shadow' : 'hover:bg-background/50 text-muted-foreground'}`}>Развернуты</button>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-4">
                {filterStateG3 !== 'hidden' && (
                  <Card className="w-full bg-slate-50/50 dark:bg-slate-900/50 text-card-foreground shadow-sm border border-red-500/60 dark:border-red-500/60">
                    <CardContent className="grid grid-cols-1 lg:grid-cols-[1fr_auto_2fr] gap-6 px-4 py-2">
                      <div className="flex flex-col w-full">
                        <label className="text-sm font-medium text-muted-foreground text-center block mb-2">Продавцы:</label>
                        <div className={`grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-x-3 gap-y-2 pt-1 ${filterStateG3 === 'compact' ? 'max-h-[160px] overflow-y-auto' : ''}`}>
                          {allSellers.map(seller => (
                            <div key={seller} className="flex items-start space-x-2">
                              <Checkbox id={`g3-${seller}`} className="mt-0.5" checked={sellersG3.includes(seller)} onCheckedChange={(checked) => { if (checked) setSellersG3([...sellersG3, seller]); else setSellersG3(sellersG3.filter(s => s !== seller)); }} />
                              <label htmlFor={`g3-${seller}`} className="text-sm cursor-pointer leading-tight break-words" title={seller}>{seller}</label>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <div className="w-px bg-border/50 hidden lg:block"></div>
                      
                      <div className="flex flex-col w-full">
                        <label className="text-sm font-medium text-muted-foreground text-center block mb-2">Целевая метрика:</label>
                        <RadioGroup value={metricG3} onValueChange={(val) => setMetricG3(val || '')} className={`grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-x-3 gap-y-2 pt-1 ${filterStateG3 === 'compact' ? 'max-h-[160px] overflow-y-auto' : ''}`}>
                          {plotMetrics.map(m => (
                            <div key={m} className="flex items-start space-x-2">
                              <RadioGroupItem value={m} id={`g3-metric-${m}`} className="mt-0.5" />
                              <label htmlFor={`g3-metric-${m}`} className="text-sm cursor-pointer leading-tight break-words">{m}</label>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
                <div className="w-full h-[500px]">
                  {sellersG3.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData3} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                        <defs>
                          {sellersG3.map((seller, idx) => (
                            <linearGradient key={`colorG3-${idx}`} id={`colorG3-${idx}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={CHART_COLORS[(idx + 2) % CHART_COLORS.length]} stopOpacity={0.4}/>
                              <stop offset="95%" stopColor={CHART_COLORS[(idx + 2) % CHART_COLORS.length]} stopOpacity={0.0}/>
                            </linearGradient>
                          ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.3} />
                        <XAxis dataKey="date_fmt" tickLine={false} axisLine={false} tickMargin={10} />
                        <YAxis tickLine={false} axisLine={false} tickMargin={10} width={unitFormat === 'raw' ? 90 : 70} tickFormatter={(val) => formatMetricValue(val, metricG3)} />
                        <ChartTooltip content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-background border rounded-lg shadow-lg p-3">
                                <p className="font-semibold mb-2">{label}</p>
                                {payload.map((p: { name: string; color: string; payload: Record<string, DataRow> }) => (
                                  <div key={p.name} className="flex items-center gap-2 text-sm">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                                    <span className="font-medium">{p.name}:</span>
                                    <span>{formatMetricValue(p.payload[p.name]?.[metricG3], metricG3) || 0}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          }
                          return null;
                        }} />
                        <Legend />
                        {sellersG3.map((seller, idx) => {
                          const color = CHART_COLORS[(idx + 2) % CHART_COLORS.length];
                          if (chartTypeG3 === 'bar') {
                            return (
                              <Bar key={seller} dataKey={(row) => row[seller]?.[metricG3]} name={seller} fill={color} radius={[4, 4, 0, 0]}>
                                {showValuesG3 && <LabelList position="top" formatter={(val: any) => formatMetricValue(val, metricG3)} style={{ fontSize: 10, fill: 'currentColor' }} />}
                              </Bar>
                            );
                          }
                          if (chartTypeG3 === 'line') {
                            return (
                              <Line key={seller} type="monotone" dataKey={(row) => row[seller]?.[metricG3]} name={seller} stroke={color} strokeWidth={2.5} dot={showValuesG3 ? { r: 3 } : false} connectNulls>
                                {showValuesG3 && <LabelList position="top" formatter={(val: any) => formatMetricValue(val, metricG3)} style={{ fontSize: 10, fill: 'currentColor' }} />}
                              </Line>
                            );
                          }
                          return (
                            <Area key={seller} type="monotone" dataKey={(row) => row[seller]?.[metricG3]} name={seller} stroke={color} fillOpacity={1} fill={`url(#colorG3-${idx})`} strokeWidth={2} dot={showValuesG3 ? { r: 3 } : false} connectNulls>
                              {showValuesG3 && <LabelList position="top" formatter={(val: any) => formatMetricValue(val, metricG3)} style={{ fontSize: 10, fill: 'currentColor' }} />}
                            </Area>
                          );
                        })}
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center bg-muted/10 rounded-lg text-muted-foreground">Выберите продавцов сверху</div>
                  )}
                </div>
              </div>


            {/* ГРАФИК #4 */}
            <div className="space-y-4 border-t pt-8 pb-12">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <h2 className="text-xl font-medium flex items-center gap-2"><Activity className="w-6 h-6 text-primary" /> Влияние игрока №2</h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center space-x-1 bg-muted p-1 rounded-lg">
                    <button onClick={() => setShowValuesG4(!showValuesG4)} className={`px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1.5 ${showValuesG4 ? 'bg-background shadow font-medium' : 'hover:bg-background/50 text-muted-foreground'}`}>
                      <Hash className="w-3.5 h-3.5" /> Значения
                    </button>
                  </div>
                  <div className="flex items-center space-x-1 bg-muted p-1 rounded-lg">
                    <button onClick={() => setChartTypeG4('area')} className={`px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1.5 ${chartTypeG4 === 'area' ? 'bg-background shadow font-medium' : 'hover:bg-background/50 text-muted-foreground'}`}>
                      <TrendingUp className="w-3.5 h-3.5" /> Область
                    </button>
                    <button onClick={() => setChartTypeG4('bar')} className={`px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1.5 ${chartTypeG4 === 'bar' ? 'bg-background shadow font-medium' : 'hover:bg-background/50 text-muted-foreground'}`}>
                      <BarChart3 className="w-3.5 h-3.5" /> Столбцы
                    </button>
                    <button onClick={() => setChartTypeG4('line')} className={`px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1.5 ${chartTypeG4 === 'line' ? 'bg-background shadow font-medium' : 'hover:bg-background/50 text-muted-foreground'}`}>
                      <LineChartIcon className="w-3.5 h-3.5" /> Линии
                    </button>
                  </div>
                  <div className="flex items-center space-x-1 bg-muted p-1 rounded-lg">
                    <button onClick={() => setFilterStateG4('hidden')} className={`px-3 py-1 text-xs rounded-md transition-colors ${filterStateG4 === 'hidden' ? 'bg-background shadow' : 'hover:bg-background/50 text-muted-foreground'}`}>Скрыты</button>
                    <button onClick={() => setFilterStateG4('compact')} className={`px-3 py-1 text-xs rounded-md transition-colors ${filterStateG4 === 'compact' ? 'bg-background shadow' : 'hover:bg-background/50 text-muted-foreground'}`}>Компактно</button>
                    <button onClick={() => setFilterStateG4('full')} className={`px-3 py-1 text-xs rounded-md transition-colors ${filterStateG4 === 'full' ? 'bg-background shadow' : 'hover:bg-background/50 text-muted-foreground'}`}>Развернуты</button>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-4">
                {filterStateG4 !== 'hidden' && (
                  <Card className="w-full bg-slate-50/50 dark:bg-slate-900/50 text-card-foreground shadow-sm border border-red-500/60 dark:border-red-500/60">
                    <CardContent className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1.5fr_auto_1.5fr] gap-6 px-4 py-2">
                      
                      <div className="flex flex-col w-full">
                        <label className="text-sm font-medium text-muted-foreground text-center block mb-2">Продавец:</label>
                        <RadioGroup value={playerG4} onValueChange={(val) => setPlayerG4(val || '')} className={`grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-x-3 gap-y-2 pt-1 ${filterStateG4 === 'compact' ? 'max-h-[160px] overflow-y-auto' : ''}`}>
                          {allSellers.map(s => (
                            <div key={s} className="flex items-start space-x-2">
                              <RadioGroupItem value={s} id={`g4-player-${s}`} className="mt-0.5" />
                              <label htmlFor={`g4-player-${s}`} className="text-sm cursor-pointer leading-tight break-words">{s}</label>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>

                      <div className="w-px bg-border/50 hidden lg:block"></div>
                      
                      <div className="flex flex-col w-full">
                        <label className="text-sm font-medium text-muted-foreground text-center block mb-2">Метрика 1 (Левая ось):</label>
                        <RadioGroup value={metric1G4} onValueChange={(val) => setMetric1G4(val || '')} className={`grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-x-3 gap-y-2 pt-1 ${filterStateG4 === 'compact' ? 'max-h-[160px] overflow-y-auto' : ''}`}>
                          {plotMetrics.map(m => (
                            <div key={m} className="flex items-start space-x-2">
                              <RadioGroupItem value={m} id={`g4-m1-${m}`} className="mt-0.5" />
                              <label htmlFor={`g4-m1-${m}`} className="text-sm cursor-pointer leading-tight break-words">{m}</label>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>

                      <div className="w-px bg-border/50 hidden lg:block"></div>
                      
                      <div className="flex flex-col w-full">
                        <label className="text-sm font-medium text-muted-foreground text-center block mb-2">Метрика 2 (Правая ось):</label>
                        <RadioGroup value={metric2G4} onValueChange={(val) => setMetric2G4(val || '')} className={`grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-x-3 gap-y-2 pt-1 ${filterStateG4 === 'compact' ? 'max-h-[160px] overflow-y-auto' : ''}`}>
                          {plotMetrics.map(m => (
                            <div key={m} className="flex items-start space-x-2">
                              <RadioGroupItem value={m} id={`g4-m2-${m}`} className="mt-0.5" />
                              <label htmlFor={`g4-m2-${m}`} className="text-sm cursor-pointer leading-tight break-words">{m}</label>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>

                    </CardContent>
                  </Card>
                )}
              </div>
              <div className="w-full h-[500px] mt-6">
                {playerG4 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData4} margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
                      <defs>
                        <linearGradient id="colorG4-1" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CHART_COLORS[2]} stopOpacity={0.4}/>
                          <stop offset="95%" stopColor={CHART_COLORS[2]} stopOpacity={0.0}/>
                        </linearGradient>
                        <linearGradient id="colorG4-2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CHART_COLORS[3]} stopOpacity={0.4}/>
                          <stop offset="95%" stopColor={CHART_COLORS[3]} stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.3} />
                      <XAxis dataKey="date_fmt" tickLine={false} axisLine={false} tickMargin={10} />
                        <YAxis yAxisId="left" stroke={CHART_COLORS[2]} tickLine={false} axisLine={false} tickMargin={10} width={unitFormat === 'raw' ? 90 : 70} tickFormatter={(val) => formatMetricValue(val, metric1G4)} />
                        <YAxis yAxisId="right" orientation="right" stroke={CHART_COLORS[3]} tickLine={false} axisLine={false} tickMargin={10} width={unitFormat === 'raw' ? 90 : 70} tickFormatter={(val) => formatMetricValue(val, metric2G4)} />
                        <ChartTooltip content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-background border rounded-lg shadow-lg p-3">
                                <p className="font-semibold mb-2">{label} ({playerG4})</p>
                                {payload.map((p: { dataKey: string; color: string; name: string; value: number }) => {
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
                        }} />
                        <Legend />
                        {chartTypeG4 === 'bar' ? (
                          <>
                            <Bar yAxisId="left" dataKey={metric1G4} name={metric1G4} fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]}>
                              {showValuesG4 && <LabelList position="top" formatter={(val: any) => formatMetricValue(val, metric1G4)} style={{ fontSize: 10, fill: 'currentColor' }} />}
                            </Bar>
                            <Line yAxisId="right" type="monotone" dataKey={metric2G4} name={metric2G4} stroke={CHART_COLORS[3]} strokeWidth={2.5} dot={showValuesG4 ? { r: 3 } : false} connectNulls>
                              {showValuesG4 && <LabelList position="top" formatter={(val: any) => formatMetricValue(val, metric2G4)} style={{ fontSize: 10, fill: 'currentColor' }} />}
                            </Line>
                          </>
                        ) : chartTypeG4 === 'line' ? (
                          <>
                            <Line yAxisId="left" type="monotone" dataKey={metric1G4} name={metric1G4} stroke={CHART_COLORS[2]} strokeWidth={2.5} dot={showValuesG4 ? { r: 3 } : false} connectNulls>
                              {showValuesG4 && <LabelList position="top" formatter={(val: any) => formatMetricValue(val, metric1G4)} style={{ fontSize: 10, fill: 'currentColor' }} />}
                            </Line>
                            <Line yAxisId="right" type="monotone" dataKey={metric2G4} name={metric2G4} stroke={CHART_COLORS[3]} strokeWidth={2.5} dot={showValuesG4 ? { r: 3 } : false} connectNulls>
                              {showValuesG4 && <LabelList position="top" formatter={(val: any) => formatMetricValue(val, metric2G4)} style={{ fontSize: 10, fill: 'currentColor' }} />}
                            </Line>
                          </>
                        ) : (
                          <>
                            <Area yAxisId="left" type="monotone" dataKey={metric1G4} name={metric1G4} stroke={CHART_COLORS[2]} fillOpacity={1} fill="url(#colorG4-1)" strokeWidth={2} dot={showValuesG4 ? { r: 3 } : false} connectNulls>
                              {showValuesG4 && <LabelList position="top" formatter={(val: any) => formatMetricValue(val, metric1G4)} style={{ fontSize: 10, fill: 'currentColor' }} />}
                            </Area>
                            <Area yAxisId="right" type="monotone" dataKey={metric2G4} name={metric2G4} stroke={CHART_COLORS[3]} fillOpacity={1} fill="url(#colorG4-2)" strokeWidth={2} dot={showValuesG4 ? { r: 3 } : false} connectNulls>
                              {showValuesG4 && <LabelList position="top" formatter={(val: any) => formatMetricValue(val, metric2G4)} style={{ fontSize: 10, fill: 'currentColor' }} />}
                            </Area>
                          </>
                        )}
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center bg-muted/10 rounded-lg text-muted-foreground">Выберите продавца</div>
                )}
              </div>
            </div>

          </>
        )}
      </div>
    </div>
  );
}
