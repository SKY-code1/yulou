@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist ".venv-v1\Scripts\python.exe" (
  echo.
  echo   第一次运行 v1：创建虚拟环境并安装依赖，约 2-3 分钟...
  echo.
  python -m venv .venv-v1
  if errorlevel 1 (
    echo   没找到 python，请先安装 Python 3.10+。
    pause
    exit /b 1
  )
  ".venv-v1\Scripts\python.exe" -m pip install -r "v1\requirements-v1.txt"
  if errorlevel 1 (
    echo   依赖安装失败，检查网络后重试。
    pause
    exit /b 1
  )
)

echo.
echo   陈大师 v1 · 2025 LangChain Agent
echo   打开 http://127.0.0.1:8790/
echo.
".venv-v1\Scripts\python.exe" "v1\server.py" --port 8790
pause
