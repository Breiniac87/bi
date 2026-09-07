#!/usr/bin/env python3
"""
scripts/bump_version.py
Скрипт для синхронного управления версиями приложения во всем репозитории:
- frontend/package.json
- frontend/src/lib/version.ts
- windows/installer.iss

Использование:
  python3 scripts/bump_version.py --check
  python3 scripts/bump_version.py patch      # 1.0.1 -> 1.0.2
  python3 scripts/bump_version.py minor      # 1.0.1 -> 1.1.0
  python3 scripts/bump_version.py major      # 1.0.1 -> 2.0.0
  python3 scripts/bump_version.py 1.0.2      # явное указание версии
"""

import sys
import os
import re
import json
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
PACKAGE_JSON_PATH = ROOT_DIR / "frontend" / "package.json"
VERSION_TS_PATH = ROOT_DIR / "frontend" / "src" / "lib" / "version.ts"
INSTALLER_ISS_PATH = ROOT_DIR / "windows" / "installer.iss"


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
            f"Неизвестный аргумент '{action}'. Допустимо: patch, minor, major или версия X.Y.Z (например: 1.0.2)"
        )

    return f"{major}.{minor}.{patch}"


def update_package_json(new_ver: str) -> None:
    with open(PACKAGE_JSON_PATH, "r", encoding="utf-8") as f:
        content = f.read()
    updated = re.sub(r'("version"\s*:\s*)"[^"]+"', rf'\g<1>"{new_ver}"', content, count=1)
    with open(PACKAGE_JSON_PATH, "w", encoding="utf-8") as f:
        f.write(updated)
    print(f"✓ Обновлен {PACKAGE_JSON_PATH.relative_to(ROOT_DIR)} -> {new_ver}")


def update_version_ts(new_ver: str) -> None:
    content = (
        f"export const APP_VERSION = '{new_ver}';\n"
        f"export const APP_NAME = 'E-Commerce Analytics Dashboard';\n"
    )
    with open(VERSION_TS_PATH, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"✓ Обновлен {VERSION_TS_PATH.relative_to(ROOT_DIR)} -> {new_ver}")


def update_installer_iss(new_ver: str) -> None:
    if not INSTALLER_ISS_PATH.exists():
        print(f"! Пропущен {INSTALLER_ISS_PATH.relative_to(ROOT_DIR)} (не найден)")
        return
    with open(INSTALLER_ISS_PATH, "r", encoding="utf-8") as f:
        content = f.read()
    updated = re.sub(
        r'(#define\s+MyAppVersion\s+)"[^"]+"',
        rf'\g<1>"{new_ver}"',
        content,
        count=1
    )
    with open(INSTALLER_ISS_PATH, "w", encoding="utf-8") as f:
        f.write(updated)
    print(f"✓ Обновлен {INSTALLER_ISS_PATH.relative_to(ROOT_DIR)} -> {new_ver}")


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
    
    if INSTALLER_ISS_PATH.exists():
        viss = INSTALLER_ISS_PATH.read_text(encoding="utf-8")
        m_iss = re.search(r'#define\s+MyAppVersion\s+"([^"]+)"', viss)
        print(f"3. {INSTALLER_ISS_PATH.relative_to(ROOT_DIR)}: {m_iss.group(1) if m_iss else 'НЕ НАЙДЕН'}")
    print("=" * 60)
    print("Целевой файл сборщика:")
    print(f"   release_windows/E-Commerce-Dashboard-Setup-v{cur_ver}.exe")
    print("=" * 60)


def main():
    args = sys.argv[1:]
    if not args or args[0] in ("--check", "-c", "check", "status"):
        check_status()
        return

    action = args[0]
    cur_ver = get_current_version()
    new_ver = compute_next_version(cur_ver, action)

    print(f"Переход с версии v{cur_ver} -> v{new_ver}")
    update_package_json(new_ver)
    update_version_ts(new_ver)
    update_installer_iss(new_ver)
    print("=" * 60)
    print(f"Успешно установлена версия v{new_ver}!")
    print(f"Имя установщика при следующей сборке:")
    print(f"  E-Commerce-Dashboard-Setup-v{new_ver}.exe")
    print("=" * 60)


if __name__ == "__main__":
    main()
