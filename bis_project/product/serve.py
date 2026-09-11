# -*- coding: utf-8 -*-
"""
Serve the dashboard at http://localhost:8000 .

Run: python product/serve.py            (or: python product/serve.py 8080)

Binds to 127.0.0.1 only — the site is for local viewing, not for exposing on the
network. Rebuilds data.json automatically if it is missing or older than the raw
data, so the page never shows numbers that no longer match data/raw/.
"""

import http.server
import socketserver
import subprocess
import sys
import threading
import webbrowser
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE = HERE / "site"
RAW = HERE.parent / "data" / "raw"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


def ensure_built() -> bool:
    data = SITE / "data.json"
    plotly = SITE / "vendor" / "plotly.min.js"
    newest_raw = max((p.stat().st_mtime for p in RAW.glob("*.csv")), default=0)

    if data.exists() and plotly.exists() and data.stat().st_mtime >= newest_raw:
        return True

    why = "chưa build" if not data.exists() else "data/raw mới hơn data.json"
    print(f"[build] {why} — chạy build_site.py ...")
    r = subprocess.run([sys.executable, str(HERE / "build_site.py")],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    print(r.stdout.strip() or r.stderr.strip())
    if r.returncode != 0:
        print("[build] THẤT BẠI — không khởi động server.")
        return False
    return True


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(SITE), **kw)

    def end_headers(self):
        # Always serve fresh files during development.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "200" not in (args[1] if len(args) > 1 else ""):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    if not ensure_built():
        sys.exit(1)

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}/"
        print(f"\n  Dashboard đang chạy:  {url}")
        print("  Dừng bằng Ctrl+C\n")
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nĐã dừng.")
