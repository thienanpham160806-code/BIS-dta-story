# Sản phẩm cuối — web dashboard chạy localhost

Bài báo dữ liệu + bảng điều khiển tương tác, chạy trên máy, **không cần internet**
(plotly.js được nhúng sẵn từ package `plotly` đã cài).

## Chạy

```bash
python product/serve.py
```

Trình duyệt tự mở ở <http://localhost:8000>. Dừng bằng `Ctrl+C`.
Muốn đổi cổng: `python product/serve.py 8080`.

> `serve.py` tự chạy `build_site.py` nếu `data.json` chưa có **hoặc** `data/raw/` mới hơn —
> nên trang không bao giờ hiển thị số cũ so với dữ liệu gốc.

**Đừng mở `site/index.html` bằng `file://`** — trình duyệt chặn `fetch("data.json")` theo
chính sách CORS. Phải qua `serve.py`.

## Hai phần

**① Bảng điều khiển** — lọc và khám phá:
- Bật/tắt từng quốc gia (màu mỗi nước cố định ở mọi biểu đồ)
- Đổi khoảng thời gian: toàn bộ 2016–2025 · chu kỳ 2021–2025 · từ 2023
- Đổi nhóm người vay cho dư nợ/GDP: tổng PNFS · hộ gia đình · doanh nghiệp
- Bật/tắt tô 3 giai đoạn chính sách; tách HGĐ/DN cho Hàn Quốc
- 4 thẻ KPI + 8 biểu đồ + bảng dữ liệu thô (tải CSV) + bảng độ phủ dữ liệu
- Nút ◐ đổi giao diện sáng/tối

**② Câu chuyện dữ liệu** — bài đọc 9 phần theo cấu trúc đề bài, mỗi phần có biểu đồ
riêng. Phần này **cố định hiển thị cả 4 nước**: nó là một mạch kể, không phải công cụ lọc.

## Số liệu lấy từ đâu

**Không có con số nào gõ tay trong trang web.** `build_site.py` đọc `data/raw/`, tính lại
toàn bộ chỉ tiêu bằng đúng logic của `notebooks/01_analysis.ipynb` (mốc 20 năm, độ trễ,
tương quan theo lag, kiểm định "điều bất ngờ", cross-check NPL, bảng điểm hồi phục) rồi
ghi ra `site/data.json`. Các con số trong phần Câu chuyện được chèn vào lúc chạy từ chính
file đó — sửa dữ liệu gốc, chạy lại, chữ và số tự khớp.

## Cấu trúc

```
product/
├── serve.py              # server localhost (chỉ bind 127.0.0.1) + tự build khi cần
├── build_site.py         # data/raw/ -> site/data.json + nhúng plotly.js
└── site/
    ├── index.html        # khung trang + toàn bộ nội dung câu chuyện
    ├── styles.css        # design tokens, có chế độ sáng/tối
    ├── app.js            # state, bộ lọc, 11 biểu đồ, bảng, xuất CSV
    ├── data.json         # (sinh tự động — không sửa tay)
    └── vendor/
        └── plotly.min.js # (sinh tự động, lấy từ package plotly đã cài)
```

## Ghi chú thiết kế

- **Không dùng biểu đồ hai trục y.** Chỗ cần so DSR với NPL (hai đơn vị khác nhau),
  cả hai chuỗi được quy về chỉ số 2016 = 100 để dùng chung một trục.
- **Mỗi nước một màu cố định**, không đổi khi lọc bớt nước — màu bám theo quốc gia,
  không bám theo thứ hạng.
- **Mọi đường đều có nhãn trực tiếp** ở đầu phải, tự đẩy nhau ra khi hai đường kết thúc
  quá gần. Bảng màu đã kiểm định độ phân biệt cho người mù màu.
- **Khoảng trống dữ liệu được vẽ là khoảng trống** — NPL Hàn Quốc 2024–2025 và Thái Lan 2025
  để hở, có cảnh báo đỏ ngay dưới biểu đồ. Không nội suy.
- **Vùng 2026** trên mọi biểu đồ là vùng rỗng có viền đứt, ghi rõ "chưa có dữ liệu".

## Kiểm thử

Đã chạy kiểm thử headless (Playwright + Chromium): không lỗi JS, không cảnh báo console,
11/11 biểu đồ render, bộ lọc và tab hoạt động, sáng/tối đúng, không tràn ngang ở bề rộng 400px.
