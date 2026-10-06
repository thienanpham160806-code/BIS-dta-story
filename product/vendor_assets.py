# -*- coding: utf-8 -*-
"""
Download the third-party files the site serves locally, so it runs fully offline.

    python product/vendor_assets.py

Writes (all committed; re-run only to upgrade):
    site/vendor/plotly-geo.min.js   plotly.js "geo" partial bundle (scatter, scattergeo,
                                    choropleth), same version as the installed plotly package
    site/vendor/world_110m.json     Plotly's Natural Earth topology for the world map
    site/fonts/*.woff2 + fonts.css  IBM Plex Sans 400/600 and Newsreader 400/600 (SIL OFL),
                                    subset by Google Fonts to exactly the characters the
                                    site uses (Vietnamese alphabet, ASCII, a few symbols)
"""

import re
import sys
from pathlib import Path

import requests

SITE = Path(__file__).resolve().parent / "site"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"}

VI = ("aàảãáạăằẳẵắặâầẩẫấậbcdđeèẻẽéẹêềểễếệfghiìỉĩíịjklmnoòỏõóọôồổỗốộơờởỡớợ"
      "pqrstuùủũúụưừửữứựvwxyỳỷỹýỵz")
CHARS = "".join(sorted(set(
    "".join(chr(c) for c in range(32, 127)) + VI + VI.upper()
    + " –—…“”‘’·×−≥≤▲▼◆✕→←↑↓↗ⓘ°%ρΔ±≈▶◐"
)))
FONTS = [("plexsans", "IBM Plex Sans", 400), ("plexsans", "IBM Plex Sans", 600),
         ("newsreader", "Newsreader", 400), ("newsreader", "Newsreader", 600)]


def plotly_version() -> str:
    import plotly.offline as pyo
    head = pyo.get_plotlyjs()[:400]
    return re.search(r"v(\d+\.\d+\.\d+)", head).group(1)


def main() -> None:
    (SITE / "vendor").mkdir(parents=True, exist_ok=True)
    ver = plotly_version()
    url = f"https://cdn.jsdelivr.net/npm/plotly.js-geo-dist-min@{ver}/plotly-geo.min.js"
    (SITE / "vendor" / "plotly-geo.min.js").write_bytes(requests.get(url, timeout=120).content)
    print(f"plotly-geo.min.js  v{ver}  <- {url}")

    topo = "https://cdn.plot.ly/un/world_110m.json"
    (SITE / "vendor" / "world_110m.json").write_bytes(requests.get(topo, timeout=120).content)
    print(f"world_110m.json    <- {topo}")

    fonts = SITE / "fonts"
    fonts.mkdir(exist_ok=True)
    for old in fonts.glob("*.woff2"):
        old.unlink()
    css = ["/* Vendored by product/vendor_assets.py from Google Fonts (SIL Open Font License),\n"
           "   subset to the characters the site uses so the page works offline. */"]
    for slug, family, weight in FONTS:
        q = {"family": f"{family}:wght@{weight}", "text": CHARS, "display": "swap"}
        face = requests.get("https://fonts.googleapis.com/css2", params=q, headers=UA, timeout=60).text
        src = re.search(r"url\((https://[^)]+)\)", face).group(1)
        name = f"{slug}-{weight}.woff2"
        (fonts / name).write_bytes(requests.get(src, timeout=60).content)
        css.append(f"@font-face {{\n  font-family: '{family}';\n  font-style: normal;\n  font-weight: {weight};\n"
                   f"  font-display: swap;\n  src: url(fonts/{name}) format('woff2');\n}}")
        print(f"fonts/{name:24s} {(fonts / name).stat().st_size / 1024:5.1f} KB")
    (SITE / "fonts.css").write_text("\n".join(css) + "\n", encoding="utf-8")


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    main()
