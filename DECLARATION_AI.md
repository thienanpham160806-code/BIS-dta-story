# Khai báo sử dụng công cụ AI

*(Mục 26 của đề bài — Đồ án "BIS Data: dự án dữ liệu mở fintech", Gói 1)*

| | |
|---|---|
| **Đề tài** | Chủ đề 1 — Độ trễ chính sách thắt chặt tiền tệ & "gánh nặng âm thầm" lên Hộ gia đình & Doanh nghiệp |
| **Sinh viên** | _(họ tên)_ — _(MSSV)_ |
| **Công cụ AI đã dùng** | Claude Opus 5 (Anthropic), qua giao diện dòng lệnh **Claude Code** |
| **Thời gian sử dụng** | 11/09/2026 |
| **Mức độ** | Có sử dụng AI, **khai báo đầy đủ dưới đây** |

---

## 1. AI đã hỗ trợ những gì

Khai báo trung thực: AI **viết phần lớn mã nguồn** trong `scripts/fetch_data.py`,
`notebooks/01_analysis.ipynb` và `product/`, đồng thời **chạy các phép tính** tạo ra
những con số trong sản phẩm. Cụ thể:

### 1.1. Gỡ lỗi endpoint BIS — ví dụ cụ thể, đây là phần AI đóng góp rõ nhất

Bản `fetch_data.py` ban đầu gọi URL dạng:

```
https://data.bis.org/topics/DSR/BIS,WS_DSR,1.0/Q.KR+TH+MY+HK.?startPeriod=2005&file_format=csv&format=long&include=code,label
```

Cả **3/3 bộ dữ liệu BIS đều trả về `HTTP 404 {"detail":"Not Found"}`** (World Bank thì chạy
bình thường). AI đã chẩn đoán theo trình tự sau, thay vì đoán mò:

1. **Gọi `curl` trực tiếp** để đọc *body* thật của phản hồi, chứ không chỉ dựa vào exception
   mà `pandas.read_csv` ném ra — nhờ đó thấy được `{"detail":"Not Found"}`, xác nhận server
   có trả lời chứ không phải lỗi mạng.
2. **Truy vấn danh sách dataflow thật** tại
   `https://stats.bis.org/api/v2/structure/dataflow/BIS/?format=sdmx-json` để kiểm tra giả
   thuyết "BIS đã đổi version dataflow". Kết quả: **version KHÔNG đổi** —
   `WS_DSR 1.0`, `WS_TC 2.0`, `WS_CBPOL 1.0` vẫn nguyên. Giả thuyết ban đầu sai;
   lỗi nằm ở **host**, không phải version.
3. **Xác định nguyên nhân thật:** `data.bis.org/topics/...` là host của **giao diện web**
   cho người dùng bấm chuột, không phải API máy đọc được. Endpoint đúng là BIS SDMX
   RESTful API v2:
   ```
   https://stats.bis.org/api/v2/data/dataflow/BIS/{FLOW_ID}/{VERSION}/{KEY}?format=csv&labels=both
   ```
4. **Sửa kéo theo 2 tham số** do khác biệt v1/v2: `include=code,label` không tồn tại ở v2,
   thay bằng `labels=both` (vẫn cho ra cả cột mã lẫn cột nhãn — bắt buộc, vì Bước 2 của đề
   yêu cầu đọc nhãn thật từ CSV); `file_format=csv&format=long` rút gọn thành `format=csv`.
5. **Lấy thứ tự dimension từ DSD thật** (`structure/datastructure/BIS/...`) thay vì suy đoán,
   nên key `Q.{CTY}.{BORROWERS}.A.M.770.A` của `WS_TC 2.0` đúng đủ 7 chiều ngay lần đầu.

Toàn bộ chẩn đoán này được ghi lại trong docstring đầu `scripts/fetch_data.py` để người chấm
kiểm chứng được, không giấu.

### 1.2. Các phần khác AI đã làm

| Việc | Tệp |
|---|---|
| Viết lại `fetch_data.py`: gọi API, báo cáo độ phủ từng chuỗi, in codelist BIS để đối chiếu | `scripts/fetch_data.py` |
| Viết toàn bộ mã làm sạch, pivot, tính mốc 20 năm, độ trễ, tương quan theo lag, cross-check | `notebooks/01_analysis.ipynb` |
| Vẽ 8 biểu đồ matplotlib và xử lý lỗi trình bày (nhãn chồng nhau, chú thích đè tiêu đề) | `notebooks/01_analysis.ipynb` |
| Soạn thảo bản nháp tiếng Việt phần "Câu chuyện" 9 bước, dựa trên số đã tính | `notebooks/01_analysis.ipynb` |
| Viết web dashboard chạy localhost (HTML/CSS/JS + Plotly) và bộ sinh dữ liệu cho web | `product/` |
| Chạy kiểm thử: `nbconvert --execute` cho notebook, Playwright headless cho web | — |

### 1.3. Điều AI **không** được phép làm trong đồ án này

- **Không bịa số liệu.** Mọi con số trong notebook và web đều được tính từ `data/raw/`
  tải bằng API. Không có giá trị nào gõ tay.
- **Không lấp dữ liệu thiếu.** NPL Hàn Quốc 2024–2025 và Thái Lan 2025 chưa có trong
  World Bank → để trống, hiện cảnh báo trên biểu đồ, không nội suy.
- **Không chế breakdown giả.** BIS chỉ công bố DSR tách Hộ gia đình/Doanh nghiệp cho
  **Hàn Quốc**; Thái Lan, Malaysia, Hong Kong chỉ có DSR tổng PNFS. Giới hạn này được
  khai báo ở README, trong notebook, và hiện thẳng trên giao diện web.
- **Không ép kết luận cho khớp đề cương.** Xem mục 2 dưới đây.

---

## 2. Phần sinh viên tự quyết định, tự phản biện và chịu trách nhiệm

### 2.1. Đặt chuẩn bằng chứng TRƯỚC khi có kết quả

Trước khi chạy bất kỳ phép tính nào, sinh viên đã ra yêu cầu bắt buộc cho toàn bộ quá trình:
*không bịa số liệu; không fill giá trị thiếu mà không báo cáo; mọi khẳng định kiểu "DSR tăng
vì lãi suất" phải có số liệu cụ thể đi kèm; và **nếu dữ liệu không ủng hộ giả thuyết ban đầu
của đề cương thì phải báo ngay — đó là finding quan trọng chứ không phải thất bại**.*

Chuẩn này được đặt ra khi chưa biết kết quả sẽ ra sao. Nó là lý do ba phát hiện ở mục 2.2
được giữ nguyên trong sản phẩm thay vì bị làm mờ đi.

### 2.2. Ba chỗ dữ liệu bác bỏ giả thuyết của đề cương — sinh viên chọn giữ, không chọn ép

Đề cương ban đầu (README, mục "Rủi ro & tín hiệu cảnh báo" và "Yếu tố bất ngờ") đặt ra ba
giả thuyết. Cả ba đều **không đứng vững hoàn toàn trước dữ liệu**. Sinh viên đã đọc kết quả,
xác nhận, và quyết định trình bày đúng như dữ liệu nói:

**(a) Giả thuyết "DSR tăng đột biến 12–18 tháng sau khi NHTW tăng lãi suất" — chỉ đúng 1/6 chuỗi.**

Đo từ lần tăng lãi suất đầu tiên của chính NHTW đó đến quý DSR đạt đỉnh:

| Chuỗi | Độ trễ thật | Khớp 12–18 tháng? |
|---|---|---|
| Hàn Quốc — Hộ gia đình | 16 tháng | **Có** |
| Thái Lan — PNFS | 19 tháng | Sát ngoài |
| Hong Kong — PNFS | 24 tháng | Không |
| Hàn Quốc — PNFS / Doanh nghiệp | 25 tháng | Không |
| Malaysia — PNFS | không có đỉnh do lãi suất | Không |

Trung vị thật: **24.5 tháng**. Sinh viên không sửa giả thuyết cho khớp, mà nêu rõ rằng độ trễ
dài hơn dự kiến làm rủi ro **nặng hơn** chứ không nhẹ đi: một đợt re-hike 09/2026 sẽ đổ gánh
nặng xuống tận 2028.

**(b) "Điều bất ngờ" (dư nợ/GDP giảm nhưng DSR lập đỉnh) — chỉ đúng 2/4 nước.**

Đúng ở Hong Kong (dư nợ −10.4pp, DSR +5.9pp) và Thái Lan. **Sai ở Hàn Quốc: cả hai cùng tăng**
(dư nợ +3.0pp, DSR +2.3pp) — tức gánh nặng đến từ vay thêm giữa lúc lãi suất lên, một cơ chế
khác hẳn. Sai ở Malaysia: cả hai cùng giảm. Sinh viên giữ nguyên hai trường hợp ngược chiều
thay vì lược bỏ, và chính chỗ "sai" này dẫn tới phát hiện nằm ngoài đề cương về vai trò của
chính sách tiền tệ độc lập.

**(c) Cross-check NPL — bác bỏ mối liên hệ ở 3/4 nước.**

| Nước | Δ DSR 2021→đỉnh | NPL 2021 → gần nhất | Tương quan mức |
|---|---|---|---|
| Hong Kong | +5.9pp | 0.88 → 1.56 (2025) | +0.54 |
| Hàn Quốc | +2.3pp | 0.23 → 0.26 (2023) | **−0.58** |
| Thái Lan | +0.6pp | 3.11 → 2.82 (2024) | **−0.46** |
| Malaysia | −0.4pp | 1.68 → 1.37 (2025) | −0.23 |

Chỉ Hong Kong cho thấy chuỗi truyền dẫn *lãi suất → gánh nặng trả nợ → vỡ nợ*. Sinh viên
quyết định trình bày kết quả không khớp này **như một finding**, kèm ba cách giải thích khả dĩ
và cảnh báo rõ về khoảng trống dữ liệu, thay vì bỏ phần cross-check ra khỏi báo cáo.

### 2.3. Các quyết định phương pháp do sinh viên chọn

- **Mốc so sánh DSR.** Đề yêu cầu so DSR với trung bình 20 năm, nhưng cửa sổ dữ liệu là
  2016–2025 (10 năm). Khi được đặt vấn đề, sinh viên chọn **tải riêng `data/raw/dsr_longrun.csv`
  (từ 1999-Q1) chỉ để tính mốc 2006-Q1→2025-Q4**, giữ `dsr.csv` đúng 2016–2025. Phương án này
  vừa đúng yêu cầu giai đoạn, vừa đúng khuyến nghị của BIS là **không so mức DSR tuyệt đối
  giữa các nước**, và minh bạch vì hai file tách bạch.
- **Phạm vi dữ liệu.** Sinh viên chốt: giữ đúng phạm vi đề cương (chỉ BIS + NPL World Bank),
  nhưng tận dụng tối đa trong phạm vi đó — nên breakdown Hộ gia đình/Doanh nghiệp của
  *dư nợ/GDP* (có đủ 4 nước) được dùng làm proxy cho câu hỏi "ai vay", kèm ghi chú rõ rằng
  nó đo **quy mô nợ**, không thay thế được DSR breakdown.
- **Đồng bộ tần suất.** Chọn hạ DSR xuống quý IV để khớp NPL năm, **không** nội suy NPL lên
  quý. Lý do ghi thẳng trong notebook: nội suy sẽ tạo 3 quan sát bịa mỗi năm rồi dùng chính
  chúng để tính tương quan, khiến hệ số đẹp lên một cách giả tạo. Đánh đổi (n giảm còn 10
  điểm/nước, mọi hệ số chỉ là mô tả) cũng được khai báo.
- **Hình thức sản phẩm cuối.** Chọn "bài báo dữ liệu + dashboard" thay vì dashboard thuần,
  vì dashboard thuần dễ khiến người đọc so mức DSR tuyệt đối giữa các nước — đúng cái sai
  phương pháp mà BIS cảnh báo.

### 2.4. Kiểm tra lại toàn bộ

Sinh viên đã rà soát lại pipeline, dữ liệu, notebook và web trước khi nộp, và chịu trách nhiệm
về mọi số liệu cũng như mọi kết luận trong sản phẩm.

---

## 3. Cam kết

1. Tôi đã khai báo đầy đủ và trung thực mức độ sử dụng công cụ AI trong đồ án này. Phần nào
   do AI viết hoặc tính toán, tôi ghi rõ ở mục 1; phần nào do tôi quyết định và chịu trách
   nhiệm, tôi ghi rõ ở mục 2. Tôi không nhận phần việc của AI thành phần việc của mình.

2. **Toàn bộ dữ liệu trong `data/raw/` là dữ liệu thật, tải trực tiếp từ API công khai —
   không mô phỏng, không giả lập, không gõ tay, không chỉnh sửa sau khi tải.** Nguồn:
   - BIS SDMX RESTful API v2 — `WS_DSR 1.0`, `WS_TC 2.0`, `WS_CBPOL 1.0`
     (`https://stats.bis.org/api/v2/data/dataflow/BIS/...`)
   - World Bank Indicators API — `FB.AST.NPER.ZS`
     (`https://api.worldbank.org/v2/country/KOR;THA;MYS;HKG/indicator/FB.AST.NPER.ZS`)

   Người chấm có thể kiểm chứng bằng cách chạy lại `python scripts/fetch_data.py` và đối chiếu
   với các file trong `data/raw/`. Script in ra URL đầy đủ, số dòng, và bảng độ phủ từng chuỗi.

3. Những giới hạn của dữ liệu được khai báo thay vì che giấu: DSR breakdown Hộ gia đình/Doanh
   nghiệp chỉ có ở Hàn Quốc; NPL thiếu Hàn Quốc 2024–2025 và Thái Lan 2025; mọi hệ số tương
   quan trong bài chỉ có giá trị mô tả do số quan sát hạn chế.

4. Tôi sẵn sàng trình bày và bảo vệ mọi con số, mọi lựa chọn phương pháp và mọi kết luận trong
   đồ án này khi được hỏi.

<br>

**Ngày 11 tháng 09 năm 2026**

Sinh viên ký tên

<br><br>

_____________________
_(họ tên)_
