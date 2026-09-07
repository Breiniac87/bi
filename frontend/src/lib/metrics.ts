export type DataRow = Record<string, string | number | undefined | null>;

export function calculateMetrics(res: DataRow): DataRow {
  // На вход подается объект с агрегированными суммами за день,
  // возвращается НОВЫЙ чистый объект (pure function), дополненный метриками.
  const out: DataRow = { ...res };

  const hasAds = Number(res['has_ads']) === 1 || (
    res['Показы'] !== null && res['Показы'] !== undefined &&
    res['Клики'] !== null && res['Клики'] !== undefined
  );
  const hasSales = Number(res['has_sales']) === 1 || (
    res['Заказов шт. (всего)'] !== null && res['Заказов шт. (всего)'] !== undefined
  );

  // 1. Метрики только рекламы
  if (hasAds) {
    const imp = Number(res['Показы']) || 0;
    const clicks = Number(res['Клики']) || 0;
    const carts = Number(res['Корзины (всего)']) || 0;
    const ordersAds = Number(res['Заказов шт. (по РК)']) || 0;
    const gmvAds = Number(res['Сумма заказов (по РК)']) || 0;
    const expenses = Number(res['Расходы на РК']) || 0;

    out['Ставка за 1000 (CPM)'] = imp > 0 ? (expenses / imp) * 1000 : 0;
    out['Цена за клик (CPC)'] = clicks > 0 ? expenses / clicks : 0;
    out['% CTR'] = imp > 0 ? (clicks / imp) * 100 : 0;
    out['% CR клик - корзина'] = clicks > 0 ? (carts / clicks) * 100 : 0;
    out['% CR корзина - заказ'] = carts > 0 ? (ordersAds / carts) * 100 : 0;
    out['% CR клик - заказ'] = clicks > 0 ? (ordersAds / clicks) * 100 : 0;
    out['Стоимость заказа (по РК)'] = ordersAds > 0 ? expenses / ordersAds : 0;
    out['% ДРР / по РК'] = gmvAds > 0 ? (expenses / gmvAds) * 100 : 0;
  } else {
    out['Расходы на РК'] = null;
    out['Показы'] = null;
    out['Клики'] = null;
    out['Корзины (всего)'] = null;
    out['Заказов шт. (по РК)'] = null;
    out['Сумма заказов (по РК)'] = null;
    out['Медианная позиция'] = null;
    out['Ставка за 1000 (CPM)'] = null;
    out['Цена за клик (CPC)'] = null;
    out['% CTR'] = null;
    out['% CR клик - корзина'] = null;
    out['% CR корзина - заказ'] = null;
    out['% CR клик - заказ'] = null;
    out['Стоимость заказа (по РК)'] = null;
    out['% ДРР / по РК'] = null;
  }

  // 2. Метрики только продаж
  if (hasSales) {
    const ordersTotal = Number(res['Заказов шт. (всего)']) || 0;
    const gmvTotal = Number(res['Сумма заказов (всего)']) || 0;
    const cancels = Number(res['Отмены шт.']) || 0;
    const returns = Number(res['Возвраты шт.']) || 0;

    out['Средний чек (AOV)'] = ordersTotal > 0 ? gmvTotal / ordersTotal : 0;
    out['Доля отмен и возвратов (%)'] = ordersTotal > 0 ? ((cancels + returns) / ordersTotal) * 100 : 0;
  } else {
    out['Заказов шт. (всего)'] = null;
    out['Сумма заказов (всего)'] = null;
    out['Сумма выкупов'] = null;
    out['Отмены шт.'] = null;
    out['Возвраты шт.'] = null;
    out['Цена до СПП'] = null;
    out['Цена после СПП'] = null;
    out['СПП %'] = null;
    out['Средний чек (AOV)'] = null;
    out['Доля отмен и возвратов (%)'] = null;
  }

  // 3. Совместные (кросс) метрики: вычисляются строго если есть И реклама, И продажи!
  if (hasAds && hasSales) {
    const ordersAds = Number(res['Заказов шт. (по РК)']) || 0;
    const ordersTotal = Number(res['Заказов шт. (всего)']) || 0;
    const gmvTotal = Number(res['Сумма заказов (всего)']) || 0;
    const buyouts = Number(res['Сумма выкупов']) || 0;
    const expenses = Number(res['Расходы на РК']) || 0;

    out['Стоимость заказа (всего)'] = ordersTotal > 0 ? expenses / ordersTotal : 0;
    out['% ДРР / общий'] = gmvTotal > 0 ? (expenses / gmvTotal) * 100 : 0;
    out['ДРР продажи'] = buyouts > 0 ? (expenses / buyouts) * 100 : 0;
    out['Доля органики (%)'] = ordersTotal > 0 ? ((ordersTotal - ordersAds) / ordersTotal) * 100 : 0;
    out['Halo-эффект'] = ordersAds > 0 ? ordersTotal / ordersAds : 0;
    out['Истинный ROAS (выручка на 1₽)'] = expenses > 0 ? buyouts / expenses : 0;
  } else {
    out['Стоимость заказа (всего)'] = null;
    out['% ДРР / общий'] = null;
    out['ДРР продажи'] = null;
    out['Доля органики (%)'] = null;
    out['Halo-эффект'] = null;
    out['Истинный ROAS (выручка на 1₽)'] = null;
  }

  // Округление до 2 знаков для существующих числовых значений
  const colsToRound = [
    'Расходы на РК', 'Сумма заказов (по РК)', 'Ставка за 1000 (CPM)', 'Цена за клик (CPC)', 
    'Стоимость заказа (по РК)', 'Сумма заказов (всего)', 'Стоимость заказа (всего)', 'Сумма выкупов', 
    'Цена до СПП', 'Цена после СПП', '% CTR', '% CR клик - корзина', '% CR корзина - заказ', 
    '% CR клик - заказ', '% ДРР / по РК', '% ДРР / общий', 'СПП %', 'ДРР продажи', 'Заказов шт. (всего)', 
    'Медианная позиция', 'Доля органики (%)', 'Halo-эффект', 'Средний чек (AOV)', 
    'Доля отмен и возвратов (%)', 'Истинный ROAS (выручка на 1₽)'
  ];

  for (const col of colsToRound) {
    if (out[col] !== undefined && out[col] !== null) {
      out[col] = Math.round(Number(out[col]) * 100) / 100;
    }
  }

  return out;
}

export const plotMetrics = [
  'Расходы на РК', 'Показы', 'Клики', 'Корзины (всего)',
  'Заказов шт. (по РК)', 'Сумма заказов (по РК)',
  'Заказов шт. (всего)', 'Сумма заказов (всего)', 'Сумма выкупов',
  'Цена до СПП', 'Цена после СПП', 'СПП %',
  'Ставка за 1000 (CPM)', 'Цена за клик (CPC)', '% CTR',
  '% CR клик - корзина', '% CR корзина - заказ', '% CR клик - заказ',
  'Стоимость заказа (по РК)', '% ДРР / по РК', 'Стоимость заказа (всего)',
  '% ДРР / общий', 'ДРР продажи', 'Доля органики (%)', 'Halo-эффект',
  'Средний чек (AOV)', 'Доля отмен и возвратов (%)', 'Истинный ROAS (выручка на 1₽)'
];

// Умная сортировка метрик по алфавиту: 
// игнорирует префиксы символов вроде "%", группирует русские термины А-Я, затем латинские A-Z
const cleanMetricKey = (s: string) => s.replace(/^[%#\s]+/, '').trim();

export const sortedPlotMetrics = [...plotMetrics].sort((a, b) => {
  const keyA = cleanMetricKey(a);
  const keyB = cleanMetricKey(b);
  const isCyrA = /[а-яё]/i.test(keyA[0] || '');
  const isCyrB = /[а-яё]/i.test(keyB[0] || '');
  if (isCyrA !== isCyrB) return isCyrA ? -1 : 1;
  return keyA.localeCompare(keyB, 'ru', { sensitivity: 'base' });
});

// Алфавитная регистронезависимая сортировка продавцов (A-Z, затем А-Я)
export function sortSellersAlphabetically(sellers: string[]): string[] {
  return [...sellers].sort((a, b) => {
    const sA = (a || '').toLowerCase().trim();
    const sB = (b || '').toLowerCase().trim();
    const isCyrA = /[а-яё]/i.test(sA[0] || '');
    const isCyrB = /[а-яё]/i.test(sB[0] || '');
    if (isCyrA !== isCyrB) return isCyrA ? 1 : -1;
    return sA.localeCompare(sB, 'ru', { sensitivity: 'base' });
  });
}

