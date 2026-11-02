@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo   玉楼问命 · 陈大师的摊
echo   -----------------------------
echo   正在起摊，请稍候...
echo.

python server.py --port 8787
if errorlevel 1 (
  echo.
  echo   启动失败：没找到 python，或者端口被占用。
  echo   可以试试：python server.py --port 8788
  echo.
)
pause
