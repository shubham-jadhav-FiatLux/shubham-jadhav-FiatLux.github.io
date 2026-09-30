#!/usr/bin/env python3
"""Subset the Ma Shan Zheng brush font to the glyphs the site actually uses.

The full font is ~5.8 MB because it covers thousands of CJK characters.
We only need Basic Latin plus a handful of decorative characters, which
brings the web font down to a few dozen kilobytes.

Usage:
    pip install fonttools brotli
    curl -L -o MaShanZheng-Regular.ttf \
      https://raw.githubusercontent.com/google/fonts/main/ofl/mashanzheng/MaShanZheng-Regular.ttf
    python3 scripts/subset-font.py MaShanZheng-Regular.ttf

If you add new Chinese characters to the UI (for example in
src/content/portfolio.ts), add them to CJK below and re-run the script.
"""
import sys
from pathlib import Path

from fontTools import subset

LATIN = "".join(chr(c) for c in range(0x20, 0x7F)) + "·—–’‘“”…•×"
# Decorative characters used by the UI (seals, signboards, numbering).
CJK = "竹语谷迎我技路作信悟山水风卷一二三四五六七八九十欢静心道福禅荣光桥塔亭钟门拳"

def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    out = Path(__file__).resolve().parent.parent / "src/assets/fonts/brush-subset.woff2"
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    font = subset.load_font(str(src), opts)
    sub = subset.Subsetter(opts)
    sub.populate(text=LATIN + CJK)
    sub.subset(font)
    subset.save_font(font, str(out), opts)
    print(f"wrote {out} ({out.stat().st_size / 1024:.1f} KiB)")

if __name__ == "__main__":
    main()
