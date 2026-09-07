import os
import sys
import json
import argparse
import sqlite3
import hashlib
import pandas as pd
import numpy as np

# Адаптеры типов numpy для sqlite3
sqlite3.register_adapter(np.int64, int)
sqlite3.register_adapter(np.int32, int)
sqlite3.register_adapter(np.float64, float)
sqlite3.register_adapter(np.float32, float)

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))

def get_app_support_dir():
    app_data = os.environ.get("APPDATA") or os.environ.get("LOCALAPPDATA")
    if app_data:
        return os.path.join(app_data, "ECommerceDashboard")
    return os.path.join(os.path.expanduser("~"), "AppData", "Roaming", "ECommerceDashboard")

APP_SUPPORT_DIR = get_app_support_dir()

def resolve_default_db():
    if os.environ.get("DATABASE_PATH"):
        return os.environ.get("DATABASE_PATH")
    app_support_db = os.path.join(APP_SUPPORT_DIR, "dashboard.db")
    if os.path.exists(app_support_db):
        return app_support_db
    return os.path.join(PROJECT_ROOT, "dashboard.db")

def resolve_default_config():
    if os.environ.get("CONFIG_PATH"):
        return os.environ.get("CONFIG_PATH")
    app_support_cfg = os.path.join(APP_SUPPORT_DIR, "config.json")
    if os.path.exists(app_support_cfg):
        return app_support_cfg
    return os.path.join(PROJECT_ROOT, "config.json")

DEFAULT_DB_PATH = resolve_default_db()
DEFAULT_ADS_DIR = os.path.join(PROJECT_ROOT, "data", "ads")
DEFAULT_SALES_DIR = os.path.join(PROJECT_ROOT, "data", "sales")
CONFIG_PATH = resolve_default_config()

def load_config(custom_config_path=None):
    cfg = {
        "ads_dir": DEFAULT_ADS_DIR,
        "sales_dir": DEFAULT_SALES_DIR
    }
    cfg_file = custom_config_path or CONFIG_PATH
    if os.path.exists(cfg_file):
        try:
            with open(cfg_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                if data.get("ads_dir"):
                    cfg["ads_dir"] = os.path.expanduser(data["ads_dir"])
                if data.get("sales_dir"):
                    cfg["sales_dir"] = os.path.expanduser(data["sales_dir"])
        except Exception:
            pass
    return cfg

def compute_file_hash(filepath, chunk_size=65536):
    """Вычисляет быстрый SHA-256 хеш содержимого файла для детекции переименований и дубликатов."""
    h = hashlib.sha256()
    try:
        with open(filepath, 'rb') as f:
            while True:
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return ""

def init_db(db_path=DEFAULT_DB_PATH):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS processed_files (
            filename TEXT PRIMARY KEY,
            file_type TEXT,
            processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            row_count INTEGER DEFAULT 0,
            file_mtime REAL DEFAULT 0,
            file_size INTEGER DEFAULT 0,
            file_hash TEXT DEFAULT ''
        )
    ''')

    # Проверяем и дополняем колонки таблицы processed_files при необходимости
    cursor.execute("PRAGMA table_info(processed_files)")
    pf_cols = [row[1] for row in cursor.fetchall()]
    if 'file_type' not in pf_cols:
        try: cursor.execute("ALTER TABLE processed_files ADD COLUMN file_type TEXT")
        except Exception: pass
    if 'row_count' not in pf_cols:
        try: cursor.execute("ALTER TABLE processed_files ADD COLUMN row_count INTEGER DEFAULT 0")
        except Exception: pass
    if 'file_mtime' not in pf_cols:
        try: cursor.execute("ALTER TABLE processed_files ADD COLUMN file_mtime REAL DEFAULT 0")
        except Exception: pass
    if 'file_size' not in pf_cols:
        try: cursor.execute("ALTER TABLE processed_files ADD COLUMN file_size INTEGER DEFAULT 0")
        except Exception: pass
    if 'file_hash' not in pf_cols:
        try: cursor.execute("ALTER TABLE processed_files ADD COLUMN file_hash TEXT DEFAULT ''")
        except Exception: pass

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_file TEXT DEFAULT '',
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

    cursor.execute("PRAGMA table_info(ads)")
    ads_cols = [row[1] for row in cursor.fetchall()]
    if 'source_file' not in ads_cols:
        try: cursor.execute("ALTER TABLE ads ADD COLUMN source_file TEXT DEFAULT ''")
        except Exception: pass

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_file TEXT DEFAULT '',
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

    cursor.execute("PRAGMA table_info(sales)")
    sales_cols = [row[1] for row in cursor.fetchall()]
    if 'source_file' not in sales_cols:
        try: cursor.execute("ALTER TABLE sales ADD COLUMN source_file TEXT DEFAULT ''")
        except Exception: pass

    cursor.execute("PRAGMA journal_mode = WAL")
    cursor.execute("PRAGMA synchronous = NORMAL")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ads_lookup ON ads (event_date, supplier_id, item_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ads_source_file ON ads (source_file)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sales_lookup ON sales (event_date, supplier_id, item_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sales_source_file ON sales (source_file)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_processed_files_hash ON processed_files (file_hash)")

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS "merged_data" (
            "Дата" TEXT,
            "id_продавца" TEXT,
            "Тип РК" TEXT,
            "Флаг CPC" TEXT,
            "name" TEXT,
            "has_ads" INTEGER DEFAULT 0,
            "has_sales" INTEGER DEFAULT 0,
            "Расходы на РК" REAL,
            "Показы" REAL,
            "Клики" REAL,
            "Корзины (всего)" REAL,
            "Заказов шт. (по РК)" REAL,
            "Сумма заказов (по РК)" REAL,
            "Заказов шт. (всего)" REAL,
            "Сумма заказов (всего)" REAL,
            "Сумма выкупов" REAL,
            "Отмены шт." REAL,
            "Возвраты шт." REAL,
            "Медианная позиция" REAL,
            "Цена до СПП" REAL,
            "Цена после СПП" REAL,
            "СПП %" REAL
        )
    ''')
    cursor.execute("PRAGMA table_info(merged_data)")
    md_cols = [row[1] for row in cursor.fetchall()]
    if 'has_ads' not in md_cols:
        try: cursor.execute("ALTER TABLE merged_data ADD COLUMN has_ads INTEGER DEFAULT 0")
        except Exception: pass
    if 'has_sales' not in md_cols:
        try: cursor.execute("ALTER TABLE merged_data ADD COLUMN has_sales INTEGER DEFAULT 0")
        except Exception: pass

    cursor.execute('CREATE INDEX IF NOT EXISTS idx_merged_date ON merged_data ("Дата")')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_merged_name ON merged_data ("name")')

    conn.commit()
    return conn

def backfill_missing_hashes(conn, ads_dir, sales_dir):
    """Заполняет пустые file_hash для ранее обработанных файлов, если они есть на диске."""
    cursor = conn.cursor()
    cursor.execute("SELECT filename, file_type FROM processed_files WHERE file_hash IS NULL OR file_hash = ''")
    rows = cursor.fetchall()
    for fname, ftype in rows:
        target_dir = ads_dir if ftype == 'ads' else sales_dir
        fpath = os.path.join(target_dir, fname)
        if os.path.exists(fpath):
            fhash = compute_file_hash(fpath)
            if fhash:
                cursor.execute("UPDATE processed_files SET file_hash = ? WHERE filename = ?", (fhash, fname))
    conn.commit()

def load_file_df(filepath):
    ext = os.path.splitext(filepath)[1].lower()
    if ext == '.csv':
        df = pd.read_csv(filepath)
    else:
        df = pd.read_excel(filepath)
    df.columns = df.columns.astype(str).str.strip().str.lower()
    return df

def get_num(df, col):
    if col in df.columns:
        return pd.to_numeric(df[col], errors='coerce').fillna(0)
    return pd.Series(0, index=df.index)

def find_candidate_files(folder_path):
    if not os.path.exists(folder_path):
        return []
    valid_exts = {'.xlsx', '.xls', '.csv'}
    files = []
    for f in sorted(os.listdir(folder_path)):
        if f.startswith('.') or f.startswith('~$'):
            continue
        ext = os.path.splitext(f)[1].lower()
        if ext in valid_exts:
            files.append(f)
    return files

def validate_and_parse_date_column(df, category, filename):
    """
    Валидирует и преобразует колонку даты/периода.
    Для продаж поле обычно называется 'Период', для рекламы - 'event_date'/'Дата'.
    Если колонка отсутствует или содержит недопустимые значения (например, числа 6, 7, 8, 9,
    не-даты или даты вне диапазона 2000-2050), выбрасывает понятное пользователю исключение ValueError.
    """
    candidates = ['период', 'дата', 'date', 'event_date'] if category == 'sales' else ['event_date', 'дата', 'date', 'период']
    date_col = None
    for cand in candidates:
        if cand in df.columns:
            date_col = cand
            break

    primary_name = 'Период' if category == 'sales' else 'Дата'

    if not date_col:
        raise ValueError(
            f"В файле «{filename}» не найдено обязательное поле '{primary_name}'. "
            f"Пожалуйста, проверьте корректность данных."
        )

    series = df[date_col]
    non_null = series.dropna()
    if len(non_null) == 0:
        raise ValueError(
            f"Поле '{primary_name}' в файле «{filename}» не содержит данных. "
            f"Пожалуйста, проверьте корректность данных."
        )

    # Проверка на небольшие целые/дробные числа (например, 6, 7, 8, 9, 1..31, номера месяцев или недель)
    # Корректные даты Excel начинаются примерно с 35000 (1995 год). Значения < 35000 не являются датами.
    def is_invalid_numeric(val):
        try:
            num = float(val)
            if num < 35000:
                return True
        except (ValueError, TypeError):
            pass
        return False

    has_bad_numbers = non_null.apply(is_invalid_numeric)
    if has_bad_numbers.any():
        bad_samples = non_null[has_bad_numbers].head(5).tolist()
        raise ValueError(
            f"Поле '{primary_name}' имеет неверный формат для загрузки (файл «{filename}», обнаружены некорректные значения: {bad_samples}). "
            f"Пожалуйста, проверьте корректность данных."
        )

    # Парсинг в datetime
    if pd.api.types.is_numeric_dtype(non_null):
        parsed = pd.to_datetime(series, unit='D', origin='1899-12-30', errors='coerce')
    else:
        parsed = pd.to_datetime(series, format='mixed', errors='coerce')

    # Проверка на NaT или нереалистичные года (< 2000 или > 2050)
    invalid_mask = non_null.index[
        parsed.loc[non_null.index].isna() |
        (parsed.loc[non_null.index].dt.year < 2000) |
        (parsed.loc[non_null.index].dt.year > 2050)
    ]

    if len(invalid_mask) > 0:
        bad_samples = non_null.loc[invalid_mask].head(5).tolist()
        raise ValueError(
            f"Поле '{primary_name}' имеет неверный формат для загрузки (файл «{filename}», некорректные даты: {bad_samples}). "
            f"Пожалуйста, проверьте корректность данных."
        )

    return parsed.dt.strftime('%Y-%m-%d')

def process_ads_file(filepath, filename, conn, file_hash=None, mtime=None, size=None):
    df = load_file_df(filepath)
    if df.empty:
        return 0

    if mtime is None:
        mtime = os.path.getmtime(filepath) if os.path.exists(filepath) else 0.0
    if size is None:
        size = os.path.getsize(filepath) if os.path.exists(filepath) else 0
    if file_hash is None:
        file_hash = compute_file_hash(filepath)

    event_date_series = validate_and_parse_date_column(df, 'ads', filename)
    
    item_col = 'nm' if 'nm' in df.columns else ('id_товара' if 'id_товара' in df.columns else 'item_id')
    supp_col = 'supplier_id' if 'supplier_id' in df.columns else ('id_продавца' if 'id_продавца' in df.columns else None)

    raw_name = df['name'] if 'name' in df.columns else (df['seller_name'] if 'seller_name' in df.columns else pd.Series('', index=df.index))
    seller_name_cleaned = raw_name.astype(str).str.strip().str.lower().replace({'nan': '', 'none': '', 'null': ''})

    ads_processed = pd.DataFrame({
        'source_file': filename,
        'event_date': event_date_series,
        'item_id': df[item_col].astype(str) if item_col in df.columns else '',
        'supplier_id': df[supp_col].astype(str) if supp_col and supp_col in df.columns else '',
        'rk_type': df['тип рк'].astype(str) if 'тип рк' in df.columns else '',
        'cpc_flag': df['флаг cpc'].astype(str) if 'флаг cpc' in df.columns else '',
        'seller_name': seller_name_cleaned,
        'orders_count_direct': get_num(df, 'кол-во заказов (прямая)'),
        'orders_count_assoc': get_num(df, 'кол-во заказов (атрибуция, ассоциированная)'),
        'gmv_direct': get_num(df, 'gmv заказов (прямая)'),
        'gmv_assoc': get_num(df, 'gmv заказов (атрибуция, ассоциированная)'),
        'carts_direct': get_num(df, 'кол-во заказов в корзине (прямая)'),
        'carts_assoc': get_num(df, 'кол-во заказов в корзине (атрибуция, ассоциированная)'),
        'expenses': get_num(df, 'затраты на рекламу (общие)'),
        'impressions': get_num(df, 'показы'),
        'clicks': get_num(df, 'клики'),
        'median_position': get_num(df, 'медианная позиция')
    })

    cursor = conn.cursor()
    cursor.execute("DELETE FROM ads WHERE source_file = ?", (filename,))
    ads_processed.to_sql('ads', conn, if_exists='append', index=False)

    cursor.execute(
        """INSERT OR REPLACE INTO processed_files 
           (filename, file_type, processed_at, row_count, file_mtime, file_size, file_hash) 
           VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?)""",
        (filename, 'ads', len(ads_processed), mtime, size, file_hash)
    )
    conn.commit()
    return len(ads_processed)

def process_sales_file(filepath, filename, conn, file_hash=None, mtime=None, size=None):
    df = load_file_df(filepath)
    if df.empty:
        return 0

    if mtime is None:
        mtime = os.path.getmtime(filepath) if os.path.exists(filepath) else 0.0
    if size is None:
        size = os.path.getsize(filepath) if os.path.exists(filepath) else 0
    if file_hash is None:
        file_hash = compute_file_hash(filepath)

    event_date_series = validate_and_parse_date_column(df, 'sales', filename)

    item_col = 'nm_id' if 'nm_id' in df.columns else ('id_товара' if 'id_товара' in df.columns else 'item_id')
    supp_col = 'supplier_id' if 'supplier_id' in df.columns else ('id_продавца' if 'id_продавца' in df.columns else None)

    sales_processed = pd.DataFrame({
        'source_file': filename,
        'event_date': event_date_series,
        'item_id': df[item_col].astype(str) if item_col in df.columns else '',
        'supplier_id': df[supp_col].astype(str) if supp_col and supp_col in df.columns else '',
        'orders_count': get_num(df, 'заказы, шт'),
        'orders_sum': get_num(df, 'заказы, руб'),
        'buyouts_sum': get_num(df, 'продажи по оплатам, руб'),
        'price_before_spp': get_num(df, 'заказы, цена до спп'),
        'price_after_spp': get_num(df, 'заказы, цена после спп (aiv)'),
        'spp_percent': get_num(df, 'заказы, процент спп'),
        'cancels_count': get_num(df, 'отмены, шт'),
        'returns_count': get_num(df, 'возвраты, шт')
    })

    cursor = conn.cursor()
    cursor.execute("DELETE FROM sales WHERE source_file = ?", (filename,))
    sales_processed.to_sql('sales', conn, if_exists='append', index=False)

    cursor.execute(
        """INSERT OR REPLACE INTO processed_files 
           (filename, file_type, processed_at, row_count, file_mtime, file_size, file_hash) 
           VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?)""",
        (filename, 'sales', len(sales_processed), mtime, size, file_hash)
    )
    conn.commit()
    return len(sales_processed)

def rebuild_merged_data(conn):
    # Приводим существующие имена продавцов в ads к lowercase
    cursor = conn.cursor()
    cursor.execute("UPDATE ads SET seller_name = LOWER(TRIM(seller_name)) WHERE seller_name IS NOT NULL")
    conn.commit()

    df_ads = pd.read_sql("SELECT * FROM ads", conn)
    df_sales = pd.read_sql("SELECT * FROM sales", conn)

    # Защита от пустых/некорректных дат
    if not df_ads.empty and 'event_date' in df_ads.columns:
        df_ads = df_ads[df_ads['event_date'].notna() & (df_ads['event_date'] != '') & (df_ads['event_date'] != '1970-01-01')]
    if not df_sales.empty and 'event_date' in df_sales.columns:
        df_sales = df_sales[df_sales['event_date'].notna() & (df_sales['event_date'] != '') & (df_sales['event_date'] != '1970-01-01')]

    if df_ads.empty and df_sales.empty:
        cursor.execute("DELETE FROM merged_data")
        conn.commit()
        return 0

    # Нормализация seller_name в ads
    if not df_ads.empty and 'seller_name' in df_ads.columns:
        df_ads['seller_name'] = df_ads['seller_name'].astype(str).str.strip().str.lower()
        df_ads['seller_name'] = df_ads['seller_name'].replace({'nan': np.nan, 'none': np.nan, 'null': np.nan, '': np.nan})

    # Построение справочников имен брендов из рекламы
    mapping_item = {}
    mapping_supp = {}
    if not df_ads.empty and 'seller_name' in df_ads.columns:
        valid_ads = df_ads[df_ads['seller_name'].notna() & (df_ads['seller_name'] != '')]
        if not valid_ads.empty:
            mapping_item = valid_ads.drop_duplicates(subset=['item_id']).set_index('item_id')['seller_name'].to_dict()
            mapping_supp = valid_ads.drop_duplicates(subset=['supplier_id']).set_index('supplier_id')['seller_name'].to_dict()

    if not df_ads.empty:
        df_ads.rename(columns={
            'event_date': 'Дата',
            'item_id': 'id_товара',
            'supplier_id': 'id_продавца',
            'rk_type': 'Тип РК',
            'cpc_flag': 'Флаг CPC',
            'seller_name': 'name'
        }, inplace=True)
        df_ads['id_товара'] = df_ads['id_товара'].astype(str)
        df_ads['id_продавца'] = df_ads['id_продавца'].astype(str)
        df_ads['Заказов шт. (по РК)'] = pd.to_numeric(df_ads['orders_count_direct'], errors='coerce').fillna(0) + pd.to_numeric(df_ads['orders_count_assoc'], errors='coerce').fillna(0)
        df_ads['Сумма заказов (по РК)'] = pd.to_numeric(df_ads['gmv_direct'], errors='coerce').fillna(0) + pd.to_numeric(df_ads['gmv_assoc'], errors='coerce').fillna(0)
        df_ads['Корзины (всего)'] = pd.to_numeric(df_ads['carts_direct'], errors='coerce').fillna(0) + pd.to_numeric(df_ads['carts_assoc'], errors='coerce').fillna(0)
        df_ads['Расходы на РК'] = pd.to_numeric(df_ads['expenses'], errors='coerce').fillna(0)
        df_ads['Показы'] = pd.to_numeric(df_ads['impressions'], errors='coerce').fillna(0)
        df_ads['Клики'] = pd.to_numeric(df_ads['clicks'], errors='coerce').fillna(0)
        df_ads['Медианная позиция'] = pd.to_numeric(df_ads['median_position'], errors='coerce')
        df_ads['has_ads'] = 1

    if not df_sales.empty:
        df_sales.rename(columns={
            'event_date': 'Дата',
            'item_id': 'id_товара',
            'supplier_id': 'id_продавца'
        }, inplace=True)
        df_sales['id_товара'] = df_sales['id_товара'].astype(str)
        df_sales['id_продавца'] = df_sales['id_продавца'].astype(str)
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
        df_sales_grouped['has_sales'] = 1

    # Объединение
    if df_ads.empty:
        df_merged = df_sales_grouped.copy()
        df_merged['has_ads'] = 0
        df_merged['Тип РК'] = 'Органика (без рекламы)'
        df_merged['Флаг CPC'] = '-'
        df_merged['name'] = np.nan
        for col in ['Заказов шт. (по РК)', 'Сумма заказов (по РК)', 'Корзины (всего)', 'Расходы на РК', 'Показы', 'Клики', 'Медианная позиция']:
            df_merged[col] = np.nan
    elif df_sales.empty:
        df_merged = df_ads.copy()
        df_merged['has_sales'] = 0
        for col in ['Заказов шт. (всего - справочно)', 'Сумма заказов (всего - справочно)', 'Сумма выкупов (всего - справочно)',
                    'Отмены (шт - справочно)', 'Возвраты (шт - справочно)', 'Цена до СПП', 'Цена после СПП', 'СПП %']:
            df_merged[col] = np.nan
    else:
        df_merged = pd.merge(df_ads, df_sales_grouped, on=['Дата', 'id_товара', 'id_продавца'], how='outer', indicator=True)
        df_merged['has_ads'] = np.where(df_merged['_merge'].isin(['left_only', 'both']), 1, 0)
        df_merged['has_sales'] = np.where(df_merged['_merge'].isin(['right_only', 'both']), 1, 0)
        df_merged.drop(columns=['_merge'], inplace=True)

    # Привязка имени продавца / бренда в lowercase (Вариант 1):
    if 'name' not in df_merged.columns:
        df_merged['name'] = np.nan
    df_merged['name'] = df_merged['name'].replace({'': np.nan, 'nan': np.nan, 'none': np.nan, 'null': np.nan})
    df_merged['name'] = df_merged['name'].fillna(df_merged['id_товара'].map(mapping_item))
    df_merged['name'] = df_merged['name'].fillna(df_merged['id_продавца'].map(mapping_supp))
    df_merged['name'] = df_merged['name'].fillna(df_merged['id_продавца'].astype(str))
    df_merged['name'] = df_merged['name'].astype(str).str.lower().str.strip()

    df_merged['Тип РК'] = df_merged['Тип РК'].fillna('Органика (без рекламы)')
    df_merged['Флаг CPC'] = df_merged['Флаг CPC'].fillna('-')

    # Расчет Веса РК для аллокации продаж:
    ad_exp = pd.to_numeric(df_merged['Расходы на РК'], errors='coerce').fillna(0)
    total_exp = df_merged.groupby(['Дата', 'id_товара', 'id_продавца'])['Расходы на РК'].transform(lambda s: pd.to_numeric(s, errors='coerce').fillna(0).sum())
    count_camps = df_merged.groupby(['Дата', 'id_товара', 'id_продавца'])['id_товара'].transform('count')

    df_merged['Вес РК'] = np.where(
        df_merged['has_ads'] == 0,
        1.0,
        np.where(
            total_exp > 0,
            ad_exp / total_exp,
            1.0 / count_camps
        )
    )

    # Аллокация продаж (только если has_sales == 1):
    has_sales_mask = df_merged['has_sales'] == 1
    for ref_col, out_col in [
        ('Заказов шт. (всего - справочно)', 'Заказов шт. (всего)'),
        ('Сумма заказов (всего - справочно)', 'Сумма заказов (всего)'),
        ('Сумма выкупов (всего - справочно)', 'Сумма выкупов'),
        ('Отмены (шт - справочно)', 'Отмены шт.'),
        ('Возвраты (шт - справочно)', 'Возвраты шт.')
    ]:
        if ref_col in df_merged.columns:
            df_merged[out_col] = np.where(has_sales_mask, pd.to_numeric(df_merged[ref_col], errors='coerce').fillna(0) * df_merged['Вес РК'], np.nan)
        else:
            df_merged[out_col] = np.nan

    for p_col in ['Цена до СПП', 'Цена после СПП', 'СПП %']:
        if p_col in df_merged.columns:
            df_merged[p_col] = np.where(has_sales_mask, pd.to_numeric(df_merged[p_col], errors='coerce'), np.nan)
        else:
            df_merged[p_col] = np.nan

    # Очистка рекламных метрик если нет рекламы (has_ads == 0)
    has_ads_mask = df_merged['has_ads'] == 1
    for ad_col in ['Расходы на РК', 'Показы', 'Клики', 'Корзины (всего)', 'Заказов шт. (по РК)', 'Сумма заказов (по РК)', 'Медианная позиция']:
        if ad_col in df_merged.columns:
            df_merged[ad_col] = np.where(has_ads_mask, pd.to_numeric(df_merged[ad_col], errors='coerce'), np.nan)
        else:
            df_merged[ad_col] = np.nan

    # Агрегация по группам ['Дата', 'id_продавца', 'Тип РК', 'Флаг CPC', 'name']
    group_cols = ['Дата', 'id_продавца', 'Тип РК', 'Флаг CPC', 'name']

    agg_final = {
        'has_ads': 'max',
        'has_sales': 'max',
        'Расходы на РК': lambda s: s.sum(min_count=1),
        'Показы': lambda s: s.sum(min_count=1),
        'Клики': lambda s: s.sum(min_count=1),
        'Корзины (всего)': lambda s: s.sum(min_count=1),
        'Заказов шт. (по РК)': lambda s: s.sum(min_count=1),
        'Сумма заказов (по РК)': lambda s: s.sum(min_count=1),
        'Заказов шт. (всего)': lambda s: s.sum(min_count=1),
        'Сумма заказов (всего)': lambda s: s.sum(min_count=1),
        'Сумма выкупов': lambda s: s.sum(min_count=1),
        'Отмены шт.': lambda s: s.sum(min_count=1),
        'Возвраты шт.': lambda s: s.sum(min_count=1),
        'Медианная позиция': 'mean',
        'Цена до СПП': 'mean',
        'Цена после СПП': 'mean',
        'СПП %': 'mean'
    }

    table_1 = df_merged.groupby(group_cols, as_index=False).agg(agg_final)

    # Сохранение в SQLite
    table_1.to_sql('merged_data', conn, if_exists='replace', index=False)
    cursor = conn.cursor()
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_merged_date ON merged_data ("Дата")')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_merged_name ON merged_data ("name")')
    conn.commit()
    return len(table_1)

def get_status(conn):
    cursor = conn.cursor()
    cursor.execute("SELECT count(*) FROM ads")
    ads_count = cursor.fetchone()[0]
    cursor.execute("SELECT count(*) FROM sales")
    sales_count = cursor.fetchone()[0]
    cursor.execute("SELECT count(*) FROM processed_files")
    files_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='merged_data'")
    has_merged = cursor.fetchone() is not None
    merged_count = 0
    unique_days = 0
    sellers_count = 0
    total_gmv = 0
    total_expenses = 0
    total_orders = 0
    date_min, date_max = None, None

    if has_merged:
        cursor.execute('''
            SELECT 
                count(*),
                count(DISTINCT "Дата"),
                count(DISTINCT "name"),
                min("Дата"),
                max("Дата"),
                sum("Сумма заказов (всего)"),
                sum("Расходы на РК"),
                sum("Заказов шт. (всего)")
            FROM merged_data
        ''')
        row = cursor.fetchone()
        if row and row[0] > 0:
            merged_count = row[0]
            unique_days = row[1] or 0
            sellers_count = row[2] or 0
            date_min = row[3]
            date_max = row[4]
            total_gmv = row[5] or 0.0
            total_expenses = row[6] or 0.0
            total_orders = row[7] or 0

    cursor.execute("SELECT count(DISTINCT item_id) FROM ads WHERE item_id != ''")
    skus_count = cursor.fetchone()[0] or 0

    cursor.execute("SELECT processed_at FROM processed_files ORDER BY processed_at DESC LIMIT 1")
    last_file_row = cursor.fetchone()
    last_sync_time = last_file_row[0] if last_file_row else None

    cursor.execute("SELECT filename, file_type, processed_at, row_count FROM processed_files ORDER BY processed_at DESC LIMIT 10")
    recent_files = [{"name": r[0], "type": r[1], "processed_at": r[2], "rows": r[3]} for r in cursor.fetchall()]

    cfg = load_config()

    return {
        "ads_rows": ads_count,
        "sales_rows": sales_count,
        "merged_rows": merged_count,
        "unique_days": unique_days,
        "sellers_count": sellers_count,
        "total_skus": skus_count,
        "total_gmv": total_gmv,
        "total_expenses": total_expenses,
        "total_orders": total_orders,
        "last_sync_time": last_sync_time,
        "processed_files_count": files_count,
        "date_range": {"from": date_min, "to": date_max},
        "recent_files": recent_files,
        "config": cfg
    }

def sync_category(category, folder_path, conn):
    """
    Интеллектуальная синхронизация файлов категории (ads или sales) с:
    1. Детекцией переименований по SHA-256 хешу (без повторного парсинга и с сохранением целостности).
    2. Детекцией и пропуском копий/дубликатов файлов во избежание задвоения данных.
    3. Инкрементальным обновлением измененных файлов.
    4. Очисткой данных удаленных с диска файлов.
    """
    cursor = conn.cursor()
    table_name = 'ads' if category == 'ads' else 'sales'
    process_fn = process_ads_file if category == 'ads' else process_sales_file

    candidate_filenames = find_candidate_files(folder_path)

    cursor.execute(
        "SELECT filename, row_count, file_mtime, file_size, file_hash FROM processed_files WHERE file_type = ?",
        (category,)
    )
    db_records = {}
    hash_to_db_file = {}
    for row in cursor.fetchall():
        fn, rcnt, mtime, sz, fhash = row[0], row[1] or 0, row[2] or 0.0, row[3] or 0, row[4] or ''
        db_records[fn] = {
            'row_count': rcnt,
            'mtime': mtime,
            'size': sz,
            'hash': fhash
        }
        if fhash:
            hash_to_db_file[fhash] = fn

    disk_file_info = {}
    seen_disk_hashes = {}
    skipped_duplicates = []

    for fname in candidate_filenames:
        fpath = os.path.join(folder_path, fname)
        mtime = os.path.getmtime(fpath) if os.path.exists(fpath) else 0.0
        size = os.path.getsize(fpath) if os.path.exists(fpath) else 0
        fhash = compute_file_hash(fpath)
        disk_file_info[fname] = {
            'path': fpath,
            'mtime': mtime,
            'size': size,
            'hash': fhash
        }

    # Проверка на дубликаты
    valid_candidates = []
    for fname in candidate_filenames:
        info = disk_file_info[fname]
        fhash = info['hash']
        if not fhash:
            valid_candidates.append(fname)
            continue

        # Дубликат внутри файлов на диске
        if fhash in seen_disk_hashes:
            canonical = seen_disk_hashes[fhash]
            skipped_duplicates.append({
                'filename': fname,
                'duplicate_of': canonical,
                'category': category,
                'reason': f"Полная копия файла «{canonical}» (совпадает SHA-256)"
            })
            continue

        # Дубликат уже существующего в базе файла, который до сих пор присутствует на диске
        if fhash in hash_to_db_file and hash_to_db_file[fhash] in candidate_filenames and hash_to_db_file[fhash] != fname:
            canonical = hash_to_db_file[fhash]
            skipped_duplicates.append({
                'filename': fname,
                'duplicate_of': canonical,
                'category': category,
                'reason': f"Полная копия ранее загруженного файла «{canonical}» (совпадает SHA-256)"
            })
            continue

        seen_disk_hashes[fhash] = fname
        valid_candidates.append(fname)

    disk_set = set(valid_candidates)
    db_set = set(db_records.keys())

    missing_from_disk = [fn for fn in db_set if fn not in disk_set]
    new_on_disk = [fn for fn in disk_set if fn not in db_set]
    existing_both = [fn for fn in disk_set if fn in db_set]

    # Словарь отсутствующих файлов по их хешу для детекции переименований
    missing_by_hash = {}
    for old_f in missing_from_disk:
        old_h = db_records[old_f]['hash']
        if old_h:
            missing_by_hash[old_h] = old_f

    renamed_files = []
    truly_new_files = []

    for new_f in new_on_disk:
        info = disk_file_info[new_f]
        new_h = info['hash']
        if new_h and new_h in missing_by_hash:
            old_f = missing_by_hash[new_h]
            # Зафиксировано переименование! Обновляем source_file и processed_files без повторного парсинга
            cursor.execute(
                """UPDATE processed_files 
                   SET filename = ?, file_mtime = ?, file_size = ?, file_hash = ?, processed_at = CURRENT_TIMESTAMP 
                   WHERE filename = ?""",
                (new_f, info['mtime'], info['size'], new_h, old_f)
            )
            cursor.execute(
                f"UPDATE {table_name} SET source_file = ? WHERE source_file = ?",
                (new_f, old_f)
            )
            row_cnt = db_records[old_f]['row_count']
            renamed_files.append({
                'old_name': old_f,
                'new_name': new_f,
                'category': category,
                'rows': row_cnt
            })
            del missing_by_hash[new_h]
            missing_from_disk.remove(old_f)
        else:
            truly_new_files.append(new_f)

    # Удаления: оставшиеся в missing_from_disk файлы действительно удалены с диска
    deleted_files = []
    for old_f in missing_from_disk:
        row_cnt = db_records[old_f]['row_count']
        cursor.execute(f"DELETE FROM {table_name} WHERE source_file = ?", (old_f,))
        cursor.execute("DELETE FROM processed_files WHERE filename = ?", (old_f,))
        deleted_files.append({
            'filename': old_f,
            'category': category,
            'rows': row_cnt
        })

    # Изменения содержимого существующих файлов
    files_to_reimport = []
    for fn in existing_both:
        info = disk_file_info[fn]
        db_rec = db_records[fn]
        mtime_diff = abs(info['mtime'] - db_rec['mtime']) > 0.5
        size_diff = info['size'] != db_rec['size']
        hash_diff = (info['hash'] and db_rec['hash'] and info['hash'] != db_rec['hash'])

        if mtime_diff or size_diff or hash_diff:
            # Если изменился только mtime, а хеш совпадает - просто обновляем метаданные
            if info['hash'] and db_rec['hash'] and info['hash'] == db_rec['hash']:
                cursor.execute(
                    "UPDATE processed_files SET file_mtime = ?, file_size = ? WHERE filename = ?",
                    (info['mtime'], info['size'], fn)
                )
            else:
                files_to_reimport.append(fn)

    conn.commit()

    # Загрузка действительно новых файлов
    rows_added = 0
    new_imported = []
    errors = []
    for fn in truly_new_files:
        info = disk_file_info[fn]
        try:
            cnt = process_fn(info['path'], fn, conn, file_hash=info['hash'], mtime=info['mtime'], size=info['size'])
            rows_added += cnt
            new_imported.append({'filename': fn, 'rows': cnt, 'category': category})
        except Exception as e:
            err_text = str(e)
            print(f"Ошибка при обработке нового файла {fn}: {err_text}", file=sys.stderr)
            errors.append(err_text)
            cursor = conn.cursor()
            cursor.execute(f"DELETE FROM {category} WHERE source_file = ?", (fn,))
            cursor.execute("DELETE FROM processed_files WHERE filename = ?", (fn,))
            conn.commit()

    # Загрузка измененных файлов
    modified_imported = []
    for fn in files_to_reimport:
        info = disk_file_info[fn]
        old_rows = db_records[fn]['row_count']
        try:
            cnt = process_fn(info['path'], fn, conn, file_hash=info['hash'], mtime=info['mtime'], size=info['size'])
            delta = cnt - old_rows
            modified_imported.append({
                'filename': fn,
                'rows_before': old_rows,
                'rows_after': cnt,
                'delta': delta,
                'category': category
            })
        except Exception as e:
            err_text = str(e)
            print(f"Ошибка при обработке измененного файла {fn}: {err_text}", file=sys.stderr)
            errors.append(err_text)
            cursor = conn.cursor()
            cursor.execute(f"DELETE FROM {category} WHERE source_file = ?", (fn,))
            cursor.execute("DELETE FROM processed_files WHERE filename = ?", (fn,))
            conn.commit()

    return {
        'new_files': new_imported,
        'renamed_files': renamed_files,
        'skipped_duplicates': skipped_duplicates,
        'modified_files': modified_imported,
        'deleted_files': deleted_files,
        'rows_added': rows_added,
        'errors': errors
    }

def generate_summary_message(renamed, duplicates, new_files, modified, deleted, net_rows):
    """Формирует исчерпывающее, точное и понятное человеку резюме синхронизации."""
    parts = []

    if renamed:
        names = [f"«{r['old_name']}» ➔ «{r['new_name']}»" for r in renamed]
        parts.append(f"Обнаружено переименование ({len(renamed)}): {', '.join(names)}. Данные сохранены, дублирование исключено.")

    if duplicates:
        dups = [f"«{d['filename']}» (копия «{d['duplicate_of']}»)" for d in duplicates]
        parts.append(f"Пропущены копии-дубликаты ({len(duplicates)}): {', '.join(dups)} во избежание задвоения.")

    if new_files:
        new_names = [f"«{nf['filename']}» (+{nf['rows']} стр.)" for nf in new_files]
        parts.append(f"Загружены новые файлы ({len(new_files)}): {', '.join(new_names)}.")

    if modified:
        mod_names = [f"«{m['filename']}» ({'+' if m['delta'] >= 0 else ''}{m['delta']} стр.)" for m in modified]
        parts.append(f"Обновлены измененные файлы ({len(modified)}): {', '.join(mod_names)}.")

    if deleted:
        del_names = [f"«{d['filename']}» (-{d['rows']} стр.)" for d in deleted]
        parts.append(f"Удалены отсутствующие файлы ({len(deleted)}): {', '.join(del_names)}.")

    if not parts:
        return "Новых файлов и изменений не обнаружено. Все данные актуальны."

    if net_rows > 0:
        parts.append(f"Чистый прирост строк в базе: +{net_rows:,}".replace(',', ' ') + ".")
    elif net_rows < 0:
        parts.append(f"Чистое уменьшение строк в базе: {net_rows:,}".replace(',', ' ') + ".")
    else:
        parts.append("Чистый прирост строк в базе: 0 (количество записей без изменений).")

    return " ".join(parts)

def main():
    cfg = load_config()
    parser = argparse.ArgumentParser(description="Локальная синхронизация отчетов в SQLite")
    parser.add_argument("--db", default=DEFAULT_DB_PATH, help="Путь к SQLite базе данных")
    parser.add_argument("--ads-dir", default=cfg["ads_dir"], help="Папка с файлами рекламы")
    parser.add_argument("--sales-dir", default=cfg["sales_dir"], help="Папка с файлами продаж")
    parser.add_argument("--rebuild-all", action="store_true", help="Очистить БД и заново обработать все файлы из папок")
    parser.add_argument("--clear-db", action="store_true", help="Полностью очистить все таблицы базы данных")
    parser.add_argument("--force-merged", action="store_true", help="Принудительно пересчитать merged_data")
    parser.add_argument("--status", action="store_true", help="Вывести текущую статистику базы")
    parser.add_argument("--json", action="store_true", help="Вывод в формате JSON")

    args = parser.parse_args()

    conn = init_db(args.db)

    if args.clear_db:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM merged_data")
        cursor.execute("DELETE FROM ads")
        cursor.execute("DELETE FROM sales")
        cursor.execute("DELETE FROM processed_files")
        conn.commit()
        cursor.execute("VACUUM")
        st = get_status(conn)
        conn.close()
        if args.json:
            print(json.dumps({"success": True, "message": "База данных полностью очищена", "status": st}, ensure_ascii=False))
        else:
            print("База данных успешно очищена.")
        return

    if args.status:
        st = get_status(conn)
        conn.close()
        if args.json:
            print(json.dumps(st, ensure_ascii=False, indent=2))
        else:
            print("--- Текущий статус базы ---")
            print(f"Записей рекламы (ads): {st['ads_rows']}")
            print(f"Записей продаж (sales): {st['sales_rows']}")
            print(f"Сводных строк (merged_data): {st['merged_rows']}")
            print(f"Период данных: {st['date_range']['from']} ... {st['date_range']['to']}")
            print(f"Папка рекламы: {st['config']['ads_dir']}")
            print(f"Папка продаж: {st['config']['sales_dir']}")
            print(f"Обработано файлов: {st['processed_files_count']}")
        return

    os.makedirs(args.ads_dir, exist_ok=True)
    os.makedirs(args.sales_dir, exist_ok=True)

    cursor = conn.cursor()

    # Исходное число строк до синхронизации
    cursor.execute("SELECT count(*) FROM ads")
    initial_ads = cursor.fetchone()[0]
    cursor.execute("SELECT count(*) FROM sales")
    initial_sales = cursor.fetchone()[0]

    if args.rebuild_all:
        cursor.execute("DELETE FROM ads")
        cursor.execute("DELETE FROM sales")
        cursor.execute("DELETE FROM processed_files")
        conn.commit()
        initial_ads = 0
        initial_sales = 0

    # Автоматическое заполнение хешей для ранее созданных записей, если они отсутствовали
    backfill_missing_hashes(conn, args.ads_dir, args.sales_dir)

    ads_res = sync_category('ads', args.ads_dir, conn)
    sales_res = sync_category('sales', args.sales_dir, conn)

    # Итоговое число строк после синхронизации
    cursor.execute("SELECT count(*) FROM ads")
    final_ads = cursor.fetchone()[0]
    cursor.execute("SELECT count(*) FROM sales")
    final_sales = cursor.fetchone()[0]

    net_rows_added = (final_ads + final_sales) - (initial_ads + initial_sales)

    all_renamed = ads_res['renamed_files'] + sales_res['renamed_files']
    all_duplicates = ads_res['skipped_duplicates'] + sales_res['skipped_duplicates']
    all_new = ads_res['new_files'] + sales_res['new_files']
    all_modified = ads_res['modified_files'] + sales_res['modified_files']
    all_deleted = ads_res['deleted_files'] + sales_res['deleted_files']

    changed_data_count = len(all_new) + len(all_modified) + len(all_deleted)

    all_errors = ads_res.get('errors', []) + sales_res.get('errors', [])
    if all_errors:
        err_msg = "\n".join(all_errors)
        status_data = get_status(conn)
        conn.close()
        result = {
            "success": False,
            "error": err_msg,
            "errors": all_errors,
            "status": status_data
        }
        if args.json:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            print(f"ОШИБКА: {err_msg}", file=sys.stderr)
        sys.exit(1)

    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='merged_data'")
    has_merged_table = cursor.fetchone() is not None

    if changed_data_count > 0 or args.force_merged or not has_merged_table:
        rebuild_merged_data(conn)

    status_data = get_status(conn)
    conn.close()

    if args.rebuild_all:
        summary_message = (
            f"База данных полностью пересчитана с нуля. "
            f"Загружено строк: реклама ({ads_res['rows_added']:,}), продажи ({sales_res['rows_added']:,})."
        ).replace(',', ' ')
    else:
        summary_message = generate_summary_message(
            all_renamed, all_duplicates, all_new, all_modified, all_deleted, net_rows_added
        )

    result = {
        "success": True,
        "net_rows_added": net_rows_added,
        "ads_rows_added": ads_res['rows_added'],
        "sales_rows_added": sales_res['rows_added'],
        "new_ads_files": len(ads_res['new_files']),
        "new_sales_files": len(sales_res['new_files']),
        "renamed_files": all_renamed,
        "skipped_duplicates": all_duplicates,
        "modified_files": all_modified,
        "deleted_files": all_deleted,
        "deleted_files_count": len(all_deleted),
        "summary_message": summary_message,
        "status": status_data
    }

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(summary_message)
        print(f"Итого строк merged_data: {status_data['merged_rows']}.")

if __name__ == "__main__":
    main()
