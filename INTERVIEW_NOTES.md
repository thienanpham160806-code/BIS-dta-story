# Ghi chú phỏng vấn — Độ trễ từ lãi suất tới gánh nặng trả nợ

Tài liệu ôn để trình bày và trả lời câu hỏi về dự án. Mọi con số dưới đây lấy từ lần chạy dữ liệu
ngày 06/10/2026 (dữ liệu BIS đến quý I/2026). Nếu chạy lại với dữ liệu mới, xem lại số trong
`notebooks/01_analysis.ipynb` hoặc trên dashboard.

---

## 1. Dự án trả lời câu hỏi gì — nói trong 30 giây

> Khi ngân hàng trung ương bắt đầu tăng lãi suất, phải mất bao lâu thì gánh nặng trả nợ của khu vực tư nhân
> mới lên đỉnh? Tôi đo cho mọi nền kinh tế mà BIS có số liệu. Kết quả: trung vị **8 quý — khoảng hai năm** —
> trên 22 nền kinh tế đo được. Bốn nước tôi bắt đầu (Hàn Quốc, Thái Lan, Malaysia, Hong Kong) nằm đúng trong
> khoảng điển hình về thời gian; khác nhau ở độ lớn. Hong Kong hiện vẫn cao hơn mức bình thường của chính nó
> 7,6 điểm %.

---

## 2. Các khái niệm, giải thích bằng ví dụ đời thường

### DSR khác tín dụng/GDP ở đâu?

- **Tín dụng/GDP** = *nợ bao nhiêu* so với quy mô nền kinh tế. Đo **cục nợ**.
- **DSR** (tỷ lệ trả nợ) = *mỗi kỳ phải trích bao nhiêu phần trăm thu nhập để trả gốc + lãi*. Đo **dòng tiền**.

Ví dụ: hai gia đình cùng nợ 1 tỷ đồng. Gia đình A vay lãi 6%, gia đình B vay lãi 12%. Cục nợ như nhau
(tín dụng/GDP giống nhau), nhưng mỗi tháng B phải trả nhiều hơn hẳn (DSR cao hơn). Khi lãi suất tăng, nợ có thể
đứng yên hoặc giảm, mà khoản phải trả mỗi tháng vẫn tăng. Vì vậy câu hỏi "gánh nặng" phải nhìn DSR.

### Vì sao không so mức DSR tuyệt đối giữa các nước?

Mỗi nước đo thu nhập khác nhau, kỳ hạn vay phổ biến khác nhau (vay nhà 30 năm hay 10 năm), tỷ trọng doanh
nghiệp vay qua ngân hàng hay qua trái phiếu khác nhau. Nên DSR 34% ở Hong Kong và 13% ở Thái Lan **không** có
nghĩa người Hong Kong "nợ nặng gấp ba".

Ví dụ: so cân nặng của một vận động viên bóng rổ cao 2 m với một người cao 1,6 m thì vô nghĩa. Nhưng so mỗi
người với **cân nặng thường ngày của chính họ** thì biết ai đang tăng cân bất thường. Dự án làm đúng như vậy:
lấy **trung bình 80 quý gần nhất (20 năm)** của chính nước đó làm "cân nặng thường ngày", rồi đo **độ lệch**.
BIS cũng khuyến nghị cách này.

### Mốc "bắt đầu tăng lãi suất" được xác định thế nào?

Bằng một quy tắc cố định, áp dụng giống nhau cho mọi nước (để không ai chọn mốc theo cảm tính):

1. Trong khoảng 01/2021 – 12/2023, tìm mức lãi suất **thấp nhất** (đáy), lấy tháng **sớm nhất** chạm đáy.
2. Tháng **đầu tiên sau đó** lãi suất cao hơn đáy = **mốc tăng (lift-off)**.
3. Không có tháng nào như vậy → **"không có chu kỳ tăng"** → loại khỏi phân tích độ trễ.

Ví dụ: giống tìm ngày giá xăng bắt đầu tăng lại sau khi chạm đáy — không phải ngày giá cao nhất, mà là lần
nhích lên đầu tiên.

Kết quả: Trung Quốc và Nhật Bản không có chu kỳ tăng trong cửa sổ này; Singapore không có chuỗi lãi suất
chính sách. Thuật toán có kiểm thử với chuỗi giả biết trước đáp án (`tests/test_core.py`), gồm cả trường hợp
chỉ giảm, đi ngang, hay tăng sau năm 2023.

### Độ trễ được đo ra sao, và vì sao "±1 quý"?

Từ **quý chứa tháng lift-off** đến **quý DSR cao nhất** sau đó, đếm số quý. Lãi suất là số tháng nhưng DSR
là số quý, nên sai số tối đa khoảng một quý. Vì thế tôi báo kết quả bằng **số quý nguyên**, không viết
kiểu "24,5 tháng" — con số lẻ như vậy tạo cảm giác chính xác giả.

### Censoring (bị cắt cụt) là gì?

Nếu DSR cao nhất **đúng vào quý cuối cùng có số liệu**, thì ta không biết nó đã là đỉnh thật hay vẫn đang
lên. Độ trễ đo được chỉ là **cận dưới** ("ít nhất 15 quý").

Ví dụ: đo chiều cao một bạn 15 tuổi rồi kết luận "đây là chiều cao tối đa" là sai — bạn ấy có thể còn cao thêm.

Trong dữ liệu: **Brazil (≥ 20 quý)** và **Ấn Độ (≥ 15 quý)** bị cắt cụt. Tôi không tính hai chuỗi này vào
trung vị chính, nhưng kiểm tra lại: tính chúng như cận dưới, hoặc dùng phương pháp Kaplan–Meier (phương pháp
chuẩn cho dữ liệu bị cắt cụt), trung vị **vẫn là 8 quý**.

### "Không tăng" khác "không có chu kỳ tăng" thế nào?

- *Không có chu kỳ tăng*: lãi suất không tăng (Trung Quốc, Nhật Bản).
- *Không tăng*: lãi suất có tăng, nhưng DSR không vượt mức trước đó, hoặc cao nhất đúng quý bắt đầu rồi chỉ giảm
  — không có đỉnh truyền dẫn để đo. Gồm Đức, Tây Ban Nha, Pháp, Anh, Hà Lan và **Malaysia**.

### Vì sao các nước khu vực euro dùng chung lãi suất ECB?

Từ khi dùng đồng euro, các nước không còn ngân hàng trung ương tự đặt lãi suất; **ECB** đặt một lãi suất chung
cho cả khối. Nên với Đức, Pháp, Ý…, "lãi suất chính sách" là lãi suất ECB kể từ năm gia nhập. Danh sách thành
viên và năm gia nhập lấy tự động từ trang chính thức của ECB (không gõ tay): 11 nước sáng lập năm 1999,
Hy Lạp 2001, Croatia 2023… Trước năm gia nhập, dùng lãi suất quốc gia nếu BIS có.

Ví dụ: giống các chi nhánh của một chuỗi cửa hàng — giá do tổng công ty đặt, chi nhánh không tự đổi được.

Một chi tiết bắt được nhờ quy tắc này: **Croatia** "tăng" từ 0% lên 2,5% đúng tháng 01/2023 — đó là lúc đổi
sang lãi suất ECB, không phải một quyết định tăng lãi suất. Tôi thêm quy tắc loại trường hợp này, có kiểm thử.

### Hong Kong đặc biệt ở đâu?

Hong Kong **neo tỷ giá theo USD**: lãi suất cơ bản của HKMA đi theo lãi suất Mỹ. Dữ liệu cho thấy đúng như vậy:
Hong Kong và Fed cùng bắt đầu tăng tháng 03/2022 và cùng tăng tổng cộng **+5,25 điểm %**. Hong Kong không có
quyền chọn tăng ít hơn — và hiện vẫn là nơi DSR cao hơn mức bình thường nhiều nhất trong bốn nước.

---

## 3. Các con số cần nhớ

**Phạm vi dữ liệu:** 52 nền kinh tế + khu vực euro; **32** nền kinh tế có DSR, trong đó **17** có tách hộ gia
đình (H) / doanh nghiệp (N). DSR và tín dụng đến quý I/2026, lãi suất đến 08/2026, NPL đến 2025.

**Phân phối độ trễ (kết quả chính, khu vực tư nhân P):**

| | Số nền kinh tế đo được | Trung vị | Khoảng tứ phân vị | Ngắn nhất – dài nhất |
|---|---|---|---|---|
| Khu vực tư nhân (P) | 22 | **8 quý** | 6 – 11 quý | 1 – 17 quý |
| Hộ gia đình (H) | 10 | 5,5 quý | 5 – 7,75 quý | 3 – 13 quý |
| Doanh nghiệp (N) | 6 | 9,5 quý | 7,25 – 11,75 quý | 2 – 12 quý |

**Bốn nước gốc:**

| Nước | Bắt đầu tăng | Lãi suất tăng | Độ trễ | DSR tăng | Độ lệch so với 20 năm (Q1/2026) |
|---|---|---|---|---|---|
| Hong Kong | 03/2022 | +5,25 điểm % | 8 quý | +5,9 điểm % | **+7,6 điểm %** |
| Hàn Quốc | 08/2021 | +3,00 | 8 quý | +2,8 | +0,7 |
| Thái Lan | 08/2022 | +2,00 | 6 quý | +0,8 | −0,5 |
| Malaysia | 05/2022 | +1,25 | không tăng | — | +0,2 |

Hàn Quốc tách nhóm: doanh nghiệp đỉnh sau 8 quý (+7,8 điểm %), hộ gia đình sau 12 quý (+0,6 điểm %).

**Toàn cầu hiện nay:** 17/32 nền kinh tế vẫn có DSR cao hơn mức nền 20 năm; cao nhất Thổ Nhĩ Kỳ (+10,9),
Brazil (+10,6), Nga (+7,8), Hong Kong (+7,6).

**Liên quốc gia:** mức tăng lãi suất ↔ mức tăng DSR: r = 0,91 (n = 24), nhưng bỏ 4 chu kỳ tăng trên 10 điểm %
(Brazil, Hungary, Nga, Thổ Nhĩ Kỳ) thì r = 0,09, khoảng tin cậy 95% từ −0,37 đến 0,51. Mức tăng lãi suất ↔ độ trễ:
r = −0,03 (n = 22) — không có quan hệ rõ.

**Nợ xấu (NPL):** 30/32 nước có khoảng tin cậy của tương quan (biến động năm) chứa 0. Chỉ mang tính mô tả.

---

## 4. Câu hỏi interviewer có thể hỏi — và cách trả lời

**"Tại sao lại là 8 quý, trong khi bạn giả thuyết 12–18 tháng?"**
> Giả thuyết ban đầu là 4–6 quý. Dữ liệu cho trung vị 8 quý, khoảng giữa 6–11 quý. Lý do hợp lý: DSR tính trên
> **toàn bộ dư nợ**, không chỉ khoản vay mới; khoản vay lãi cố định chỉ đổi lãi khi đáo hạn hoặc tái định giá, nên
> chi phí ngấm dần. Tôi giữ kết quả như dữ liệu nói, không chỉnh giả thuyết cho khớp.

**"Chọn mốc tăng lãi suất như vậy có chủ quan không?"**
> Không, vì đó là một quy tắc cố định áp dụng y hệt cho mọi nước, viết trong `analysis/core.py` và có kiểm thử
> với chuỗi giả biết trước đáp án. Ai chạy lại cũng ra cùng mốc.

**"Nếu đỉnh DSR rơi vào quý cuối thì sao?"**
> Đó là chuỗi bị cắt cụt (Brazil, Ấn Độ). Tôi đánh dấu, vẽ chấm rỗng, không đưa vào trung vị chính, và kiểm tra
> lại bằng hai cách (coi như cận dưới, Kaplan–Meier) — trung vị vẫn 8 quý.

**"Sao không dùng hồi quy / mô hình VAR?"**
> Với khoảng 20–30 nước và mỗi nước một chu kỳ, mô hình phức tạp dễ cho kết quả đẹp nhưng không vững. Tôi chọn
> đo trực tiếp, minh bạch, rồi báo phân phối và khoảng tin cậy. Mọi tương quan tôi đều ghi rõ là mô tả.

**"r = 0,91 rất cao, vậy tăng lãi suất mạnh thì gánh nặng tăng mạnh đúng không?"**
> Chưa chắc. Hệ số đó chủ yếu do bốn nước lạm phát rất cao (tăng lãi suất trên 10 điểm %). Bỏ bốn nước đó, r chỉ
> còn 0,09 và khoảng tin cậy chứa 0. Tôi trình bày cả hai con số để người đọc không bị một hệ số đánh lừa.

**"Vì sao không so DSR của Hong Kong (34%) với Thái Lan (13%)?"**
> Vì mức tuyệt đối không so được giữa các nước (cách đo thu nhập, kỳ hạn vay khác nhau). Tôi so độ lệch so với
> trung bình 20 năm của chính từng nước — khuyến nghị của BIS.

**"Dữ liệu thiếu thì xử lý thế nào?"**
> Để trống. Không nội suy, không điền giá trị giả. Dashboard ghi rõ nước nào thiếu gì ngay dưới biểu đồ; bảng độ
> phủ cho biết tỷ lệ thiếu theo nước, bộ dữ liệu và giai đoạn. Ví dụ: World Bank chưa có NPL Hàn Quốc sau 2023.

**"Vì sao các nước euro có cùng đường lãi suất?"**
> Vì sau khi gia nhập euro, ECB đặt lãi suất chung. Năm gia nhập lấy từ trang của ECB. Croatia là trường hợp đặc
> biệt: bước nhảy tháng 01/2023 là đổi chế độ, không phải tăng lãi suất.

**"NPL không tăng theo DSR — vậy rủi ro có thật không?"**
> Gánh nặng trả nợ có thể bộc lộ qua cắt giảm chi tiêu trước khi thành nợ xấu; NPL lại là số năm, ít điểm và chậm
> công bố. Với 3–20 điểm năm mỗi nước, dữ liệu không đủ để khẳng định có hay không có liên hệ — tôi nói rõ như vậy.

**"Phần nào do AI làm, phần nào do bạn?"**
> Tôi khai báo đầy đủ trong `DECLARATION_AI.md`: AI viết phần lớn mã và chạy tính toán; tôi đặt toàn bộ yêu cầu
> phương pháp (độ lệch 20 năm, thuật toán mốc tăng, không nội suy, khoảng tin cậy…), chọn thiết kế, và chịu trách
> nhiệm kiểm tra mọi con số.

**"Dashboard có gì khác một biểu đồ thường?"**
> Tiêu đề mỗi biểu đồ nói thẳng kết luận và được tính từ dữ liệu; mặc định hiển thị độ lệch chứ không phải mức;
> bộ lọc nằm trên link để chia sẻ đúng góc nhìn; có trang hướng dẫn, tour, và mỗi biểu đồ có thẻ "Cách đọc" nêu cả
> điều *không* nên hiểu. Lighthouse: Accessibility 100, Performance 92 (mobile) trên trang chính.

---

## 5. Một câu kết

> Sau khi lãi suất tăng, gánh nặng trả nợ thường mất khoảng hai năm mới lên đỉnh — và ở những nơi không tự quyết
> được lãi suất như Hong Kong, gánh nặng đó vẫn chưa trở về mức bình thường.
