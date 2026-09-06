#!/usr/bin/env python3
"""
Convert macOS PNG icon into multi-resolution Windows .ico file.
Sizes: 16x16, 24x24, 32x32, 48x48, 64x64, 128x128, 256x256
"""

import os
import sys
from PIL import Image

def generate_ico():
    scripts_dir = os.path.dirname(os.path.abspath(__file__))
    src_png = os.path.join(scripts_dir, "AppIcon_1024.png")
    dst_ico = os.path.join(scripts_dir, "app_icon.ico")
    win_ico = os.path.join(os.path.dirname(scripts_dir), "windows", "app_icon.ico")

    if not os.path.exists(src_png):
        print(f"Error: Source icon not found: {src_png}")
        sys.exit(1)

    print(f"Loading {src_png}...")
    img = Image.open(src_png)

    # Convert to RGBA
    if img.mode != "RGBA":
        img = img.convert("RGBA")

    sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    print(f"Saving multi-layer Windows icon to {dst_ico} and {win_ico} with sizes: {sizes}...")
    img.save(dst_ico, format="ICO", sizes=sizes)
    os.makedirs(os.path.dirname(win_ico), exist_ok=True)
    img.save(win_ico, format="ICO", sizes=sizes)
    print(f"Success! {dst_ico} and {win_ico} generated.")

if __name__ == "__main__":
    generate_ico()
