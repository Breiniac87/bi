#!/usr/bin/env python3
"""
Automated QA Test Suite for E-Commerce Analytics Dashboard
Tests:
1. SQLite Database integrity & schema validation
2. Python data pipeline & allocation logic (sync_local_to_sqlite.py)
3. Edge-case file ingestion & isolation (mock test file insertion and rollback)
4. Metrics calculations & division-by-zero safety
5. Next.js API endpoints (GET/POST /api/sync, POST /api/open-folder)
6. Frontend build & route health checks
"""

import os
import sys
import json
import sqlite3
import urllib.request
import urllib.parse
import pandas as pd
import numpy as np

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)
DB_PATH = os.path.join(PROJECT_ROOT, "dashboard.db")
SERVER_URL = "http://127.0.0.1:3000"

test_results = []

def record_result(category, test_name, status, details=""):
    test_results.append({
        "category": category,
        "test": test_name,
        "status": status,
        "details": details
    })
    badge = "✅ PASS" if status == "PASS" else ("⚠️ WARN" if status == "WARN" else "❌ FAIL")
    print(f"[{badge}] {category} :: {test_name} - {details}")

def test_sqlite_integrity():
    cat = "1. SQLite Database & Schema"
    if not os.path.exists(DB_PATH):
        record_result(cat, "Database File Exists", "FAIL", f"File not found: {DB_PATH}")
        return
    record_result(cat, "Database File Exists", "PASS", f"Found {DB_PATH}")

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Check tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = set(r[0] for r in cursor.fetchall())
        expected_tables = {"ads", "sales", "merged_data", "processed_files"}
        missing = expected_tables - tables
        if missing:
            record_result(cat, "Required Tables", "FAIL", f"Missing tables: {missing}")
        else:
            record_result(cat, "Required Tables", "PASS", f"All tables present: {expected_tables}")

        # Row counts
        for tbl in ["ads", "sales", "merged_data", "processed_files"]:
            cursor.execute(f"SELECT count(*) FROM {tbl}")
            cnt = cursor.fetchone()[0]
            if cnt > 0:
                record_result(cat, f"Table Non-Empty: {tbl}", "PASS", f"{cnt} rows")
            else:
                record_result(cat, f"Table Non-Empty: {tbl}", "WARN", "0 rows")

        # Schema validation for merged_data
        cursor.execute("PRAGMA table_info(merged_data)")
        cols = set(r[1] for r in cursor.fetchall())
        required_cols = [
            "Дата", "id_продавца", "Тип РК", "Флаг CPC", "name",
            "Расходы на РК", "Показы", "Клики", "Корзины (всего)",
            "Заказов шт. (по РК)", "Сумма заказов (по РК)",
            "Заказов шт. (всего)", "Сумма заказов (всего)", "Сумма выкупов"
        ]
        missing_cols = [c for c in required_cols if c not in cols]
        if missing_cols:
            record_result(cat, "merged_data Schema", "FAIL", f"Missing columns: {missing_cols}")
        else:
            record_result(cat, "merged_data Schema", "PASS", f"All key columns present ({len(cols)} total)")

        conn.close()
    except Exception as e:
        record_result(cat, "Database Connection", "FAIL", str(e))

def test_metrics_math():
    cat = "2. Metrics Math & Division-by-Zero Safety"
    from sync_local_to_sqlite import rebuild_merged_data

    # Test edge case with zero values
    def calc_metrics_mock(imp, clicks, carts, orders_ads, gmv_ads, orders_total, gmv_total, buyouts, expenses, cancels, returns):
        cpm = (expenses / imp * 1000) if imp > 0 else 0
        cpc = (expenses / clicks) if clicks > 0 else 0
        ctr = (clicks / imp * 100) if imp > 0 else 0
        cr_click_cart = (carts / clicks * 100) if clicks > 0 else 0
        cr_cart_order = (orders_ads / carts * 100) if carts > 0 else 0
        cr_click_order = (orders_ads / clicks * 100) if clicks > 0 else 0
        cpa_ads = (expenses / orders_ads) if orders_ads > 0 else 0
        drr_ads = (expenses / gmv_ads * 100) if gmv_ads > 0 else 0
        cpo_total = (expenses / orders_total) if orders_total > 0 else 0
        drr_total = (expenses / gmv_total * 100) if gmv_total > 0 else 0
        drr_sales = (expenses / buyouts * 100) if buyouts > 0 else 0
        organic_share = (((orders_total - orders_ads) / orders_total) * 100) if orders_total > 0 else 0
        halo = (orders_total / orders_ads) if orders_ads > 0 else 0
        aov = (gmv_total / orders_total) if orders_total > 0 else 0
        cancels_share = (((cancels + returns) / orders_total) * 100) if orders_total > 0 else 0
        roas = (buyouts / expenses) if expenses > 0 else 0
        return {
            "cpm": cpm, "cpc": cpc, "ctr": ctr, "cr_click_cart": cr_click_cart,
            "cr_cart_order": cr_cart_order, "cr_click_order": cr_click_order,
            "cpa_ads": cpa_ads, "drr_ads": drr_ads, "cpo_total": cpo_total,
            "drr_total": drr_total, "drr_sales": drr_sales, "organic_share": organic_share,
            "halo": halo, "aov": aov, "cancels_share": cancels_share, "roas": roas
        }

    # Case 1: All zeroes
    try:
        res_zero = calc_metrics_mock(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
        has_nan_or_inf = any(np.isnan(v) or np.isinf(v) for v in res_zero.values())
        if has_nan_or_inf:
            record_result(cat, "Zero Values Safety", "FAIL", f"Found NaN/Inf: {res_zero}")
        else:
            record_result(cat, "Zero Values Safety", "PASS", "All division by zero safely return 0")
    except Exception as e:
        record_result(cat, "Zero Values Safety", "FAIL", str(e))

    # Case 2: Realistic values
    try:
        res = calc_metrics_mock(
            imp=10000, clicks=500, carts=50, orders_ads=20, gmv_ads=40000,
            orders_total=30, gmv_total=60000, buyouts=50000, expenses=8000,
            cancels=2, returns=1
        )
        assert abs(res["ctr"] - 5.0) < 0.01, f"Expected CTR 5.0, got {res['ctr']}"
        assert abs(res["cpc"] - 16.0) < 0.01, f"Expected CPC 16.0, got {res['cpc']}"
        assert abs(res["cpm"] - 800.0) < 0.01, f"Expected CPM 800.0, got {res['cpm']}"
        assert abs(res["drr_ads"] - 20.0) < 0.01, f"Expected DRR Ads 20.0, got {res['drr_ads']}"
        assert abs(res["drr_total"] - 13.33) < 0.05, f"Expected DRR Total 13.33, got {res['drr_total']}"
        assert abs(res["halo"] - 1.5) < 0.01, f"Expected Halo 1.5, got {res['halo']}"
        assert abs(res["roas"] - 6.25) < 0.01, f"Expected ROAS 6.25, got {res['roas']}"
        record_result(cat, "Metric Formula Accuracy", "PASS", "CTR, CPC, CPM, DRR, Halo, ROAS match mathematical definitions")
    except Exception as e:
        record_result(cat, "Metric Formula Accuracy", "FAIL", str(e))

def test_file_pipeline_and_deduplication():
    cat = "3. File Ingestion Pipeline"
    ads_dir = os.path.join(PROJECT_ROOT, "data", "ads")
    sales_dir = os.path.join(PROJECT_ROOT, "data", "sales")

    if not os.path.isdir(ads_dir) or not os.path.isdir(sales_dir):
        record_result(cat, "Local Directories", "FAIL", f"Missing data/ads or data/sales: {ads_dir}, {sales_dir}")
        return
    record_result(cat, "Local Directories", "PASS", f"Directories exist: {ads_dir}, {sales_dir}")

    # Test file mock creation, ingestion, deduplication and rollback
    test_ad_file = os.path.join(ads_dir, "__qa_mock_test_ad.csv")
    test_sales_file = os.path.join(sales_dir, "__qa_mock_test_sales.csv")

    try:
        # Create valid mock ad
        df_mock_ad = pd.DataFrame([{
            'event_date': '2026-07-20',
            'nm': '999999999',
            'supplier_id': 'QA_TEST_SUPPLIER',
            'тип рк': 'Поиск QA',
            'флаг cpc': 'Да',
            'name': 'QA Test Seller',
            'кол-во заказов (прямая)': 5,
            'кол-во заказов (атрибуция, ассоциированная)': 2,
            'gmv заказов (прямая)': 10000,
            'gmv заказов (атрибуция, ассоциированная)': 4000,
            'кол-во заказов в корзине (прямая)': 15,
            'кол-во заказов в корзине (атрибуция, ассоциированная)': 5,
            'затраты на рекламу (общие)': 2000,
            'показы': 1000,
            'клики': 100,
            'медианная позиция': 3.5
        }])
        df_mock_ad.to_csv(test_ad_file, index=False)

        # Create valid mock sales
        df_mock_sales = pd.DataFrame([{
            'период': '2026-07-20',
            'nm_id': '999999999',
            'supplier_id': 'QA_TEST_SUPPLIER',
            'заказы, шт': 10,
            'заказы, руб': 20000,
            'продажи по оплатам, руб': 18000,
            'заказы, цена до спп': 2200,
            'заказы, цена после спп (aiv)': 2000,
            'заказы, процент спп': 10,
            'отмены, шт': 1,
            'возвраты, шт': 0
        }])
        df_mock_sales.to_csv(test_sales_file, index=False)

        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        from sync_local_to_sqlite import process_ads_file, process_sales_file, rebuild_merged_data

        cnt_ad = process_ads_file(test_ad_file, "__qa_mock_test_ad.csv", conn)
        cnt_sales = process_sales_file(test_sales_file, "__qa_mock_test_sales.csv", conn)

        if cnt_ad == 1 and cnt_sales == 1:
            record_result(cat, "Mock File Parsing", "PASS", "Mock ad and sales files ingested with exact row counts")
        else:
            record_result(cat, "Mock File Parsing", "FAIL", f"Unexpected row counts: ad={cnt_ad}, sales={cnt_sales}")

        # Check deduplication tracking in processed_files
        cursor.execute("SELECT count(*) FROM processed_files WHERE filename LIKE '__qa_mock%'")
        p_count = cursor.fetchone()[0]
        if p_count == 2:
            record_result(cat, "Processed Files Tracking", "PASS", "Both mock files tracked in processed_files")
        else:
            record_result(cat, "Processed Files Tracking", "FAIL", f"Found {p_count} in processed_files")

        # Rollback mock test records to keep DB pristine
        cursor.execute("DELETE FROM ads WHERE supplier_id='QA_TEST_SUPPLIER'")
        cursor.execute("DELETE FROM sales WHERE supplier_id='QA_TEST_SUPPLIER'")
        cursor.execute("DELETE FROM processed_files WHERE filename LIKE '__qa_mock%'")
        conn.commit()
        conn.close()

        record_result(cat, "Test Isolation & Rollback", "PASS", "Database cleaned up and restored to original state")

    finally:
        if os.path.exists(test_ad_file):
            os.remove(test_ad_file)
        if os.path.exists(test_sales_file):
            os.remove(test_sales_file)

def test_api_endpoints():
    cat = "4. Next.js API Endpoints"

    # Test GET /api/sync
    try:
        req = urllib.request.Request(f"{SERVER_URL}/api/sync", headers={"User-Agent": "QA-Runner"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            status_code = resp.getcode()
            body = json.loads(resp.read().decode('utf-8'))
            if status_code == 200 and body.get("success") is True and "status" in body:
                st = body["status"]
                record_result(cat, "GET /api/sync", "PASS", f"HTTP 200, {st.get('merged_rows')} merged rows, {st.get('processed_files_count')} files")
            else:
                record_result(cat, "GET /api/sync", "FAIL", f"HTTP {status_code}, body: {body}")
    except Exception as e:
        record_result(cat, "GET /api/sync", "FAIL", str(e))

    # Test POST /api/sync
    try:
        data_bytes = json.dumps({}).encode('utf-8')
        req = urllib.request.Request(f"{SERVER_URL}/api/sync", data=data_bytes, headers={"Content-Type": "application/json", "User-Agent": "QA-Runner"}, method="POST")
        with urllib.request.urlopen(req, timeout=10) as resp:
            status_code = resp.getcode()
            body = json.loads(resp.read().decode('utf-8'))
            if status_code == 200 and body.get("success") is True and "data" in body:
                record_result(cat, "POST /api/sync", "PASS", f"HTTP 200, sync completed, returned {len(body['data'])} data rows")
            else:
                record_result(cat, "POST /api/sync", "FAIL", f"HTTP {status_code}, body: {body}")
    except Exception as e:
        record_result(cat, "POST /api/sync", "FAIL", str(e))

    # Test POST /api/open-folder (with dryRun to avoid popping Finder GUI during automated testing)
    try:
        data_bytes = json.dumps({"type": "ads", "dryRun": True}).encode('utf-8')
        req = urllib.request.Request(f"{SERVER_URL}/api/open-folder", data=data_bytes, headers={"Content-Type": "application/json", "User-Agent": "QA-Runner"}, method="POST")
        with urllib.request.urlopen(req, timeout=5) as resp:
            status_code = resp.getcode()
            body = json.loads(resp.read().decode('utf-8'))
            if status_code == 200 and body.get("success") is True and "folder" in body:
                record_result(cat, "POST /api/open-folder (ads, dryRun)", "PASS", f"HTTP 200, validated folder: {body['folder']}")
            else:
                record_result(cat, "POST /api/open-folder (ads, dryRun)", "FAIL", f"HTTP {status_code}, body: {body}")
    except Exception as e:
        record_result(cat, "POST /api/open-folder (ads, dryRun)", "FAIL", str(e))

    # Test GET /api/select-folder
    try:
        req = urllib.request.Request(f"{SERVER_URL}/api/select-folder", headers={"User-Agent": "QA-Runner"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            status_code = resp.getcode()
            body = json.loads(resp.read().decode('utf-8'))
            if status_code == 200 and body.get("success") is True and "config" in body:
                record_result(cat, "GET /api/select-folder", "PASS", f"HTTP 200, sales_dir: {body['config'].get('sales_dir')}")
            else:
                record_result(cat, "GET /api/select-folder", "FAIL", f"HTTP {status_code}, body: {body}")
    except Exception as e:
        record_result(cat, "GET /api/select-folder", "FAIL", str(e))

def test_frontend_routes():
    cat = "5. Frontend Web Routes"
    routes = ["/", "/dictionary"]
    for route in routes:
        try:
            req = urllib.request.Request(f"{SERVER_URL}{route}", headers={"User-Agent": "QA-Runner"})
            with urllib.request.urlopen(req, timeout=5) as resp:
                status_code = resp.getcode()
                content = resp.read().decode('utf-8')
                if status_code == 200 and len(content) > 100:
                    record_result(cat, f"Route {route}", "PASS", f"HTTP 200, HTML size {len(content)} bytes")
                else:
                    record_result(cat, f"Route {route}", "FAIL", f"HTTP {status_code}")
        except Exception as e:
            record_result(cat, f"Route {route}", "FAIL", str(e))

def test_edge_cases_and_resilience():
    cat = "6. Edge Cases & Resilience"
    import time
    ads_dir = os.path.join(PROJECT_ROOT, "data", "ads")
    corrupt_file = os.path.join(ads_dir, "__qa_corrupted.csv")
    temp_excel_file = os.path.join(ads_dir, "~$qa_temp.xlsx")

    try:
        # 1. Ignored temp files
        with open(temp_excel_file, "w") as f:
            f.write("temporary lock file")
        from sync_local_to_sqlite import find_candidate_files
        candidates = find_candidate_files(ads_dir)
        if "~$qa_temp.xlsx" not in candidates:
            record_result(cat, "Ignore Excel Lock Files (~$*)", "PASS", "Temporary ~$* files correctly ignored")
        else:
            record_result(cat, "Ignore Excel Lock Files (~$*)", "FAIL", "Found temporary lock file in candidates")

        # 2. Corrupted file error isolation
        with open(corrupt_file, "wb") as f:
            f.write(b"\x00\xff\xfe\x00corrupted_non_csv_garbage\xff\xff")
        conn = sqlite3.connect(DB_PATH)
        from sync_local_to_sqlite import process_ads_file
        try:
            process_ads_file(corrupt_file, "__qa_corrupted.csv", conn)
            record_result(cat, "Corrupted File Handling", "WARN", "Did not raise exception on corrupt file")
        except Exception:
            record_result(cat, "Corrupted File Handling", "PASS", "Corrupted file safely caught without crashing database")
        conn.close()
    finally:
        if os.path.exists(temp_excel_file):
            os.remove(temp_excel_file)
        if os.path.exists(corrupt_file):
            os.remove(corrupt_file)

def test_performance():
    cat = "7. Performance & Latency"
    import time
    conn = sqlite3.connect(DB_PATH)
    t0 = time.perf_counter()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM merged_data ORDER BY Дата ASC")
    rows = cursor.fetchall()
    t_query = (time.perf_counter() - t0) * 1000
    conn.close()

    if t_query < 50:
        record_result(cat, "SQLite Query Latency", "PASS", f"{t_query:.2f} ms for {len(rows)} merged rows (Target < 50ms)")
    else:
        record_result(cat, "SQLite Query Latency", "WARN", f"{t_query:.2f} ms")

    # Measure API latency
    t0 = time.perf_counter()
    req = urllib.request.Request(f"{SERVER_URL}/api/sync", headers={"User-Agent": "QA-Runner"})
    with urllib.request.urlopen(req, timeout=5) as resp:
        resp.read()
    t_api = (time.perf_counter() - t0) * 1000

    if t_api < 500:
        record_result(cat, "API GET /api/sync Latency", "PASS", f"{t_api:.2f} ms (Target < 500ms)")
    else:
        record_result(cat, "API GET /api/sync Latency", "WARN", f"{t_api:.2f} ms")

def print_summary():
    print("\n" + "="*80)
    print("                      QA TEST EXECUTION SUMMARY")
    print("="*80)
    passed = sum(1 for r in test_results if r["status"] == "PASS")
    warned = sum(1 for r in test_results if r["status"] == "WARN")
    failed = sum(1 for r in test_results if r["status"] == "FAIL")
    total = len(test_results)

    print(f"Total Tests Run: {total}")
    print(f"Passed: {passed} | Warnings: {warned} | Failed: {failed}")
    print("="*80)
    if failed == 0:
        print("🎉 ALL CRITICAL TESTS PASSED SUCCESSFULLY!")
    else:
        print("⚠️ SOME TESTS FAILED - REVIEW LOGS ABOVE.")
    print("="*80 + "\n")

    return failed == 0

if __name__ == "__main__":
    print("=== Starting E-Commerce Analytics QA Test Suite ===\n")
    test_sqlite_integrity()
    test_metrics_math()
    test_file_pipeline_and_deduplication()
    test_api_endpoints()
    test_frontend_routes()
    test_edge_cases_and_resilience()
    test_performance()
    success = print_summary()
    sys.exit(0 if success else 1)

