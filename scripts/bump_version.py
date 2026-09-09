#!/usr/bin/env python3
"""
scripts/bump_version.py
Скрипт для синхронного управления версиями приложения во всем репозитории:
- frontend/package.json
- frontend/package-lock.json
- frontend/src/lib/version.ts
- windows/build_portable.bat
- windows/КАК_СОБРАТЬ_ПОРТАТИВНУЮ_ВЕРСИЮ.txt
- macos/Info.plist
- README.md

Использование:
  python3 scripts/bump_version.py --check
  python3 scripts/bump_version.py patch      # 1.0.2 -> 1.0.3
  python3 scripts/bump_version.py minor      # 1.0.2 -> 1.1.0
  python3 scripts/bump_version.py major      # 1.0.2 -> 2.0.0
  python3 scripts/bump_version.py 1.0.3      # явное указание версии
"""

import sys
import os
import re
import json
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
PACKAGE_JSON_PATH = ROOT_DIR / "frontend" / "package.json"
PACKAGE_LOCK_PATH = ROOT_DIR / "frontend" / "package-lock.json"
VERSION_TS_PATH = ROOT_DIR / "frontend" / "src" / "lib" / "version.ts"
PORTABLE_BAT_PATH = ROOT_DIR / "windows" / "build_portable.bat"
PORTABLE_TXT_PATH = ROOT_DIR / "windows" / "КАК_СОБРАТЬ_ПОРТАТИВНУЮ_ВЕРСИЮ.txt"
MACOS_PLIST_PATH = ROOT_DIR / "macos" / "Info.plist"
README_PATH = ROOT_DIR / "README.md"


def get_current_version() -> str:
    if not PACKAGE_JSON_PATH.exists():
        raise FileNotFoundError(f"Не найден {PACKAGE_JSON_PATH}")
    with open(PACKAGE_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("version", "1.0.0")


def compute_next_version(current: str, action: str) -> str:
    m = re.match(r"^(\d+)\.(\d+)\.(\d+)$", current.strip())
    if not m:
        raise ValueError(f"Текущая версия '{current}' не соответствует формату semver X.Y.Z")
    major, minor, patch = map(int, m.groups())

    if action == "patch":
        patch += 1
    elif action == "minor":
        minor += 1
        patch = 0
    elif action == "major":
        major += 1
        minor = 0
        patch = 0
    elif re.match(r"^\d+\.\d+\.\d+$", action):
        return action
    else:
        raise ValueError(
            f"Неизвестный аргумент '{action}'. Допустимо: patch, minor, major или версия X.Y.Z (например: 1.0.3)"
        )

    return f"{major}.{minor}.{patch}"


def update_package_json(new_ver: str) -> None:
    with open(PACKAGE_JSON_PATH, "r", encoding="utf-8") as f:
        content = f.read()
    updated = re.sub(r'("version"\s*:\s*)"[^"]+"', rf'\g<1>"{new_ver}"', content, count=1)
    with open(PACKAGE_JSON_PATH, "w", encoding="utf-8") as f:
        f.write(updated)
    print(f"✓ Обновлен {PACKAGE_JSON_PATH.relative_to(ROOT_DIR)} -> {new_ver}")


def update_package_lock_json(new_ver: str) -> None:
    if not PACKAGE_LOCK_PATH.exists():
        return
    with open(PACKAGE_LOCK_PATH, "r", encoding="utf-8") as f:
        content = f.read()
    updated = re.sub(r'("version"\s*:\s*)"[^"]+"', rf'\g<1>"{new_ver}"', content, count=2)
    with open(PACKAGE_LOCK_PATH, "w", encoding="utf-8") as f:
        f.write(updated)
    print(f"✓ Обновлен {PACKAGE_LOCK_PATH.relative_to(ROOT_DIR)} -> {new_ver}")


def update_version_ts(new_ver: str) -> None:
    content = (
        f"export const APP_VERSION = '{new_ver}';\n"
        f"export const APP_NAME = 'E-Commerce Analytics Dashboard';\n"
    )
    with open(VERSION_TS_PATH, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"✓ Обновлен {VERSION_TS_PATH.relative_to(ROOT_DIR)} -> {new_ver}")


def update_portable_bat(new_ver: str) -> None:
    if not PORTABLE_BAT_PATH.exists():
        return
    with open(PORTABLE_BAT_PATH, "r", encoding="utf-8") as f:
        content = f.read()
    updated = re.sub(r'set\s+"APP_VERSION=[0-9.]+"', f'set "APP_VERSION={new_ver}"', content)
    with open(PORTABLE_BAT_PATH, "w", encoding="utf-8") as f:
        f.write(updated)
    print(f"✓ Обновлен {PORTABLE_BAT_PATH.relative_to(ROOT_DIR)} -> {new_ver}")


def update_portable_txt(new_ver: str) -> None:
    if not PORTABLE_TXT_PATH.exists():
        return
    with open(PORTABLE_TXT_PATH, "r", encoding="utf-8") as f:
        content = f.read()
    updated = re.sub(r'E-Commerce-Dashboard-Portable-v[0-9.]+\.zip', f'E-Commerce-Dashboard-Portable-v{new_ver}.zip', content)
    with open(PORTABLE_TXT_PATH, "w", encoding="utf-8") as f:
        f.write(updated)
    print(f"✓ Обновлен {PORTABLE_TXT_PATH.relative_to(ROOT_DIR)} -> {new_ver}")


def update_macos_plist(new_ver: str) -> None:
    if not MACOS_PLIST_PATH.exists():
        return
    with open(MACOS_PLIST_PATH, "r", encoding="utf-8") as f:
        content = f.read()
    updated = re.sub(r'(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]+(<\/string>)', rf'\g<1>{new_ver}\g<2>', content)
    updated = re.sub(r'(<key>CFBundleVersion<\/key>\s*<string>)[^<]+(<\/string>)', rf'\g<1>{new_ver}\g<2>', updated)
    with open(MACOS_PLIST_PATH, "w", encoding="utf-8") as f:
        f.write(updated)
    print(f"✓ Обновлен {MACOS_PLIST_PATH.relative_to(ROOT_DIR)} -> {new_ver}")


def update_readme(new_ver: str) -> None:
    if not README_PATH.exists():
        return
    with open(README_PATH, "r", encoding="utf-8") as f:
        content = f.read()
    updated = re.sub(r'E-Commerce-Dashboard-Portable-v[0-9.]+\.zip', f'E-Commerce-Dashboard-Portable-v{new_ver}.zip', content)
    with open(README_PATH, "w", encoding="utf-8") as f:
        f.write(updated)
    print(f"✓ Обновлен {README_PATH.relative_to(ROOT_DIR)} -> {new_ver}")


def check_status() -> None:
    cur_ver = get_current_version()
    print("=" * 60)
    print(f"Текущая версия проекта: v{cur_ver}")
    print("=" * 60)
    print(f"1. {PACKAGE_JSON_PATH.relative_to(ROOT_DIR)}: {cur_ver}")
    
    if VERSION_TS_PATH.exists():
        vts = VERSION_TS_PATH.read_text(encoding="utf-8")
        m_ts = re.search(r"APP_VERSION\s*=\s*'([^']+)'", vts)
        print(f"2. {VERSION_TS_PATH.relative_to(ROOT_DIR)}: {m_ts.group(1) if m_ts else 'НЕ НАЙДЕН'}")

    print("=" * 60)
    print("Целевой файл сборщика:")
    print(f"   release_windows/E-Commerce-Dashboard-Portable-v{cur_ver}.zip")
    print("=" * 60)


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("--help", "-h"):
        print(__doc__)
        sys.exit(0)

    arg = sys.argv[1]

    if arg in ("--check", "-c", "check", "status"):
        check_status()
        sys.exit(0)

    cur_ver = get_current_version()
    next_ver = compute_next_version(cur_ver, arg)

    print(f"Переход с версии v{cur_ver} -> v{next_ver}")
    update_package_json(next_ver)
    update_package_lock_json(next_ver)
    update_version_ts(next_ver)
    update_portable_bat(next_ver)
    update_portable_txt(next_ver)
    update_macos_plist(next_ver)
    update_readme(next_ver)

    print("=" * 60)
    print(f"Успешно установлена версия v{next_ver}!")
    print(f"Имя архива при следующей сборке:")
    print(f"  E-Commerce-Dashboard-Portable-v{next_ver}.zip")
    print("=" * 60)


if __name__ == "__main__":
    main()
