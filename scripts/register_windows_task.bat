@echo off
chcp 65001 > nul
echo ================================================================
echo   ĐĂNG KÝ TÁC VỤ CẬP NHẬT DỮ LIỆU TỰ ĐỘNG BIS VÀO 09:00 SÁNG
echo ================================================================

set "ROOT=%~dp0.."
set "PYTHON_EXE=%ROOT%\.venv\Scripts\python.exe"

if not exist "%PYTHON_EXE%" (
    set "PYTHON_EXE=python"
)

set "SCRIPT=%ROOT%\scripts\daily_pipeline.py"

echo.
echo Đường dẫn Python : %PYTHON_EXE%
echo Đường dẫn Script : %SCRIPT%
echo.

schtasks /create /tn "BIS_Daily_Data_Update" /tr "\"%PYTHON_EXE%\" \"%SCRIPT%\" --now" /sc daily /st 09:00 /f

if %errorlevel% equ 0 (
    echo.
    echo [THÀNH CÔNG] Đã đăng ký tác vụ 'BIS_Daily_Data_Update' vào Windows Task Scheduler!
    echo Máy tính sẽ tự động chạy pipeline cập nhật dữ liệu vào đúng 09:00 sáng mỗi ngày.
) else (
    echo.
    echo [LƯU Ý] Nếu gặp lỗi quyền hạn, hãy nhấp chuột phải vào file này và chọn "Run as administrator".
)

echo.
pause
