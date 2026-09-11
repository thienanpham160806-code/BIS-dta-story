# Chủ đề 1: Độ trễ chính sách thắt chặt tiền tệ & "gánh nặng âm thầm" lên Hộ gia đình & Doanh nghiệp

**Repo:** <https://github.com/thienanpham160806-code/BIS-dta-story>
· **Khai báo sử dụng AI (mục 26):** [`DECLARATION_AI.md`](DECLARATION_AI.md)

## Tính thời sự
Sau chu kỳ tăng lãi suất toàn cầu để chống lạm phát (2022–2023), chi phí vốn duy trì ở mức
cao. Fed đã cắt lãi suất 6 lần liên tiếp (09/2024–12/2025, về 3.5–3.75%), nhưng đầu 2026 lạm
phát bật tăng lại (CPI ~4.2%, cao nhất 3 năm, do xung đột Trung Đông + thuế quan), khiến Fed
dừng cắt và đang cân nhắc TĂNG lại lãi suất — FOMC họp ngay 15–16/9/2026. Tại Đông Nam Á và
Đông Á, thị trường bất động sản gặp khó khăn, áp lực đảo nợ tăng cao — câu hỏi là khu vực tư
nhân đã kịp "hồi sức" sau đợt hiking đầu chưa, trước nguy cơ bị đánh úp vòng hai.

## Quốc gia so sánh
**Hàn Quốc, Thái Lan, Malaysia, Hong Kong SAR** — các nền kinh tế Châu Á có tỷ lệ nợ hộ
gia đình cao, đối chiếu bối cảnh với chu kỳ lãi suất Mỹ.

> Đã đổi Singapore → Hong Kong SAR: Singapore không nằm trong 32 nước có DSR của BIS, và MAS
> điều hành chính sách tiền tệ qua tỷ giá (S$NEER) chứ không đặt lãi suất chính sách theo
> kiểu thông thường — không khớp với 2/3 bộ dữ liệu bắt buộc của chủ đề. Hong Kong SAR có đủ
> DSR (PNFS) + tín dụng/GDP + lãi suất, và nợ hộ gia đình/GDP thuộc hàng cao nhất Châu Á.

**Giới hạn dữ liệu đã biết trước khi phân tích:** DSR breakdown Hộ gia đình/Doanh nghiệp
riêng chỉ có đủ ở **Hàn Quốc** (1/17 nước trong nhóm có đủ dữ liệu). Thái Lan, Malaysia, Hong
Kong chỉ có DSR **tổng khu vực tư nhân phi tài chính (PNFS)**. Đây là limitation cần khai báo
trong sản phẩm cuối, không phải lỗi xử lý dữ liệu.

## Bộ dữ liệu BIS dùng
1. **Debt service ratios** (`BIS,WS_DSR,1.0`) — DSR gốc + lãi của Hộ gia đình/Doanh nghiệp
2. **Credit to non-financial sector** (`BIS,WS_TC,2.0`) — tổng tín dụng tư nhân, % GDP
3. **Policy rates** (`BIS,WS_CBPOL,1.0`) — lãi suất chính sách các NHTW

## Kiểm tra chéo (Cross-check)
**NPL ratio** (tỷ lệ nợ xấu) từ **World Bank** (`FB.AST.NPER.ZS`) — xác nhận DSR tăng có đi
kèm nợ xấu gia tăng hay không.

## Rủi ro & tín hiệu cảnh báo
DSR tăng đột biến 12–18 tháng sau khi NHTW bắt đầu tăng lãi suất (độ trễ truyền dẫn chính sách).

## Yếu tố bất ngờ cần kiểm chứng (không kết luận trước)
Dư nợ tín dụng/GDP có xu hướng giảm nhẹ (do thắt chặt tín dụng), nhưng gánh nặng trả nợ thực
tế (DSR) lại lập đỉnh lịch sử do lãi suất neo cao.

## Cấu trúc thư mục
```
BIS-dta-story/
├── data/raw/                        # CSV gốc tải trực tiếp từ API, KHÔNG sửa tay
│   ├── dsr.csv                      # DSR 2016-Q1 → 2025-Q4 (cửa sổ phân tích)
│   ├── dsr_longrun.csv              # DSR 1999-Q1 → 2025-Q4, CHỈ để tính mốc 20 năm
│   ├── credit_gdp.csv               # Credit/GDP, có breakdown H/N/P cả 4 nước
│   ├── policy_rate.csv              # Lãi suất chính sách, có thêm US làm mốc Fed
│   └── npl_ratio_worldbank.csv      # NPL ratio (cross-check)
├── data/processed/                  # Bảng wide sau làm sạch (notebook tự sinh)
├── scripts/
│   └── fetch_data.py                # Gọi BIS SDMX v2 + World Bank, lưu raw
├── notebooks/
│   └── 01_analysis.ipynb            # Toàn bộ phân tích + 8 biểu đồ + câu chuyện
└── product/                         # Sản phẩm cuối — web chạy localhost
    ├── serve.py                     # python product/serve.py -> localhost:8000
    ├── build_site.py                # data/raw -> site/data.json (không gõ tay số nào)
    └── site/                        # index.html · styles.css · app.js · vendor/plotly.min.js
```

**Giai đoạn dữ liệu:** 01/01/2016 – 31/12/2025 cho mọi bộ. Ngoại lệ duy nhất là
`dsr_longrun.csv`, tải toàn bộ lịch sử (từ 1999-Q1) và **chỉ dùng để tính mức trung bình
20 năm 2006-Q1→2025-Q4** — mốc mà BIS khuyến nghị dùng khi so DSR, vì mức tuyệt đối
không so được giữa các nước. File này không tham gia vào bất kỳ phép tính nào khác.

## Bảng mô tả dữ liệu (mục 16 của đề — đã kiểm tra metadata thật từ CSV, không suy đoán)

Nguồn metadata: cột label trong chính file `data/raw/*.csv` (tải với `labels=both`),
đối chiếu codelist chính thức `stats.bis.org/api/v2/structure/codelist/BIS/...`.

| Bộ dữ liệu | Chỉ tiêu | Đối tượng (code → label thật) | Đơn vị | Tần suất | Ý nghĩa |
|---|---|---|---|---|---|
| `BIS,WS_DSR,1.0` | Debt service ratio (DSR) | `DSR_BORROWERS`: **H** = Households & NPISHs · **N** = Non-financial corporations · **P** = Private non-financial sector | `UNIT_MEASURE=367` → **Per cent** (`UNIT_MULT=0` → Units) | `FREQ=Q` → **Quý** | % thu nhập khả dụng phải dành để trả **gốc + lãi**. Đo gánh nặng dòng tiền thực tế, không phải quy mô nợ. |
| `BIS,WS_TC,2.0` | Credit to non-financial sector | `TC_BORROWERS`: **H / N / P** (cùng codelist `CL_TC_BORROWERS`) · `TC_LENDERS=A` → All sectors · `VALUATION=M` → Market value · `TC_ADJUST=A` → Adjusted for breaks | `UNIT_TYPE=770` → **Percentage of GDP** ✅ | `FREQ=Q` → **Quý** (`COLLECTION=E` → End of period) | Dư nợ tồn đọng so với GDP. Đo **quy mô đòn bẩy**, không đo chi phí phục vụ nợ. |
| `BIS,WS_CBPOL,1.0` | Central bank policy rate | `REF_AREA`: KR (Bank of Korea base rate) · TH (BoT 1-day repo) · MY (BNM overnight policy rate) · HK (HKMA official base rate) · **US (Fed target mid-point — mốc tham chiếu)** | `UNIT_MEASURE=368` → **Per cent per year** | `FREQ=M` → **Tháng** (End of period) | Biến chính sách — đầu vào gây ra độ trễ truyền dẫn. |
| WB `FB.AST.NPER.ZS` | Bank NPL to total gross loans | 4 nước, mức toàn hệ thống ngân hàng (không tách HGD/DN) | **% tổng dư nợ gộp** | **Năm** | Kiểm chứng: gánh nặng trả nợ tăng có biến thành vỡ nợ thật không. |

**Xác nhận coverage (2016-Q1 → 2025-Q4, chạy `fetch_data.py`):**

| Bộ | KR | TH | MY | HK | US |
|---|---|---|---|---|---|
| DSR | H, N, P — 40/40 quý, **0% thiếu** | chỉ **P** — 40/40 | chỉ **P** — 40/40 | chỉ **P** — 40/40 | — |
| Credit/GDP | H, N, P — 40/40 | H, N, P — 40/40 | H, N, P — 40/40 | H, N, P — 40/40 | — |
| Policy rate | 120/120 tháng | 120/120 | 120/120 | 120/120 | 120/120 |
| NPL (năm) | 8/10 — **thiếu 2024, 2025** | 9/10 — **thiếu 2025** | 10/10 | 10/10 | — |

> **Limitation đã xác nhận bằng dữ liệu thật (không phải lỗi xử lý):** DSR breakdown
> Hộ gia đình / Doanh nghiệp chỉ tồn tại ở **Hàn Quốc**. TH/MY/HK chỉ có DSR tổng PNFS.
> Bù lại, **credit/GDP có breakdown H/N đầy đủ ở cả 4 nước** → dùng làm proxy cho câu hỏi
> "ai vay", nhưng phải nhớ đó là **dư nợ**, không phải **gánh nặng trả nợ**.

> **Khoảng trống NPL:** Hàn Quốc 2024–2025 và Thái Lan 2025 chưa có số trong World Bank.
> **Không nội suy, không điền giá trị giả** — để trống và khai báo trên biểu đồ.

## Ghi chú kỹ thuật: endpoint BIS đã đổi (11/09/2026)
URL cũ dạng `https://data.bis.org/topics/{TOPIC}/...` trả về **HTTP 404 `{"detail":"Not Found"}`**
cho cả 3 bộ — đó là host của **giao diện web**, không phải API. Endpoint máy đọc được là
**BIS SDMX RESTful API v2**:

```
https://stats.bis.org/api/v2/data/dataflow/BIS/{FLOW_ID}/{VERSION}/{KEY}?format=csv&labels=both
```

Version dataflow đã kiểm tra lại trực tiếp và **không đổi**: `WS_DSR 1.0`, `WS_TC 2.0`,
`WS_CBPOL 1.0` — chỉ sai host. Tham số `include=code,label` (kiểu v1) không tồn tại ở v2,
thay bằng `labels=both`. Chi tiết ghi trong docstring của `scripts/fetch_data.py`.

## 3 mốc thời gian làm trục câu chuyện
- 🔺 03/2022 — Fed bắt đầu hiking
- 🔻 09/2024 → 12/2025 — Fed cắt 6 lần liên tiếp (giai đoạn "thở")
- ❓ 09/2026 (tuần này) — nguy cơ re-hike

## Kết quả chính (tóm tắt — chi tiết trong notebook)

**Trả lời câu hỏi lớn: CHƯA, và mức độ chênh nhau rất lớn giữa bốn nước.**

| | Còn vượt mốc 20 năm | Đã gỡ được | Lãi suất hiện tại |
|---|---|---|---|
| 🔴 Hong Kong | **+7.1pp** | 35% | 4.00% (neo theo Fed) |
| 🟠 Hàn Quốc — Doanh nghiệp | +1.5pp | 75% | 2.50% |
| 🟡 Hàn Quốc — Hộ gia đình | +0.2pp | 84% | 2.50% |
| 🟢 Malaysia | +0.2pp | (chưa từng vượt đáng kể) | 2.75% |
| 🟢 Thái Lan | **−0.4pp** | 100%+ | 1.25% |

**Ba chỗ dữ liệu KHÔNG ủng hộ giả thuyết ban đầu của đề cương** (đều là finding, không phải lỗi):

1. **Độ trễ dài hơn giả thuyết.** Giả thuyết 12–18 tháng chỉ đúng 1/6 chuỗi (hộ gia đình
   Hàn Quốc, 16 tháng). Trung vị quan sát được là **24.5 tháng**. Điều này làm rủi ro re-hike
   *nặng hơn*, không nhẹ đi: gánh nặng sẽ đổ xuống tận 2028.
2. **"Điều bất ngờ" chỉ đúng 2/4 nước.** Hong Kong (dư nợ −10.4pp / DSR +5.9pp) và Thái Lan
   khớp. Hàn Quốc thì **cả hai cùng tăng** — gánh nặng do vay thêm giữa lúc lãi suất lên,
   một cơ chế khác hẳn. Malaysia cả hai cùng giảm.
3. **Cross-check NPL bác bỏ liên hệ ở 3/4 nước.** Chỉ Hong Kong có nợ xấu tăng thật
   (0.88 → 1.56, +77%). Hàn Quốc gần như đứng yên, Thái Lan và Malaysia **giảm** — tương quan
   mức thậm chí âm (−0.58 và −0.46).

**Phát hiện ngoài đề cương:** chính sách tiền tệ độc lập là tấm khiên đo được bằng số.
Malaysia chỉ phải tăng 1.25pp và kết thúc chu kỳ với DSR gần như không đổi; Hong Kong
neo tỷ giá nên buộc phải tăng đúng +5.25pp như Fed và lĩnh trọn thiệt hại.

## Sản phẩm cuối — web dashboard chạy localhost

```bash
python product/serve.py        # mở http://localhost:8000
```

Một trang web hai phần, chạy offline hoàn toàn (plotly.js nhúng sẵn):

- **Bảng điều khiển** — lọc quốc gia / khoảng thời gian / nhóm người vay, 4 thẻ KPI,
  8 biểu đồ tương tác, bảng dữ liệu thô tải được CSV, bảng độ phủ dữ liệu, chế độ sáng–tối.
- **Câu chuyện dữ liệu** — bài đọc 9 phần theo cấu trúc mục 24 của đề, mỗi phần kèm biểu đồ.

**Không có con số nào gõ tay trong trang web.** `product/build_site.py` đọc `data/raw/`,
tính lại toàn bộ chỉ tiêu bằng đúng logic của notebook rồi sinh `site/data.json`; các số
trong phần Câu chuyện được chèn lúc chạy từ chính file đó. `serve.py` tự build lại nếu
`data/raw/` mới hơn, nên trang không bao giờ lệch với dữ liệu gốc.

Chi tiết cách chạy và ghi chú thiết kế: [`product/README.md`](product/README.md).

### Vì sao chọn dạng này

Câu chuyện có một mạch dẫn tuyến tính bắt buộc — phải hiểu "dư nợ ≠ gánh nặng trả nợ"
trước, mới thấy được nghịch lý Hong Kong — nên phần **Câu chuyện** cố định cả 4 nước và
kể theo đúng thứ tự đó, đồng thời nêu limitation (chỉ Hàn Quốc có breakdown) ngay tại chỗ
người đọc cần biết. Phần **Bảng điều khiển** đứng riêng cho ai muốn tự kiểm chứng số,
chứ không thay thế mạch kể. Đây là lý do chọn "bài báo dữ liệu + dashboard" thay vì
dashboard thuần: dashboard thuần rất dễ khiến người đọc so mức DSR tuyệt đối giữa các nước —
đúng cái sai phương pháp mà BIS cảnh báo.

## Hồ sơ nộp

| Hạng mục | Tệp | Mục của đề |
|---|---|---|
| Mã tải dữ liệu | [`scripts/fetch_data.py`](scripts/fetch_data.py) | — |
| Dữ liệu gốc (không sửa tay) | [`data/raw/`](data/raw/) | — |
| Phân tích + câu chuyện 9 bước | [`notebooks/01_analysis.ipynb`](notebooks/01_analysis.ipynb) | 24 |
| Bảng mô tả dữ liệu | README, mục bên trên | 16 |
| Sản phẩm cuối (web localhost) | [`product/`](product/) — `python product/serve.py` | — |
| **Khai báo sử dụng AI** | [**`DECLARATION_AI.md`**](DECLARATION_AI.md) | **26** |
| Checklist | README, mục bên dưới | 33 |

## Checklist trước khi nộp (rút từ đề, mục 33)
- [x] Đã chạy `fetch_data.py` thành công, có raw CSV cho cả 4 bộ (DSR, credit, policy, NPL)
      — URL BIS cũ trả 404, đã dò lại và chuyển sang SDMX API v2 (xem ghi chú kỹ thuật trên)
- [x] Đã đọc metadata (đơn vị, tần suất, người vay) — ghi vào bảng trên
- [x] Đã confirm DSR_BORROWERS code thật (H/N/P) từ cột label trong CSV + codelist BIS
- [x] Đã báo cáo % dữ liệu thiếu từng bộ từng nước, không fill bất kỳ giá trị nào
- [x] Đã kiểm tra chéo NPL vs DSR — kết quả **không khớp ở 3/4 nước**, đã ghi rõ là finding
- [x] Tín hiệu cảnh báo là gì? → độ trễ thật ~24.5 tháng, dài hơn giả thuyết 12–18 tháng
- [x] Điều bất ngờ là gì? → nghịch lý nợ giảm/gánh nặng tăng chỉ đúng 2/4 nước; và tấm khiên
      chính sách tiền tệ độc lập của Malaysia
- [x] Notebook chạy lại được từ đầu đến cuối (đã verify bằng `nbconvert --execute`, 0 lỗi)
- [x] Dựng sản phẩm cuối trong `product/` — web dashboard + bài báo dữ liệu,
      chạy bằng `python product/serve.py`, đã kiểm thử headless (0 lỗi JS)
- [x] Khai báo sử dụng AI (mục 26) — [`DECLARATION_AI.md`](DECLARATION_AI.md)
- [ ] **Điền họ tên + MSSV vào `DECLARATION_AI.md`** (đang để trống chỗ ký)
