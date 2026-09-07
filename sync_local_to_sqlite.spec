# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['sync_local_to_sqlite.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=['openpyxl', 'pandas', 'numpy', 'sqlite3'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

import os
import sys

icon_file = 'windows/app_icon.ico' if os.path.exists('windows/app_icon.ico') else 'scripts/app_icon.ico'

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='sync_local_to_sqlite',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=icon_file,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='sync_local_to_sqlite',
)
