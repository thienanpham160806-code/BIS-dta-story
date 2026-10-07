# Design system — Dashboard độ trễ truyền dẫn lãi suất → DSR

> **Đã chọn: hướng A — Biên tập** (06/10/2026). Token nằm trong [`site/tokens.css`](site/tokens.css).
> Ảnh chụp hai hướng lúc đề xuất (dữ liệu thật) được giữ lại ở [`design/screens/`](design/screens/) để đối chiếu.
> Gán màu nước: ghim 4 nước gốc + gán theo thứ tự trong URL (xem mục "Màu dữ liệu").

Đề xuất được dựng bằng skill **ui-ux-pro-max** (truy vấn: *financial data dashboard, central bank,
macroeconomic analytics, editorial*), rồi lọc lại theo định hướng "dữ liệu là nhân vật chính":

| Skill gợi ý | Dùng hay bỏ | Lý do |
|---|---|---|
| Style **Data-Dense Dashboard** (BI/Analytics, WCAG AA) | Dùng — lưới 12 cột, hàng KPI, bộ lọc cố định | Đúng loại sản phẩm |
| Style **Swiss Modernism 2.0** (WCAG AAA) | Dùng cho hướng B | Lưới chặt, một màu nhấn, không trang trí |
| Typography **News Editorial** (Newsreader + sans) | Dùng cho hướng A, thay Roboto bằng IBM Plex Sans | Tiêu đề kiểu báo, chữ UI rõ, có tiếng Việt |
| Typography **Financial Trust** (IBM Plex Sans) | Dùng cho cả hai | Có bộ ký tự tiếng Việt, số rõ |
| Màu **Banking / Analytics** (navy + neutral) | Dùng làm màu nhấn | Trung tính, không cạnh tranh với màu dữ liệu |
| Style **Dark Mode (OLED)**, font Fira Code cho tiêu đề | Bỏ | Mặc định tối và tiêu đề monospace hợp sản phẩm kỹ thuật hơn là bài báo dữ liệu |
| Pattern "AI Personalization Landing" | Bỏ | Đây là dashboard, không phải landing page |

## Nguyên tắc

1. **Số là nhân vật chính.** Không glassmorphism, không gradient nền, không hiệu ứng trên vùng dữ liệu.
2. **Tiêu đề biểu đồ nói kết luận** ("Hong Kong vẫn cao hơn mức nền 20 năm 7,6 điểm %"), sinh từ dữ liệu lúc chạy.
   Dòng phụ nói *đo cái gì*; chân biểu đồ ghi *nguồn + đơn vị*.
3. **Không so mức DSR tuyệt đối giữa các nước** — mặc định hiển thị độ lệch so với mốc 20 năm của chính nước đó.
4. **Màu không bao giờ là kênh duy nhất:** mỗi đường có nhãn trực tiếp ở đầu phải; bản đồ có tooltip + bảng;
   chuỗi bị cắt cụt dùng chấm rỗng (hình dạng), không chỉ đổi màu.
5. **Chuyển động chỉ cho chuyển cảnh**, 150–220 ms, tắt hoàn toàn khi `prefers-reduced-motion: reduce`.

## Hai hướng thiết kế

| | **A — Biên tập (báo chí tài chính)** | **B — Thể chế (bảng số liệu)** |
|---|---|---|
| Cảm giác | Bài báo dữ liệu: giấy ấm, tiêu đề serif, đường kẻ mảnh | Báo cáo định chế: lạnh, gọn, dạng thẻ |
| Tiêu đề | Newsreader 400/600 | IBM Plex Sans 600 |
| Chữ UI / số | IBM Plex Sans, số `tabular-nums` | IBM Plex Sans; số KPI IBM Plex Mono |
| Nền / bề mặt (sáng) | `#f7f4ee` / `#fcfbf8` | `#f3f5f8` / `#ffffff` |
| Nền / bề mặt (tối) | `#141310` / `#1b1a17` | `#0b1220` / `#111827` |
| Màu nhấn | xanh mực `#1f4e8c` (tối `#8fb3e6`) | navy `#1e3a8a` (tối `#93b4f5`) |
| Khối biểu đồ | Không khung, kẻ đậm 3px phía trên (kiểu báo) | Thẻ bo 12px, đổ bóng rất nhẹ |
| Bo góc | 2 / 3 / 4px | 6 / 8 / 12px |
| Đổ bóng | Không (chỉ dùng cho ngăn kéo/tour) | `0 1px 2px` + `0 1px 3px`, alpha 6–8% |
| Bộ lọc (desktop) | Thanh ngang dính trên cùng | Cột trái cố định 272px |
| Bộ lọc (375px) | Thu thành nút "Bộ lọc · …" mở ngăn kéo | như A |

Độ tương phản chữ (WCAG, đã tính): tối thiểu **4,8:1** (A sáng), 5,9:1 (A tối), 5,8:1 (B sáng), 6,7:1 (B tối) —
mọi cặp chữ/nền đạt AA.

## Phần dùng chung

**Khoảng cách** (bội số 4): 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 px.
**Cỡ chữ**: 12 · 13,5 · 16 (thân) · 19 · 23 · 28 · 34 px; KPI 32px; dòng 1,55 cho thân bài.
**Z-index**: sticky 10 · ngăn kéo 30 · tour 40 · thông báo 50.
**Font** được nhúng sẵn (woff2, có subset tiếng Việt) trong `site/fonts/` — chạy offline.

### Màu dữ liệu

- **Phân loại (nhận diện nước)** — 8 màu đã kiểm định bằng `validate_palette.js` của skill dataviz trên cả hai nền
  sáng/tối của hai hướng: đạt dải sáng, ngưỡng sắc độ, tách biệt cho người mù màu (ΔE kề nhau ≥ 9,1 sáng / 8,4 tối)
  và ngưỡng thị giác thường (≥ 19,3). Ba màu có tương phản < 3:1 trên nền sáng → bắt buộc nhãn trực tiếp (đã có).
  - Ô 1–4 **cố định** cho bốn nước gốc: Hàn Quốc, Thái Lan, Malaysia, Hong Kong.
  - Nước khác nhận ô trống thấp nhất **theo thứ tự trong URL** và giữ màu đó ở mọi biểu đồ khi còn được chọn;
    bỏ chọn một nước không làm đổi màu các nước còn lại. Cùng một link luôn cho cùng một bộ màu.
  - Hơn 8 đường → tự chuyển sang **small multiples** (không sinh màu thứ 9).
- **Phân kỳ (độ lệch DSR)** — đỏ = cao hơn mốc nền, xanh = thấp hơn, xám trung tính = 0 (họ RdBu, an toàn cho
  mù màu đỏ–lục). Nền tối dùng các bậc riêng, cực trị sáng hơn để nổi trên nền tối.
- **Không có dữ liệu** — xám đất `--map-nodata`, luôn kèm chú thích "xám = không có số liệu".

### Plotly

Một hàm `plotTemplate()` duy nhất đọc biến CSS và trả về layout dùng chung (font, lưới, trục, tooltip); mọi biểu
đồ gọi hàm này, không định dạng lẻ. Khi đổi sáng/tối, toàn bộ biểu đồ được vẽ lại với template mới.
Bản Plotly dùng: **plotly.js geo dist v4.0.0** (cùng phiên bản với gói Python đã cài; gồm `scatter`, `scattergeo`,
`choropleth`) — 1,4 MB thay vì 4,3 MB của bản đầy đủ. Cột/histogram được vẽ dạng dot plot / lollipop bằng `scatter`.
Bản đồ thế giới `world_110m.json` nhúng tại `site/vendor/`.

### Trạng thái

Đang tải: khung xám (skeleton) đúng kích thước biểu đồ · Trống: "Không có dữ liệu cho lựa chọn này" + gợi ý thao tác ·
Lỗi: thông báo + nút "Thử lại", không bao giờ để trắng trang.

### Tiêu chí nghiệm thu

Lighthouse Accessibility ≥ 90, Performance ≥ 85 · chữ đạt WCAG AA · điều khiển toàn bộ bằng bàn phím (focus ring
3px màu nhấn) · 375px không cuộn ngang · ảnh chụp desktop + mobile × sáng + tối trước khi merge.

## Lượt chỉnh giao diện thứ 2 (sau khi xem bản chạy thật)

- **Thanh bộ lọc một dòng** (≥ 1024px): chọn nước gói gọn thành một nút có chấm màu + tên; nhãn chỉ hiện trong
  ngăn kéo mobile, trên desktop mỗi điều khiển có `aria-label`/`title`.
- **Tiêu đề trang** 40px, `text-wrap: balance` (không còn chữ rớt dòng), hai dòng tối đa.
- **Hàng KPI** dùng số serif 46px, đơn vị nhỏ bên cạnh, ▲/▼ theo màu phân kỳ kèm chữ cho trình đọc màn hình.
- **Ba phần đánh số**: 01 Gánh nặng hiện tại · 02 Truyền dẫn từ lãi suất · 03 Bối cảnh và kiểm tra chéo.
- **Biểu đồ**: mốc tăng lãi suất là vòng tròn rỗng trên chính đường của nước đó (thay cho 4 vạch dọc 4 màu);
  chấm ở cuối mỗi đường; biểu đồ độ trễ chỉ ghi nhãn nước đang chọn; bản đồ cắt bớt vùng cực, thanh màu nằm ngang,
  đất "không có dữ liệu" nhạt hơn để nước có số liệu nổi lên.

## Lượt chỉnh thứ 3 — chiều sâu, chuyển động, hồ sơ nước

Theo yêu cầu "nhìn khô cứng quá", nới quy tắc "không đổ bóng" của hướng A, nhưng vẫn giữ: hiệu ứng không đặt lên
vùng số liệu đang đọc, và tắt hết khi `prefers-reduced-motion: reduce`.

- **Chiều sâu:** thẻ biểu đồ và thẻ KPI là bề mặt nổi (`--shadow-card`, bo `--radius-card` 12px), nhấc lên 3px khi rê
  chuột; thẻ KPI có dải màu 3px phía trên (KPI độ lệch dùng chính thang phân kỳ); nền có quầng sáng rất nhẹ (`--glow`);
  thanh lọc mờ kính (`backdrop-filter`) và có bóng khi trang đã cuộn (trên điện thoại dùng nền đặc, vì `backdrop-filter`
  làm ngăn kéo bộ lọc bên trong mất vị trí cố định).
- **Chuyển động:** thẻ và phần đánh số hiện dần khi cuộn tới (650ms, so le 70–90ms); số KPI đếm lên tới giá trị mới
  (900ms); biểu đồ vẽ từ trái sang phải lần đầu xuất hiện, các lần cập nhật sau chỉ mờ-rõ 380ms; nút có phản hồi khi bấm.
- **Hồ sơ nước:** bấm vào nước trên bản đồ, dòng trong bảng bản đồ, chấm trên biểu đồ độ trễ/liên quốc gia hoặc đường
  DSR → ngăn kéo bên phải (điện thoại: tấm trượt từ dưới lên) với độ lệch, mức DSR, độ trễ, mức đã gỡ, đường độ lệch từ
  2006, chu kỳ lãi suất, tín dụng/GDP, NPL, ghi chú chế độ tỷ giá, nút thêm/bỏ khỏi so sánh. Bàn phím: Enter trên dòng
  bảng để mở, Esc để đóng, focus được giữ trong ngăn kéo rồi trả về chỗ cũ.
- **Hiệu năng:** thư viện biểu đồ chỉ tải sau khi màn hình đầu đã vẽ xong; hình trong trang Câu chuyện vẽ khi cuộn tới.

