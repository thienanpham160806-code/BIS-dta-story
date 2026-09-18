@echo off
chcp 65001 > nul
echo ================================================================
echo   HỦY ĐĂNG KÝ TÁC VỤ CẬP NHẬT DỮ LIỆU TỰ ĐỘNG BIS
echo ================================================================

schtasks /delete /tn "BIS_Daily_Data_Update" /f

if %errorlevel% equ 0 (
    echo.
    echo [THÀNH CÔNG] Đã xóa tác vụ 'BIS_Daily_Data_Update' khỏi Windows Task Scheduler.
) else (
    echo.
    echo [THÔNG BÁO] Không tìm thấy tác vụ hoặc đã được xóa trước đó.
)

echo.
pause
