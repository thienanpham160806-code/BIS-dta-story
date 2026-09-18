# Hướng dẫn chạy đồ án Local (Dành cho thành viên nhóm)

Tài liệu này hướng dẫn chi tiết từng bước để các thành viên trong nhóm chỉ cần **pull code về là có thể chạy ngay trên máy tính cá nhân** (hỗ trợ cả **Windows**, **macOS** và **Linux**).

---

## 1. Yêu cầu môi trường chuẩn bị trước

- **Python**: Phiên bản `3.10` trở lên (khuyến nghị Python 3.11 hoặc 3.12). Tải tại [python.org](https://www.python.org/downloads/).
  - *Lưu ý khi cài trên Windows:* Nhớ tích chọn **"Add python.exe to PATH"**.
- **Git**: Đã cài đặt Git trên máy.
- **Trình duyệt web**: Chrome, Edge, Brave, Firefox, hoặc Safari.

---

## 2. Các bước cài đặt lần đầu (Chỉ làm 1 lần)

### Bước 1: Lấy code mới nhất về máy
Mở terminal (Command Prompt, PowerShell trên Windows hoặc Terminal trên macOS/Linux):

```bash
# Di chuyển vào thư mục chứa code
cd BIS-dta-story

# Kéo phiên bản mới nhất từ nhánh main
git pull origin main
```

### Bước 2: Tạo môi trường ảo (Virtual Environment)
Khuyến nghị tạo môi trường ảo riêng để không bị xung đột thư viện với các môn học khác:

- **Trên Windows:**
  ```cmd
  python -m venv .venv
  .venv\Scripts\activate
  ```
  *(Nếu dùng PowerShell bị báo lỗi script execution policy, chạy lệnh: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` rồi kích hoạt lại)*

- **Trên macOS / Linux:**
  ```bash
  python3 -m venv .venv
  source .venv/bin/activate
  ```

Khi kích hoạt thành công, bạn sẽ thấy tiền tố `(.venv)` xuất hiện ở đầu dòng lệnh trong terminal.

### Bước 3: Cài đặt các thư viện cần thiết
Chạy lệnh cài đặt toàn bộ dependencies:

```bash
pip install -r requirements.txt
```

*(Các thư viện gồm: `pandas`, `requests`, `matplotlib`, `seaborn`, `plotly`, `jupyter`)*

---

## 3. Cách chạy sản phẩm Web (Interactive Dashboard & Story)

Đây là sản phẩm chính của đồ án, gồm Bảng điều khiển tương tác (Dashboard) và Câu chuyện dữ liệu 9 phần (Data Story).

### Cách 1: Chạy tự động (Khuyến nghị — Nhanh nhất)
Chỉ cần chạy 1 dòng lệnh duy nhất:

```bash
python product/serve.py
```

**Lệnh này sẽ tự động:**
1. Kiểm tra xem dữ liệu `data.json` đã có chưa (nếu chưa, sẽ tự động build từ dữ liệu gốc trong `data/raw/`).
2. Khởi chạy máy chủ nội bộ tại địa chỉ `http://localhost:8000/`.
3. Tự động bật trình duyệt web mặc định của bạn mở sẵn trang web.

Khi không dùng nữa, nhấn `Ctrl + C` trong terminal để tắt server.

---

### Cách 2: Chạy thủ công từng bước (Nếu muốn tùy biến cổng)
Nếu cổng 8000 trên máy bạn đang bị ứng dụng khác chiếm:

1. **Build lại dữ liệu web từ thư mục raw:**
   ```bash
   python product/build_site.py
   ```
2. **Khởi động server trên cổng khác (ví dụ cổng 8080):**
   ```bash
   python -m http.server 8080 --directory product/site
   ```
3. Mở trình duyệt và truy cập: `http://localhost:8080/`

---

## 4. Cách chạy và kiểm tra Notebook phân tích (`01_analysis.ipynb`)

Notebook chứa toàn bộ các phép tính thống kê, bảng tóm tắt và sinh ra 8 biểu đồ học thuật.

### Cách 1: Mở giao diện tương tác Jupyter
```bash
jupyter notebook notebooks/01_analysis.ipynb
```
Hoặc:
```bash
jupyter lab
```
Sau đó bạn có thể bấm **Run All Cells** để xem toàn bộ kết quả phân tích.

### Cách 2: Chạy kiểm tra tự động toàn bộ notebook từ Terminal (Không cần bật browser)
Để xác nhận toàn bộ notebook chạy trơn tru từ đầu đến cuối không lỗi:

```bash
python -m jupyter nbconvert --to notebook --execute notebooks/01_analysis.ipynb --inplace
```

---

## 5. Cách tải lại dữ liệu mới từ API (Tùy chọn)

Dữ liệu thô từ BIS và World Bank đã được lưu sẵn trong thư mục `data/raw/`. Bạn **không cần** chạy lại bước này trừ khi muốn cập nhật số liệu mới nhất từ máy chủ BIS:

```bash
python scripts/fetch_data.py
```

Sau khi tải xong, hãy chạy lại:
1. `python -m jupyter nbconvert --to notebook --execute notebooks/01_analysis.ipynb --inplace` (để cập nhật notebook)
2. `python product/build_site.py` (để cập nhật dữ liệu lên web)

---

## 6. Xử lý sự cố thường gặp (Troubleshooting)

| Vấn đề | Nguyên nhân | Cách khắc phục |
|---|---|---|
| `python: command not found` | Chưa cài Python hoặc chưa tích chọn Add to PATH | Cài lại Python và nhớ chọn tích **"Add python.exe to PATH"**. Trên macOS/Linux hãy thử gõ `python3`. |
| `Address already in use` hoặc `Port 8000 is busy` | Cổng 8000 đang có một server khác chạy ngầm | Chạy trên cổng khác: `python -m http.server 8080 --directory product/site` hoặc tìm tắt tiến trình cũ. |
| Lỗi font tiếng Việt trên terminal Windows | Terminal dùng bảng mã legacy `cp1252` | Gõ lệnh: `chcp 65001` trước khi chạy lệnh Python. |
| Mở web thấy biểu đồ trắng / không tải | Trình duyệt chặn file cục bộ | Hãy chắc chắn bạn mở qua máy chủ `http://localhost:8000/`, không click đúp trực tiếp mở file `index.html` dạng `file:///...`. |

---

## 7. Quy tắc làm việc nhóm trên Git

- Trước khi bắt đầu làm việc: `git pull origin main` để lấy code mới nhất.
- Tuyệt đối **không sửa tay** các con số trong `product/site/data.json` hoặc trong `data/raw/*.csv`.
- Mọi thay đổi về dữ liệu phải thông qua `fetch_data.py` -> `01_analysis.ipynb` -> `build_site.py`.
