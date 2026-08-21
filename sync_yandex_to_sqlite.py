import os
import io
import sqlite3
import requests
import pandas as pd
import numpy as np
from dotenv import load_dotenv

sqlite3.register_adapter(np.int64, int)
sqlite3.register_adapter(np.int32, int)
sqlite3.register_adapter(np.float64, float)
sqlite3.register_adapter(np.float32, float)

load_dotenv()
YANDEX_DISK_TOKEN = os.environ.get("YANDEX_DISK_TOKEN")
DB_PATH = "dashboard.db"

if not YANDEX_DISK_TOKEN:
    print("Ошибка: Переменная YANDEX_DISK_TOKEN не задана в .env")
    exit(1)

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Таблица для отслеживания загруженных файлов
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS processed_files (
            filename TEXT PRIMARY KEY,
            processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Таблица рекламы
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_date DATE,
            item_id TEXT,
            supplier_id TEXT,
            rk_type TEXT,
            cpc_flag TEXT,
            seller_name TEXT,
            orders_count_direct INTEGER DEFAULT 0,
            orders_count_assoc INTEGER DEFAULT 0,
            gmv_direct REAL DEFAULT 0,
            gmv_assoc REAL DEFAULT 0,
            carts_direct INTEGER DEFAULT 0,
            carts_assoc INTEGER DEFAULT 0,
            expenses REAL DEFAULT 0,
            impressions INTEGER DEFAULT 0,
            clicks INTEGER DEFAULT 0,
            median_position REAL DEFAULT 0
        )
    ''')

    # Таблица продаж
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_date DATE,
            item_id TEXT,
            supplier_id TEXT,
            orders_count INTEGER DEFAULT 0,
            orders_sum REAL DEFAULT 0,
            buyouts_sum REAL DEFAULT 0,
            price_before_spp REAL DEFAULT 0,
            price_after_spp REAL DEFAULT 0,
            spp_percent REAL DEFAULT 0,
            cancels_count INTEGER DEFAULT 0,
            returns_count INTEGER DEFAULT 0
        )
    ''')
    
    conn.commit()
    return conn

def get_yandex_disk_files(folder_path, token):
    headers = {'Authorization': f'OAuth {token}'}
    url = 'https://cloud-api.yandex.net/v1/disk/resources'
    params = {'path': folder_path, 'limit': 1000}
    resp = requests.get(url, headers=headers, params=params)
    if resp.status_code != 200:
        return []
    items = resp.json().get('_embedded', {}).get('items', [])
    return [i for i in items if i.get('type') == 'file' and os.path.splitext(i.get('name', ''))[1].lower() in ['.xlsx', '.xls', '.csv']]

def download_file(file_info, token):
    download_url = file_info.get('file')
    if not download_url:
        resp = requests.get('https://cloud-api.yandex.net/v1/disk/resources/download', 
                            headers={'Authorization': f'OAuth {token}'}, params={'path': file_info.get('path')})
        if resp.status_code == 200:
            download_url = resp.json().get('href')
    resp = requests.get(download_url)
    return resp.content

def load_df(content, filename):
    ext = os.path.splitext(filename)[1].lower()
    if ext == '.csv':
        df = pd.read_csv(io.BytesIO(content))
    else:
        df = pd.read_excel(io.BytesIO(content))
    df.columns = df.columns.astype(str).str.strip().str.lower()
    return df

def get_num(df, col):
    return pd.to_numeric(df[col], errors='coerce').fillna(0) if col in df.columns else pd.Series(0, index=df.index)

def rebuild_merged_data(conn):
    print("Пересчитываем merged_data с использованием логики Pandas...")
    df_ads = pd.read_sql("SELECT * FROM ads", conn)
    df_sales = pd.read_sql("SELECT * FROM sales", conn)

    if df_ads.empty or df_sales.empty:
        print("Недостаточно данных для объединения.")
        return

    # Подготовка Ads
    df_ads.rename(columns={'event_date': 'Дата', 'item_id': 'id_товара', 'supplier_id': 'id_продавца', 'rk_type': 'Тип РК', 'cpc_flag': 'Флаг CPC', 'seller_name': 'name'}, inplace=True)
    df_ads['Заказов шт. (по РК)'] = df_ads['orders_count_direct'] + df_ads['orders_count_assoc']
    df_ads['Сумма заказов (по РК)'] = df_ads['gmv_direct'] + df_ads['gmv_assoc']
    df_ads['Корзины (всего)'] = df_ads['carts_direct'] + df_ads['carts_assoc']
    df_ads['Расходы на РК'] = df_ads['expenses']
    df_ads['Показы'] = df_ads['impressions']
    df_ads['Клики'] = df_ads['clicks']
    df_ads['Медианная позиция'] = df_ads['median_position']

    # Подготовка Sales
    df_sales.rename(columns={'event_date': 'Дата', 'item_id': 'id_товара', 'supplier_id': 'id_продавца'}, inplace=True)
    sales_agg_dict = {
        'orders_count': 'sum', 'orders_sum': 'sum', 'buyouts_sum': 'sum', 
        'price_before_spp': 'mean', 'price_after_spp': 'mean', 'spp_percent': 'mean',
        'cancels_count': 'sum', 'returns_count': 'sum' 
    }
    df_sales_grouped = df_sales.groupby(['Дата', 'id_товара', 'id_продавца'], as_index=False).agg(sales_agg_dict)
    
    df_sales_grouped.rename(columns={
        'orders_count': 'Заказов шт. (всего - справочно)',
        'orders_sum': 'Сумма заказов (всего - справочно)',
        'buyouts_sum': 'Сумма выкупов (всего - справочно)',
        'price_before_spp': 'Цена до СПП',
        'price_after_spp': 'Цена после СПП',
        'spp_percent': 'СПП %',
        'cancels_count': 'Отмены (шт - справочно)',
        'returns_count': 'Возвраты (шт - справочно)'
    }, inplace=True)

    # Объединение (используем outer, чтобы не потерять органические продажи без рекламы)
    df_merged = pd.merge(df_ads, df_sales_grouped, on=['Дата', 'id_товара', 'id_продавца'], how='outer')

    # Восстанавливаем имена продавцов для чисто органических продаж
    mapping_name = df_ads.dropna(subset=['name']).drop_duplicates(subset=['id_продавца']).set_index('id_продавца')['name'].to_dict()
    df_merged['name'] = df_merged['name'].fillna(df_merged['id_продавца'].map(mapping_name))
    df_merged['name'] = df_merged['name'].fillna('Продавец ' + df_merged['id_продавца']) # Если продавец вообще никогда не запускал рекламу
    
    # Заполняем пустые типы РК как Органика
    df_merged['Тип РК'] = df_merged['Тип РК'].fillna('Органика (без рекламы)')
    df_merged['Флаг CPC'] = df_merged['Флаг CPC'].fillna('-')

    # Заполнение NaN нулями для справочных полей и приведение к числу
    ref_cols = ['Заказов шт. (всего - справочно)', 'Сумма заказов (всего - справочно)', 'Сумма выкупов (всего - справочно)', 'Отмены (шт - справочно)', 'Возвраты (шт - справочно)']
    for col in ref_cols:
        if col in df_merged.columns:
            df_merged[col] = pd.to_numeric(df_merged[col], errors='coerce').fillna(0)
            
    # Также заполняем нулями метрики рекламы для органических строк
    ad_cols = ['Заказов шт. (по РК)', 'Сумма заказов (по РК)', 'Корзины (всего)', 'Расходы на РК', 'Показы', 'Клики', 'Медианная позиция']
    for col in ad_cols:
        if col in df_merged.columns:
            df_merged[col] = pd.to_numeric(df_merged[col], errors='coerce').fillna(0)

    # Расчет "Веса РК"
    df_merged['Общие расходы товара за день'] = df_merged.groupby(['Дата', 'id_товара', 'id_продавца'])['Расходы на РК'].transform('sum')
    count_campaigns = df_merged.groupby(['Дата', 'id_товара', 'id_продавца'])['Расходы на РК'].transform('count')
    df_merged['Вес РК'] = np.where(df_merged['Общие расходы товара за день'] > 0, 
                                   df_merged['Расходы на РК'] / df_merged['Общие расходы товара за день'], 
                                   1.0 / count_campaigns)

    # Распределение органики
    df_merged['Заказов шт. (всего)'] = df_merged['Заказов шт. (всего - справочно)'] * df_merged['Вес РК']
    df_merged['Сумма заказов (всего)'] = df_merged['Сумма заказов (всего - справочно)'] * df_merged['Вес РК']
    df_merged['Сумма выкупов'] = df_merged['Сумма выкупов (всего - справочно)'] * df_merged['Вес РК']
    df_merged['Отмены шт.'] = df_merged.get('Отмены (шт - справочно)', 0) * df_merged['Вес РК']
    df_merged['Возвраты шт.'] = df_merged.get('Возвраты (шт - справочно)', 0) * df_merged['Вес РК']

    # Агрегация финальной таблицы (как в table_1 в app.py)
    agg_final = {
        'Расходы на РК': 'sum', 'Показы': 'sum', 'Клики': 'sum', 'Корзины (всего)': 'sum',
        'Заказов шт. (по РК)': 'sum', 'Сумма заказов (по РК)': 'sum',
        'Заказов шт. (всего)': 'sum', 'Сумма заказов (всего)': 'sum', 'Сумма выкупов': 'sum',
        'Отмены шт.': 'sum', 'Возвраты шт.': 'sum',
        'Медианная позиция': 'mean', 'Цена до СПП': 'mean', 'Цена после СПП': 'mean', 'СПП %': 'mean'
    }
    
    group_cols = ['Дата', 'id_продавца', 'Тип РК', 'Флаг CPC', 'name']
    table_1 = df_merged.groupby(group_cols, as_index=False).agg(agg_final)
    
    # Принудительно приводим все метрики к float (чтобы избежать типа object и сохранения как BLOB в SQLite)
    for col in agg_final.keys():
        table_1[col] = pd.to_numeric(table_1[col], errors='coerce').fillna(0)
    
    # Сохраняем в SQLite, перезаписывая старую таблицу
    table_1.to_sql('merged_data', conn, if_exists='replace', index=False)
    print("Таблица merged_data успешно обновлена.")


def sync_data():
    conn = init_db()
    cursor = conn.cursor()
    
    print("Начинаем синхронизацию данных (только новые файлы)...")
    
    cursor.execute("SELECT filename FROM processed_files")
    processed_files = set(row[0] for row in cursor.fetchall())

    new_files_added = False

    # --- Обработка РЕКЛАМЫ ---
    ads_files = get_yandex_disk_files('disk:/реклама', YANDEX_DISK_TOKEN)
    new_ads = [f for f in ads_files if f['name'] not in processed_files]
    
    for f in new_ads:
        print(f"Загрузка нового файла рекламы: {f['name']}")
        df = load_df(download_file(f, YANDEX_DISK_TOKEN), f['name'])
        df['event_date'] = pd.to_datetime(df.get('event_date', df.get('дата')), errors='coerce').dt.strftime('%Y-%m-%d')
        
        records = []
        for _, row in df.iterrows():
            records.append((
                row['event_date'],
                str(row.get('nm', row.get('id_товара', ''))),
                str(row.get('supplier_id', row.get('id_продавца', ''))),
                str(row.get('тип рк', '')),
                str(row.get('флаг cpc', '')),
                str(row.get('name', '')),
                get_num(df, 'кол-во заказов (прямая)')[_],
                get_num(df, 'кол-во заказов (атрибуция, ассоциированная)')[_],
                get_num(df, 'gmv заказов (прямая)')[_],
                get_num(df, 'gmv заказов (атрибуция, ассоциированная)')[_],
                get_num(df, 'кол-во заказов в корзине (прямая)')[_],
                get_num(df, 'кол-во заказов в корзине (атрибуция, ассоциированная)')[_],
                get_num(df, 'затраты на рекламу (общие)')[_],
                get_num(df, 'показы')[_],
                get_num(df, 'клики')[_],
                get_num(df, 'медианная позиция')[_]
            ))
        
        cursor.executemany('''
            INSERT INTO ads (
                event_date, item_id, supplier_id, rk_type, cpc_flag, seller_name, 
                orders_count_direct, orders_count_assoc, gmv_direct, gmv_assoc,
                carts_direct, carts_assoc, expenses, impressions, clicks, median_position
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', records)
        
        cursor.execute("INSERT INTO processed_files (filename) VALUES (?)", (f['name'],))
        conn.commit()
        new_files_added = True

    # --- Обработка ПРОДАЖ ---
    sales_files = get_yandex_disk_files('disk:/продажи', YANDEX_DISK_TOKEN)
    new_sales = [f for f in sales_files if f['name'] not in processed_files]
    
    for f in new_sales:
        print(f"Загрузка нового файла продаж: {f['name']}")
        df = load_df(download_file(f, YANDEX_DISK_TOKEN), f['name'])
        df['event_date'] = pd.to_datetime(df.get('период', df.get('дата')), errors='coerce').dt.strftime('%Y-%m-%d')
        
        records = []
        for _, row in df.iterrows():
            records.append((
                row['event_date'],
                str(row.get('nm_id', row.get('id_товара', ''))),
                str(row.get('supplier_id', row.get('id_продавца', ''))),
                get_num(df, 'заказы, шт')[_],
                get_num(df, 'заказы, руб')[_],
                get_num(df, 'продажи по оплатам, руб')[_],
                get_num(df, 'заказы, цена до спп')[_],
                get_num(df, 'заказы, цена после спп (aiv)')[_],
                get_num(df, 'заказы, процент спп')[_],
                get_num(df, 'отмены, шт')[_],
                get_num(df, 'возвраты, шт')[_]
            ))
            
        cursor.executemany('''
            INSERT INTO sales (
                event_date, item_id, supplier_id, orders_count, orders_sum, buyouts_sum,
                price_before_spp, price_after_spp, spp_percent, cancels_count, returns_count
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', records)
        
        cursor.execute("INSERT INTO processed_files (filename) VALUES (?)", (f['name'],))
        conn.commit()
        new_files_added = True

    if not new_files_added:
        print("Новых файлов не найдено.")
    
    # Всегда пересчитываем или только при новых файлах (но для надежности можно всегда, либо если new_files_added=True)
    # Добавим проверку, есть ли вообще таблица merged_data, на случай первого запуска
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='merged_data'")
    has_merged_table = cursor.fetchone() is not None
    
    if new_files_added or not has_merged_table:
        rebuild_merged_data(conn)
    else:
        print("Таблица merged_data актуальна.")

    conn.close()

if __name__ == "__main__":
    sync_data()
