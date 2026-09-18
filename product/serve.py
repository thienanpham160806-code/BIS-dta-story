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

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

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


import datetime
import time


def start_background_scheduler(target_hour=9, target_minute=0):
    """Luồng chạy ngầm tự động kích hoạt pipeline vào 09:00 sáng mỗi ngày."""
    pipeline_script = HERE.parent / "scripts" / "daily_pipeline.py"

    def loop():
        while True:
            now = datetime.datetime.now()
            target = now.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0)
            if target <= now:
                target += datetime.timedelta(days=1)
            wait_sec = (target - now).total_seconds()
            time.sleep(wait_sec)
            
            print(f"\n[pipeline] 09:00 — Tự động cập nhật dữ liệu hàng ngày...")
            try:
                res = subprocess.run([sys.executable, str(pipeline_script), "--now"],
                                     capture_output=True, text=True, encoding="utf-8", errors="replace")
                print(res.stdout.strip() or res.stderr.strip())
                print("[pipeline] Cập nhật thành công. Dữ liệu trên Dashboard đã sẵn sàng.\n")
            except Exception as e:
                print(f"[pipeline] Lỗi cập nhật tự động: {e}\n")
            time.sleep(60)

    t = threading.Thread(target=loop, daemon=True)
    t.start()
    
    # Tính thời gian lần chạy kế tiếp để in thông báo
    now = datetime.datetime.now()
    target = now.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0)
    if target <= now:
        target += datetime.timedelta(days=1)
    return target.strftime("%Y-%m-%d %H:%M:%S")


if __name__ == "__main__":
    if not ensure_built():
        sys.exit(1)

    next_run = start_background_scheduler(9, 0)

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}/"
        print(f"\n  Dashboard đang chạy:  {url}")
        print(f"  Tự động cập nhật:     09:00 hàng ngày (lần tới: {next_run})")
        print("  Dừng bằng Ctrl+C\n")
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nĐã dừng.")
