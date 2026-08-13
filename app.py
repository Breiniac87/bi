import streamlit as st
import pandas as pd
import numpy as np
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import os

# 1. НАСТРОЙКА СТРАНИЦЫ
st.set_page_config(page_title="E-commerce Analytics", page_icon="📊", layout="wide")

# Внедрение CSS для увеличения шрифта на дашборде (фильтры, текст, лейблы)
st.markdown("""
    <style>
    /* Увеличиваем шрифт лейблов, фильтров и обычного текста на 2 пункта (примерно до 16px) */
    p, .stMarkdown p, .stMarkdown li, label, .stSelectbox label, .stMultiSelect label, .stDateInput label {
        font-size: 16px !important;
    }
    div[data-baseweb="select"] {
        font-size: 16px !important;
    }
    </style>
""", unsafe_allow_html=True)

# ==========================================
# 2. ФУНКЦИИ РАСЧЕТА И ОБРАБОТКИ ДАННЫХ
# ==========================================
def calculate_metrics(res):
    """Функция расчета 26+ метрик"""
    res['Ставка за 1000 (CPM)'] = np.where(res['Показы'] > 0, (res['Расходы на РК'] / res['Показы']) * 1000, 0)
    res['Цена за клик (CPC)'] = np.where(res['Клики'] > 0, res['Расходы на РК'] / res['Клики'], 0)
    res['% CTR'] = np.where(res['Показы'] > 0, (res['Клики'] / res['Показы']) * 100, 0)
    res['% CR клик - корзина'] = np.where(res['Клики'] > 0, (res['Корзины (всего)'] / res['Клики']) * 100, 0)
    res['% CR корзина - заказ'] = np.where(res['Корзины (всего)'] > 0, (res['Заказов шт. (по РК)'] / res['Корзины (всего)']) * 100, 0)
    res['% CR клик - заказ'] = np.where(res['Клики'] > 0, (res['Заказов шт. (по РК)'] / res['Клики']) * 100, 0)
    res['Стоимость заказа (по РК)'] = np.where(res['Заказов шт. (по РК)'] > 0, res['Расходы на РК'] / res['Заказов шт. (по РК)'], 0)
    res['% ДРР / по РК'] = np.where(res['Сумма заказов (по РК)'] > 0, (res['Расходы на РК'] / res['Сумма заказов (по РК)']) * 100, 0)
    res['Стоимость заказа (всего)'] = np.where(res['Заказов шт. (всего)'] > 0, res['Расходы на РК'] / res['Заказов шт. (всего)'], 0)
    res['% ДРР / общий'] = np.where(res['Сумма заказов (всего)'] > 0, (res['Расходы на РК'] / res['Сумма заказов (всего)']) * 100, 0)
    res['ДРР продажи'] = np.where(res['Сумма выкупов'] > 0, (res['Расходы на РК'] / res['Сумма выкупов']) * 100, 0)
    res['Доля органики (%)'] = np.where(res['Заказов шт. (всего)'] > 0, 
                                        ((res['Заказов шт. (всего)'] - res['Заказов шт. (по РК)']) / res['Заказов шт. (всего)']) * 100, 0)
    res['Halo-эффект'] = np.where(res['Заказов шт. (по РК)'] > 0, res['Заказов шт. (всего)'] / res['Заказов шт. (по РК)'], 0)
    res['Средний чек (AOV)'] = np.where(res['Заказов шт. (всего)'] > 0, res['Сумма заказов (всего)'] / res['Заказов шт. (всего)'], 0)
    res['Доля отмен и возвратов (%)'] = np.where(res['Заказов шт. (всего)'] > 0, 
                                                 ((res.get('Отмены шт.', 0) + res.get('Возвраты шт.', 0)) / res['Заказов шт. (всего)']) * 100, 0)
    res['Истинный ROAS (выручка на 1₽)'] = np.where(res['Расходы на РК'] > 0, res['Сумма выкупов'] / res['Расходы на РК'], 0)

    cols_to_round = [
        'Расходы на РК', 'Сумма заказов (по РК)', 'Ставка за 1000 (CPM)', 'Цена за клик (CPC)', 
        'Стоимость заказа (по РК)', 'Сумма заказов (всего)', 'Стоимость заказа (всего)', 'Сумма выкупов', 
        'Цена до СПП', 'Цена после СПП', '% CTR', '% CR клик - корзина', '% CR корзина - заказ', 
        '% CR клик - заказ', '% ДРР / по РК', '% ДРР / общий', 'СПП %', 'ДРР продажи', 'Заказов шт. (всего)', 
        'Медианная позиция', 'Доля органики (%)', 'Halo-эффект', 'Средний чек (AOV)', 
        'Доля отмен и возвратов (%)', 'Истинный ROAS (выручка на 1₽)'
    ]
    exist_cols = [c for c in cols_to_round if c in res.columns]
    res[exist_cols] = res[exist_cols].round(2)
    return res

def get_numeric_col(dataframe, col_name):
    if col_name in dataframe.columns:
        return pd.to_numeric(dataframe[col_name], errors='coerce').fillna(0)
    return pd.Series(0, index=dataframe.index)

def find_auto_files():
    files = os.listdir('.')
    ads_path, sales_path = None, None
    for f in files:
        f_lower = f.lower()
        if 'реклам' in f_lower and (f_lower.endswith('.xlsx') or f_lower.endswith('.csv')):
            ads_path = f
        elif 'продаж' in f_lower and (f_lower.endswith('.xlsx') or f_lower.endswith('.csv')):
            sales_path = f
    return ads_path, sales_path

@st.cache_data
def process_data(ads_path, sales_path):
    df_ads = pd.read_csv(ads_path) if ads_path.endswith('.csv') else pd.read_excel(ads_path)
    df_sales = pd.read_csv(sales_path) if sales_path.endswith('.csv') else pd.read_excel(sales_path)

    df_ads.rename(columns={'event_date': 'Дата', 'nm': 'id_товара', 'supplier_id': 'id_продавца'}, inplace=True)
    if 'Дата' in df_ads.columns:
        df_ads['Дата'] = pd.to_datetime(df_ads['Дата'], errors='coerce').dt.strftime('%d.%m.%Y')
    df_ads['id_товара'] = df_ads['id_товара'].fillna(0).astype(str).str.replace(r'\.0$', '', regex=True)
    df_ads['id_продавца'] = df_ads['id_продавца'].fillna(0).astype(str).str.replace(r'\.0$', '', regex=True)

    df_ads['Заказов шт. (по РК)'] = get_numeric_col(df_ads, 'Кол-во заказов (прямая)') + get_numeric_col(df_ads, 'Кол-во заказов (атрибуция, ассоциированная)')
    df_ads['Сумма заказов (по РК)'] = get_numeric_col(df_ads, 'GMV заказов (прямая)') + get_numeric_col(df_ads, 'GMV заказов (атрибуция, ассоциированная)')
    df_ads['Корзины (всего)'] = get_numeric_col(df_ads, 'Кол-во заказов в корзине (прямая)') + get_numeric_col(df_ads, 'Кол-во заказов в корзине (атрибуция, ассоциированная)')
    df_ads['Расходы на РК'] = get_numeric_col(df_ads, 'Затраты на рекламу (общие)')
    df_ads['Показы'] = get_numeric_col(df_ads, 'Показы')
    df_ads['Клики'] = get_numeric_col(df_ads, 'Клики')
    df_ads['Медианная позиция'] = get_numeric_col(df_ads, 'Медианная позиция')

    df_sales.rename(columns={'период': 'Дата', 'nm_id': 'id_товара', 'supplier_id': 'id_продавца'}, inplace=True)
    if 'Дата' in df_sales.columns:
        df_sales['Дата'] = pd.to_datetime(df_sales['Дата'], errors='coerce').dt.strftime('%d.%m.%Y')
    df_sales['id_товара'] = df_sales['id_товара'].fillna(0).astype(str).str.replace(r'\.0$', '', regex=True)
    df_sales['id_продавца'] = df_sales['id_продавца'].fillna(0).astype(str).str.replace(r'\.0$', '', regex=True)

    sales_agg_dict = {
        'заказы, шт': 'sum', 'заказы, руб': 'sum', 'продажи по оплатам, руб': 'sum', 
        'заказы, цена до спп': 'mean', 'заказы, цена после спп (aiv)': 'mean', 'заказы, процент спп': 'mean',
        'отмены, шт': 'sum', 'возвраты, шт': 'sum' 
    }
    sales_group_cols = ['Дата', 'id_товара', 'id_продавца']
    available_sales_agg = {k: v for k, v in sales_agg_dict.items() if k in df_sales.columns}
    df_sales_grouped = df_sales.groupby(sales_group_cols, as_index=False).agg(available_sales_agg)

    df_sales_grouped.rename(columns={
        'заказы, шт': 'Заказов шт. (всего - справочно)',
        'заказы, руб': 'Сумма заказов (всего - справочно)',
        'продажи по оплатам, руб': 'Сумма выкупов (всего - справочно)',
        'заказы, цена до спп': 'Цена до СПП',
        'заказы, цена после спп (aiv)': 'Цена после СПП',
        'заказы, процент спп': 'СПП %',
        'отмены, шт': 'Отмены (шт - справочно)',
        'возвраты, шт': 'Возвраты (шт - справочно)'
    }, inplace=True)

    df_merged = pd.merge(df_ads, df_sales_grouped, on=['Дата', 'id_товара', 'id_продавца'], how='left')

    for col in ['Заказов шт. (всего - справочно)', 'Сумма заказов (всего - справочно)', 'Сумма выкупов (всего - справочно)', 'Отмены (шт - справочно)', 'Возвраты (шт - справочно)']:
        if col in df_merged.columns:
            df_merged[col] = df_merged[col].fillna(0)

    df_merged['Общие расходы товара за день'] = df_merged.groupby(['Дата', 'id_товара', 'id_продавца'])['Расходы на РК'].transform('sum')
    count_campaigns = df_merged.groupby(['Дата', 'id_товара', 'id_продавца'])['Расходы на РК'].transform('count')
    df_merged['Вес РК'] = np.where(df_merged['Общие расходы товара за день'] > 0, 
                                   df_merged['Расходы на РК'] / df_merged['Общие расходы товара за день'], 
                                   1.0 / count_campaigns)

    df_merged['Заказов шт. (всего)'] = df_merged['Заказов шт. (всего - справочно)'] * df_merged['Вес РК']
    df_merged['Сумма заказов (всего)'] = df_merged['Сумма заказов (всего - справочно)'] * df_merged['Вес РК']
    df_merged['Сумма выкупов'] = df_merged['Сумма выкупов (всего - справочно)'] * df_merged['Вес РК']
    df_merged['Отмены шт.'] = df_merged.get('Отмены (шт - справочно)', 0) * df_merged['Вес РК']
    df_merged['Возвраты шт.'] = df_merged.get('Возвраты (шт - справочно)', 0) * df_merged['Вес РК']

    agg_final = {
        'Расходы на РК': 'sum', 'Показы': 'sum', 'Клики': 'sum', 'Корзины (всего)': 'sum',
        'Заказов шт. (по РК)': 'sum', 'Сумма заказов (по РК)': 'sum',
        'Заказов шт. (всего)': 'sum', 'Сумма заказов (всего)': 'sum', 'Сумма выкупов': 'sum',
        'Медианная позиция': 'mean', 'Цена до СПП': 'mean', 'Цена после СПП': 'mean', 'СПП %': 'mean'
    }
    available_agg = {k: v for k, v in agg_final.items() if k in df_merged.columns}
    group_cols_1 = [c for c in ['Дата', 'id_продавца', 'Тип РК', 'Флаг CPC', 'name'] if c in df_merged.columns]
    
    table_1 = df_merged.groupby(group_cols_1, as_index=False).agg(available_agg)
    return table_1

# ==========================================
# 3. ИНИЦИАЛИЗАЦИЯ И АВТОЗАГРУЗКА
# ==========================================
st.title("📊 E-commerce Analytics Dashboard")

ads_file_path, sales_file_path = find_auto_files()

if not ads_file_path or not sales_file_path:
    st.error("❌ Не удалось автоматически найти файлы данных в корне проекта.")
    st.info("Пожалуйста, убедитесь, что в папке проекта присутствуют файлы со словом 'реклама' и 'продажи' (в формате .xlsx или .csv).")
else:
    st.caption(f"📁 **Загружены файлы:** `{ads_file_path}` и `{sales_file_path}`")
    
    table_1 = process_data(ads_file_path, sales_file_path)
    table_1['Дата_dt'] = pd.to_datetime(table_1['Дата'], format='%d.%m.%Y', errors='coerce')

    # ==========================================
    # 4. БОКОВАЯ ПАНЕЛЬ: ТОЛЬКО ГЛОБАЛЬНЫЕ ФИЛЬТРЫ
    # ==========================================
    st.sidebar.header("Фильтры")

    # 1. Глобальный фильтр: Тип РК
    all_rk_types = sorted(table_1['Тип РК'].dropna().unique().tolist()) if 'Тип РК' in table_1.columns else []
    selected_rk_types = st.sidebar.multiselect("Тип РК:", all_rk_types, default=all_rk_types)

    # 2. Глобальный фильтр: Период с - по (Календарь)
    min_date = table_1['Дата_dt'].min().date() if not table_1['Дата_dt'].isna().all() else pd.to_datetime('today').date()
    max_date = table_1['Дата_dt'].max().date() if not table_1['Дата_dt'].isna().all() else pd.to_datetime('today').date()

    date_range = st.sidebar.date_input(
        "Период с - по:",
        value=(min_date, max_date),
        min_value=min_date,
        max_value=max_date,
        format="DD.MM.YYYY"
    )

    # Подготовка общих списков метрик и продавцов для локальных блоков
    cols_to_sum = [
        'Расходы на РК', 'Показы', 'Клики', 'Корзины (всего)',
        'Заказов шт. (по РК)', 'Сумма заказов (по РК)',
        'Заказов шт. (всего)', 'Сумма заказов (всего)', 'Сумма выкупов'
    ]
    available_cols_to_sum = [c for c in cols_to_sum if c in table_1.columns]
    
    tmp_daily = calculate_metrics(table_1.groupby('Дата', as_index=False)[available_cols_to_sum].sum())
    numeric_metrics = tmp_daily.select_dtypes(include=['number']).columns.tolist()
    plot_metrics = [m for m in numeric_metrics if m not in ['Медианная позиция']]

    all_sellers = sorted(table_1['name'].dropna().unique().tolist()) if 'name' in table_1.columns else []
    default_sellers = all_sellers[:3] if len(all_sellers) >= 3 else all_sellers

    # ==========================================
    # 5. ФИЛЬТРАЦИЯ БАЗЫ ДАННЫХ BY GLOBAL FILTERS
    # ==========================================
    df_filtered_base = table_1.copy()

    if selected_rk_types:
        df_filtered_base = df_filtered_base[df_filtered_base['Тип РК'].isin(selected_rk_types)]
    else:
        df_filtered_base = df_filtered_base.iloc[0:0]

    if isinstance(date_range, tuple) and len(date_range) == 2:
        start_date, end_date = date_range
        df_filtered_base = df_filtered_base[
            (df_filtered_base['Дата_dt'].dt.date >= start_date) & 
            (df_filtered_base['Дата_dt'].dt.date <= end_date)
        ]

    # ==========================================
    # 6. СРАВНИТЕЛЬНЫЙ ГРАФИК #1 (С ЛОКАЛЬНЫМИ ФИЛЬТРАМИ СЛЕВА)
    # ==========================================
    st.subheader("📈 Сравнительный анализ продавцов (#1)")

    if df_filtered_base.empty:
        st.info("ℹ️ Нет данных по выбранному диапазону дат или типам РК.")
    else:
        # Локальные фильтры слева от графика #1
        col_filters_1, col_chart_1 = st.columns([1, 3])

        with col_filters_1:
            st.markdown("##### Фильтры графика #1")
            selected_metric_1 = st.selectbox(
                "Выберите целевую метрику:", 
                plot_metrics, 
                index=0, 
                key="metric_g1"
            )
            selected_sellers_1 = st.multiselect(
                "Выберите продавцов для сравнения:", 
                all_sellers, 
                default=default_sellers, 
                key="sellers_g1"
            )

        with col_chart_1:
            if not selected_sellers_1:
                st.warning("⚠️ Пожалуйста, выберите хотя бы одного продавца в блоке фильтров слева.")
            else:
                fig_main_1 = go.Figure()
                has_data_1 = False

                for seller in selected_sellers_1:
                    df_seller_1 = df_filtered_base[df_filtered_base['name'] == seller]
                    if df_seller_1.empty:
                        continue
                    
                    has_data_1 = True
                    df_daily_1 = df_seller_1.groupby('Дата', as_index=False)[available_cols_to_sum].sum()
                    df_daily_1['Дата_dt'] = pd.to_datetime(df_daily_1['Дата'], format='%d.%m.%Y')
                    df_daily_1 = df_daily_1.sort_values('Дата_dt')
                    df_daily_1 = calculate_metrics(df_daily_1)
                    
                    fig_main_1.add_trace(go.Scatter(
                        x=df_daily_1['Дата_dt'],
                        y=df_daily_1[selected_metric_1],
                        mode='lines+markers+text',
                        text=df_daily_1[selected_metric_1],
                        textposition="top center",
                        textfont=dict(size=14),
                        name=seller,
                        line=dict(width=2.5),
                        marker=dict(size=6),
                        hovertemplate=f"<b>{seller}</b><br>Дата: %{{x|%d.%m.%Y}}<br>{selected_metric_1}: %{{y}}<extra></extra>"
                    ))
                    
                if has_data_1:
                    fig_main_1.update_layout(
                        title=f"Динамика: <b>{selected_metric_1}</b>",
                        xaxis_title="Дата",
                        yaxis_title=selected_metric_1,
                        font=dict(size=14),
                        template="plotly_white",
                        hovermode="x unified",
                        height=550,
                        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="left", x=0)
                    )
                    fig_main_1.update_xaxes(tickformat="%d.%m") 
                    st.plotly_chart(fig_main_1, use_container_width=True)
                else:
                    st.error("Нет данных для выбранных продавцов в первом графике.")

    st.divider()

    # ==========================================
    # 7. БЛОК «ВЛИЯНИЕ ИГРОКА» (#1)
    # ==========================================
    st.subheader("🎯 Влияние игрока (#1)")
    st.markdown("Анализ влияния действий конкретного продавца на рынок (демпинг цен, перенос органики, изменение ДРР).")

    if df_filtered_base.empty:
        st.info("ℹ️ Нет данных для анализа влияния игрока по выбранному периоду/типам РК.")
    else:
        col_p1, col_p2, col_p3 = st.columns(3)
        
        with col_p1:
            selected_player = st.selectbox(
                "Продавец (одиночный выбор):", 
                all_sellers, 
                index=0 if all_sellers else None,
                key="player_select_1"
            )
        
        with col_p2:
            default_idx_1 = plot_metrics.index("Цена после СПП") if "Цена после СПП" in plot_metrics else 0
            metric_1 = st.selectbox("Метрика 1 (левая ось Y):", plot_metrics, index=default_idx_1, key="m1_select_1")
            
        with col_p3:
            default_idx_2 = plot_metrics.index("Заказов шт. (всего)") if "Заказов шт. (всего)" in plot_metrics else min(1, len(plot_metrics)-1)
            metric_2 = st.selectbox("Метрика 2 (правая ось Y):", plot_metrics, index=default_idx_2, key="m2_select_1")

        if selected_player:
            df_player = df_filtered_base[df_filtered_base['name'] == selected_player]
            
            if df_player.empty:
                st.warning(f"Нет данных по продавцу '{selected_player}' в выбранном диапазоне дат.")
            else:
                df_player_daily = df_player.groupby('Дата', as_index=False)[available_cols_to_sum].sum()
                df_player_daily['Дата_dt'] = pd.to_datetime(df_player_daily['Дата'], format='%d.%m.%Y')
                df_player_daily = df_player_daily.sort_values('Дата_dt')
                df_player_daily = calculate_metrics(df_player_daily)

                fig_player = make_subplots(specs=[[{"secondary_y": True}]])

                # Метрика 1 
                fig_player.add_trace(
                    go.Scatter(
                        x=df_player_daily['Дата_dt'],
                        y=df_player_daily[metric_1],
                        mode='lines+markers+text',
                        text=df_player_daily[metric_1],
                        textposition="top center",
                        textfont=dict(size=14),
                        name=f"{metric_1} (Метрика 1)",
                        line=dict(width=3, color='#1f77b4'),
                        marker=dict(size=7),
                        hovertemplate=f"<b>{metric_1}:</b> %{{y}}<extra></extra>"
                    ),
                    secondary_y=False
                )

                # Метрика 2
                fig_player.add_trace(
                    go.Scatter(
                        x=df_player_daily['Дата_dt'],
                        y=df_player_daily[metric_2],
                        mode='lines+markers+text',
                        text=df_player_daily[metric_2],
                        textposition="bottom center",
                        textfont=dict(size=14),
                        name=f"{metric_2} (Метрика 2)",
                        line=dict(width=3, color='#ff7f0e', dash='dash'),
                        marker=dict(size=7),
                        hovertemplate=f"<b>{metric_2}:</b> %{{y}}<extra></extra>"
                    ),
                    secondary_y=True
                )

                fig_player.update_layout(
                    title=f"Анализ игрока <b>{selected_player}</b>: {metric_1} vs {metric_2}",
                    xaxis_title="Дата",
                    font=dict(size=14),
                    template="plotly_white",
                    hovermode="x unified",
                    height=550,
                    legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="left", x=0)
                )

                fig_player.update_xaxes(tickformat="%d.%m")
                fig_player.update_yaxes(title_text=f"<b>{metric_1}</b>", secondary_y=False, title_font=dict(color='#1f77b4'))
                fig_player.update_yaxes(title_text=f"<b>{metric_2}</b>", secondary_y=True, title_font=dict(color='#ff7f0e'))

                st.plotly_chart(fig_player, use_container_width=True)

    st.divider()

    # ==========================================
    # 8. СРАВНИТЕЛЬНЫЙ ГРАФИК #2 (С ЛОКАЛЬНЫМИ ФИЛЬТРАМИ СЛЕВА)
    # ==========================================
    st.subheader("📈 Сравнительный анализ продавцов (#2)")

    if df_filtered_base.empty:
        st.info("ℹ️ Нет данных по выбранному диапазону дат или типам РК.")
    else:
        col_filters_2, col_chart_2 = st.columns([1, 3])

        with col_filters_2:
            st.markdown("##### Фильтры графика #2")
            selected_metric_2 = st.selectbox(
                "Выберите целевую метрику:", 
                plot_metrics, 
                index=min(1, len(plot_metrics)-1), 
                key="metric_g2"
            )
            selected_sellers_2 = st.multiselect(
                "Выберите продавцов для сравнения:", 
                all_sellers, 
                default=default_sellers, 
                key="sellers_g2"
            )

        with col_chart_2:
            if not selected_sellers_2:
                st.warning("⚠️ Пожалуйста, выберите хотя бы одного продавца во втором блоке фильтров слева.")
            else:
                fig_main_2 = go.Figure()
                has_data_2 = False

                for seller in selected_sellers_2:
                    df_seller_2 = df_filtered_base[df_filtered_base['name'] == seller]
                    if df_seller_2.empty:
                        continue
                    
                    has_data_2 = True
                    df_daily_2 = df_seller_2.groupby('Дата', as_index=False)[available_cols_to_sum].sum()
                    df_daily_2['Дата_dt'] = pd.to_datetime(df_daily_2['Дата'], format='%d.%m.%Y')
                    df_daily_2 = df_daily_2.sort_values('Дата_dt')
                    df_daily_2 = calculate_metrics(df_daily_2)
                    
                    fig_main_2.add_trace(go.Scatter(
                        x=df_daily_2['Дата_dt'],
                        y=df_daily_2[selected_metric_2],
                        mode='lines+markers+text',
                        text=df_daily_2[selected_metric_2],
                        textposition="top center",
                        textfont=dict(size=14),
                        name=seller,
                        line=dict(width=2.5),
                        marker=dict(size=6),
                        hovertemplate=f"<b>{seller}</b><br>Дата: %{{x|%d.%m.%Y}}<br>{selected_metric_2}: %{{y}}<extra></extra>"
                    ))
                    
                if has_data_2:
                    fig_main_2.update_layout(
                        title=f"Динамика: <b>{selected_metric_2}</b>",
                        xaxis_title="Дата",
                        yaxis_title=selected_metric_2,
                        font=dict(size=14),
                        template="plotly_white",
                        hovermode="x unified",
                        height=550,
                        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="left", x=0)
                    )
                    fig_main_2.update_xaxes(tickformat="%d.%m") 
                    st.plotly_chart(fig_main_2, use_container_width=True)
                else:
                    st.error("Нет данных для выбранных продавцов во втором графике.")

    st.divider()

    # ==========================================
    # 9. БЛОК «ВЛИЯНИЕ ИГРОКА» (#2)
    # ==========================================
    st.subheader("🎯 Влияние игрока (#2)")
    st.markdown("Дополнительный анализ влияния действий конкретного продавца на рынок.")

    if df_filtered_base.empty:
        st.info("ℹ️ Нет данных для анализа влияния игрока по выбранному периоду/типам РК.")
    else:
        col_p1_2, col_p2_2, col_p3_2 = st.columns(3)
        
        with col_p1_2:
            selected_player_2 = st.selectbox(
                "Продавец (одиночный выбор):", 
                all_sellers, 
                index=0 if all_sellers else None,
                key="player_select_2"
            )
        
        with col_p2_2:
            default_idx_1_2 = plot_metrics.index("Цена после СПП") if "Цена после СПП" in plot_metrics else 0
            metric_1_2 = st.selectbox("Метрика 1 (левая ось Y):", plot_metrics, index=default_idx_1_2, key="m1_select_2")
            
        with col_p3_2:
            default_idx_2_2 = plot_metrics.index("Заказов шт. (всего)") if "Заказов шт. (всего)" in plot_metrics else min(1, len(plot_metrics)-1)
            metric_2_2 = st.selectbox("Метрика 2 (правая ось Y):", plot_metrics, index=default_idx_2_2, key="m2_select_2")

        if selected_player_2:
            df_player_2 = df_filtered_base[df_filtered_base['name'] == selected_player_2]
            
            if df_player_2.empty:
                st.warning(f"Нет данных по продавцу '{selected_player_2}' в выбранном диапазоне дат.")
            else:
                df_player_daily_2 = df_player_2.groupby('Дата', as_index=False)[available_cols_to_sum].sum()
                df_player_daily_2['Дата_dt'] = pd.to_datetime(df_player_daily_2['Дата'], format='%d.%m.%Y')
                df_player_daily_2 = df_player_daily_2.sort_values('Дата_dt')
                df_player_daily_2 = calculate_metrics(df_player_daily_2)

                fig_player_2 = make_subplots(specs=[[{"secondary_y": True}]])

                # Метрика 1 
                fig_player_2.add_trace(
                    go.Scatter(
                        x=df_player_daily_2['Дата_dt'],
                        y=df_player_daily_2[metric_1_2],
                        mode='lines+markers+text',
                        text=df_player_daily_2[metric_1_2],
                        textposition="top center",
                        textfont=dict(size=14),
                        name=f"{metric_1_2} (Метрика 1)",
                        line=dict(width=3, color='#1f77b4'),
                        marker=dict(size=7),
                        hovertemplate=f"<b>{metric_1_2}:</b> %{{y}}<extra></extra>"
                    ),
                    secondary_y=False
                )

                # Метрика 2
                fig_player_2.add_trace(
                    go.Scatter(
                        x=df_player_daily_2['Дата_dt'],
                        y=df_player_daily_2[metric_2_2],
                        mode='lines+markers+text',
                        text=df_player_daily_2[metric_2_2],
                        textposition="bottom center",
                        textfont=dict(size=14),
                        name=f"{metric_2_2} (Метрика 2)",
                        line=dict(width=3, color='#ff7f0e', dash='dash'),
                        marker=dict(size=7),
                        hovertemplate=f"<b>{metric_2_2}:</b> %{{y}}<extra></extra>"
                    ),
                    secondary_y=True
                )

                fig_player_2.update_layout(
                    title=f"Анализ игрока <b>{selected_player_2}</b>: {metric_1_2} vs {metric_2_2}",
                    xaxis_title="Дата",
                    font=dict(size=14),
                    template="plotly_white",
                    hovermode="x unified",
                    height=550,
                    legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="left", x=0)
                )

                fig_player_2.update_xaxes(tickformat="%d.%m")
                fig_player_2.update_yaxes(title_text=f"<b>{metric_1_2}</b>", secondary_y=False, title_font=dict(color='#1f77b4'))
                fig_player_2.update_yaxes(title_text=f"<b>{metric_2_2}</b>", secondary_y=True, title_font=dict(color='#ff7f0e'))

                st.plotly_chart(fig_player_2, use_container_width=True)