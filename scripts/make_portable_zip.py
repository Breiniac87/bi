#!/usr/bin/env python3
"""
scripts/make_portable_zip.py
Надежная упаковка портативного релиза в ZIP-архив без пропуска скрытых папок и dot-директорий (.next).
В отличие от PowerShell Compress-Archive, гарантирует 100% включение всех ассетов, стилей CSS,
чанков JS и рантайма.
"""

import sys
import os
import zipfile
from pathlib import Path


def create_portable_zip(source_dir: str, output_zip: str) -> None:
    src_path = Path(source_dir).resolve()
    zip_path = Path(output_zip).resolve()

    if not src_path.exists() or not src_path.is_dir():
        print(f"[Zip Error] Исходный каталог не существует: {src_path}", file=sys.stderr)
        sys.exit(1)

    zip_path.parent.mkdir(parents=True, exist_ok=True)
    if zip_path.exists():
        zip_path.unlink()

    print(f"[Zip] Архивирование портативной сборки:")
    print(f"  Источник: {src_path}")
    print(f"  Назначение: {zip_path}")

    # Базовое имя папки верхнего уровня внутри ZIP (например, E-Commerce-Dashboard-Portable)
    base_folder_name = src_path.name
    total_files = 0
    total_uncompressed_bytes = 0

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for root, dirs, files in os.walk(src_path):
            # os.walk гарантированно не пропускает папки с точкой (.next)
            for filename in files:
                file_path = Path(root) / filename
                rel_from_src = file_path.relative_to(src_path)
                # Путь внутри ZIP-архива: E-Commerce-Dashboard-Portable/app/...
                arcname = (Path(base_folder_name) / rel_from_src).as_posix()

                zf.write(file_path, arcname)
                total_files += 1
                total_uncompressed_bytes += file_path.stat().st_size

    print(f"[Zip] ✓ Заархивировано файлов: {total_files}")
    zip_size = zip_path.stat().st_size
    print(f"[Zip]   Исходный объем: {total_uncompressed_bytes / (1024*1024):.1f} MB")
    print(f"[Zip]   Размер ZIP:     {zip_size / (1024*1024):.1f} MB")

    # ВАЛИДАЦИЯ СОДЕРЖИМОГО АРХИВА
    print("[Zip] Проверка целостности и наличия ключевых компонентов в архиве...")
    with zipfile.ZipFile(zip_path, "r") as zf:
        names = zf.namelist()

        # 1. Проверка наличия .next/static
        static_files = [n for n in names if "/.next/static/" in n]
        if not static_files:
            print("[Zip Error] КРИТИЧЕСКАЯ ОШИБКА: Каталог .next/static отсутствует в созданном архиве!", file=sys.stderr)
            sys.exit(1)

        # 2. Проверка наличия CSS файлов стилей
        css_files = [n for n in static_files if n.endswith(".css")]
        if not css_files:
            print("[Zip Error] КРИТИЧЕСКАЯ ОШИБКА: Ни один файл .css не найден в .next/static в архиве!", file=sys.stderr)
            sys.exit(1)

        # 3. Проверка наличия server.js и исполняемых файлов
        server_files = [n for n in names if n.endswith("/app/server.js")]
        if not server_files:
            print("[Zip Error] КРИТИЧЕСКАЯ ОШИБКА: app/server.js не найден в архиве!", file=sys.stderr)
            sys.exit(1)

        print(f"[Zip] ✓ Проверка пройдена успешно:")
        print(f"   - CSS стили: {len(css_files)} файл(ов) ({', '.join(Path(c).name for c in css_files[:3])})")
        print(f"   - Статические ассеты: {len(static_files)} файл(ов)")
        print(f"   - Серверный рантайм: OK")

    print(f"[Zip] ✓ Готовый проверенный архив: {zip_path}")


def main():
    if len(sys.argv) < 3:
        print("Использование: python make_portable_zip.py <source_directory> <output_zip_path>")
        sys.exit(1)

    create_portable_zip(sys.argv[1], sys.argv[2])


if __name__ == "__main__":
    main()
