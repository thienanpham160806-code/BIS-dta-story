# Sản phẩm cuối — web dashboard

Dashboard + câu chuyện dữ liệu + trang hướng dẫn, giao diện tiếng Việt, chạy **không cần internet**
(Plotly, bản đồ thế giới và font được nhúng sẵn).

## Chạy

```bash
python product/serve.py            # http://localhost:8000 (tự mở trình duyệt)
python product/serve.py 8080       # đổi cổng
python product/serve.py --no-open  # không mở trình duyệt
```

`serve.py` tự chạy `build_site.py` khi `data.json` chưa có hoặc cũ hơn `data/raw/`, `data/meta/` hay
`analysis/`. Không mở `site/index.html` trực tiếp bằng `file://` — trình duyệt chặn `fetch()`.

## Số liệu lấy từ đâu

Không có con số nào gõ tay. `build_site.py` gọi `analysis.core.run_all()` — đúng hàm notebook dùng — rồi ghi:

- `site/data.json` (~138 KB): bảng kết quả + chuỗi độ lệch DSR, đủ cho màn hình đầu.
- `site/data-series.json` (~303 KB): chuỗi mức DSR, tín dụng/GDP, lãi suất, NPL — tải sau khi trang đã hiện.

Tiêu đề biểu đồ, thẻ KPI và mọi câu trong phần Câu chuyện được tính từ hai file này lúc chạy.

## Cấu trúc

```
product/
├── serve.py            # server 127.0.0.1, gzip, tự build khi dữ liệu đổi
├── build_site.py       # analysis.core -> site/data.json + site/data-series.json
├── vendor_assets.py    # tải plotly (bản geo), world_110m.json, font (đã subset)
├── DESIGN.md           # design system, hướng A "Biên tập"
├── design/screens/     # ảnh chụp 2 hướng thiết kế lúc đề xuất
└── site/
    ├── index.html      # khung trang
    ├── tokens.css      # design tokens (màu, chữ, khoảng cách, sáng/tối)
    ├── styles.css      # bố cục và thành phần
    ├── guide.json      # nội dung hướng dẫn, tour, thuật ngữ, FAQ (sửa/dịch ở đây)
    ├── js/             # main, state (URL, màu), charts, ui, story, guide, tour, util
    ├── vendor/         # plotly-geo.min.js, world_110m.json
    └── fonts/          # IBM Plex Sans, Newsreader (SIL OFL)
```

## Quy ước thiết kế

Xem [`DESIGN.md`](DESIGN.md). Tóm tắt: mặc định hiển thị **độ lệch so với trung bình 20 năm** của chính nước đó;
tiêu đề biểu đồ nói kết luận; mỗi đường có nhãn trực tiếp; 4 nước gốc giữ màu cố định, nước khác nhận màu theo
thứ tự trong link; quá 6 nước thì chuyển sang lưới biểu đồ nhỏ; thiếu dữ liệu là khoảng trống có ghi chú.

## Kiểm thử đã chạy

Playwright (Chromium headless): không lỗi JS; bộ lọc, link chia sẻ, tour, hộp "Cách đọc", ngăn kéo bộ lọc trên
màn hình 375px (không cuộn ngang), chế độ sáng/tối, điều khiển hoàn toàn bằng bàn phím.
Lighthouse 12.8 (máy chủ local, giới hạn mặc định cho mobile): trang chính Performance 92 (mobile) / 97 (desktop),
Accessibility 100, Best Practices 100.
