# -*- coding: utf-8 -*-
"""
Serve the dashboard at http://localhost:8000 .

Run: python product/serve.py            (or: python product/serve.py 8080)
     python product/serve.py --no-open  (do not open a browser tab)

Binds to 127.0.0.1 only. Rebuilds data.json automatically if it is missing or older
than anything in data/raw/ or data/meta/, so the page never shows numbers that no
longer match the source files. Text assets are gzip-compressed when the browser asks
for it, the same way the static host (Vercel) serves them.
"""

import gzip
import http.server
import socketserver
import subprocess
import sys
import threading
import webbrowser
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).resolve().parent
SITE = HERE / "site"
DATA = HERE.parent / "data"
ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
PORT = int(ARGS[0]) if ARGS else 8000
OPEN = "--no-open" not in sys.argv
COMPRESS = {".js", ".json", ".css", ".html", ".svg"}


def ensure_built() -> bool:
    data = SITE / "data.json"
    sources = [*DATA.glob("raw/*"), *DATA.glob("meta/*"), *(HERE.parent / "analysis").glob("*.py")]
    newest = max((p.stat().st_mtime for p in sources if p.is_file()), default=0)
    if data.exists() and data.stat().st_mtime >= newest:
        return True
    why = "chưa build" if not data.exists() else "dữ liệu gốc mới hơn data.json"
    print(f"[build] {why} — chạy build_site.py ...")
    r = subprocess.run([sys.executable, str(HERE / "build_site.py")],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    print(r.stdout.strip() or r.stderr.strip())
    if r.returncode != 0:
        print("[build] THẤT BẠI — không khởi động server.")
        return False
    return True


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".json": "application/json", ".woff2": "font/woff2"}
    _gz_cache: dict = {}

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(SITE), **kw)

    def send_head(self):
        path = Path(self.translate_path(self.path))
        if (path.suffix in COMPRESS and path.is_file()
                and "gzip" in self.headers.get("Accept-Encoding", "")):
            key = (path, path.stat().st_mtime)
            body = self._gz_cache.get(key)
            if body is None:
                body = gzip.compress(path.read_bytes(), 6)
                self._gz_cache[key] = body
            self.send_response(200)
            self.send_header("Content-Type", self.guess_type(str(path)))
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Vary", "Accept-Encoding")
            self.end_headers()
            from io import BytesIO
            return BytesIO(body)
        return super().send_head()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        if len(args) > 1 and str(args[1]).startswith(("4", "5")):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    if not ensure_built():
        sys.exit(1)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}/"
        print(f"\n  Dashboard đang chạy:  {url}\n  Dừng bằng Ctrl+C\n")
        if OPEN:
            threading.Timer(0.8, lambda: webbrowser.open(url)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nĐã dừng.")
