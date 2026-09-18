# -*- coding: utf-8 -*-
"""
Daily Data Pipeline Runner for BIS Data Project.

Coordinates the full ETL pipeline:
  1. Ingestion:      scripts/fetch_data.py (BIS SDMX v2 + World Bank APIs)
  2. Transformation: product/build_site.py (Clean, calculate metrics, export data.json)

Usage:
  python scripts/daily_pipeline.py --now          # Run immediately once
  python scripts/daily_pipeline.py --schedule     # Keep running, update daily at 09:00 AM
"""

import argparse
import datetime
import subprocess
import sys
import time
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
FETCH_SCRIPT = ROOT / "scripts" / "fetch_data.py"
BUILD_SCRIPT = ROOT / "product" / "build_site.py"
LOG_FILE = ROOT / "data" / "pipeline.log"


def log(msg: str) -> None:
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{now_str}] {msg}"
    print(line, flush=True)
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception as e:
        print(f"Không thể ghi log: {e}", file=sys.stderr)


def run_pipeline() -> bool:
    """Execute the full ETL pipeline."""
    log("=== BẮT ĐẦU PIPELINE CẬP NHẬT DỮ LIỆU ===")
    
    # Bước 1: Fetch data từ API
    log("1/2: Đang gọi API BIS & World Bank (fetch_data.py)...")
    t0 = time.time()
    res_fetch = subprocess.run(
        [sys.executable, str(FETCH_SCRIPT)],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if res_fetch.returncode != 0:
        log(f"LỖI khi fetch data (code {res_fetch.returncode}):\n{res_fetch.stderr.strip()}")
        return False
    log(f"1/2: Hoàn tất fetch data ({time.time() - t0:.1f}s).")

    # Bước 2: Build lại site data.json
    log("2/2: Đang tính toán metrics & cập nhật data.json (build_site.py)...")
    t1 = time.time()
    res_build = subprocess.run(
        [sys.executable, str(BUILD_SCRIPT)],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if res_build.returncode != 0:
        log(f"LỖI khi build site (code {res_build.returncode}):\n{res_build.stderr.strip()}")
        return False
    log(f"2/2: Hoàn tất build site ({time.time() - t1:.1f}s).")

    log("=== PIPELINE HOÀN THÀNH THÀNH CÔNG ===")
    return True


def seconds_until(target_hour: int = 9, target_minute: int = 0) -> float:
    """Tính số giây từ thời điểm hiện tại tới mốc giờ kế tiếp."""
    now = datetime.datetime.now()
    target = now.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0)
    if target <= now:
        target += datetime.timedelta(days=1)
    return (target - now).total_seconds()


def run_scheduler(target_hour: int = 9, target_minute: int = 0) -> None:
    """Chạy vòng lặp kiểm tra và kích hoạt pipeline vào 09:00 sáng hàng ngày."""
    log(f"Scheduler đã bật: Sẽ tự động chạy vào {target_hour:02d}:{target_minute:02d} mỗi sáng.")
    while True:
        wait_sec = seconds_until(target_hour, target_minute)
        next_run = datetime.datetime.now() + datetime.timedelta(seconds=wait_sec)
        log(f"Đang chờ {wait_sec / 3600:.2f} giờ. Lần chạy tiếp theo: {next_run.strftime('%Y-%m-%d %H:%M:%S')}")
        
        time.sleep(wait_sec)
        
        try:
            run_pipeline()
        except Exception as e:
            log(f"Lỗi ngoại lệ khi chạy scheduled pipeline: {e}")
        
        # Ngủ thêm 60 giây để tránh kích hoạt lặp lại trong cùng 1 phút
        time.sleep(60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="BIS Data Daily Update Pipeline")
    parser.add_argument("--now", action="store_true", help="Chạy ngay lập tức 1 lần")
    parser.add_argument("--schedule", action="store_true", help="Chạy chế độ lặp hẹn giờ hàng ngày lúc 09:00 sáng")
    parser.add_argument("--hour", type=int, default=9, help="Giờ hẹn chạy (mặc định: 9)")
    parser.add_argument("--minute", type=int, default=0, help="Phút hẹn chạy (mặc định: 0)")

    args = parser.parse_args()

    if args.schedule:
        run_scheduler(target_hour=args.hour, target_minute=args.minute)
    else:
        success = run_pipeline()
        sys.exit(0 if success else 1)
