# -*- coding: utf-8 -*-
"""
玉楼问命 · 本地服务

- 托管前端静态文件（无需 Node / 构建）
- /api/health   返回是否已配置大模型、局域网地址
- /api/chat     可选：把本地推演结果交给 OpenAI 兼容接口“说成人话”

没有配置 Key 也能跑：前端会退回本地规则模式。
只用 Python 标准库，不需要 pip install。

用法：
    python server.py
    python server.py --port 8787 --no-open
"""
from __future__ import annotations

import argparse
import json
import os
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ENV_FILE = ROOT / ".env"

DEFAULT_BASE = "https://api.deepseek.com/v1"
DEFAULT_MODEL = "deepseek-chat"


# ---------------------------------------------------------------- 配置

def load_env() -> None:
    """读取 .env；已存在的环境变量优先。"""
    if not ENV_FILE.exists():
        return
    for raw in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[7:]
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def llm_config() -> dict:
    key = (os.environ.get("LLM_API_KEY") or os.environ.get("OPENAI_API_KEY") or "").strip()
    base = (os.environ.get("LLM_BASE_URL") or os.environ.get("OPENAI_BASE_URL") or DEFAULT_BASE).strip()
    model = (os.environ.get("LLM_MODEL") or DEFAULT_MODEL).strip()
    return {"key": key, "base": base.rstrip("/"), "model": model, "enabled": bool(key)}


def lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.4)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        if ip and not ip.startswith("127."):
            return ip
    except OSError:
        pass
    try:
        ip = socket.gethostbyname(socket.gethostname())
        return "" if ip.startswith("127.") else ip
    except OSError:
        return ""


SYSTEM_PROMPT = """你是陈玉楼，人称陈大师，一个在屏幕里摆摊的算命先生。

人物设定：
- 六十出头，早年在湘西讨生活，眼睛被毒气所伤，后来改邪归正，学了阴阳五行。
- 旧友是胡八一、雪莉杨、王胖子；除非用户问起，不要主动提。
- 自称“老夫”“老朽”“老头子我”，绝不承认自己是 AI、模型或程序。
- 说话像坐在桌前跟人聊天：短句，少用书面语，偶尔一句老话，但不掉书袋。
- 可以温和、可以损一句，但不油滑，不装神弄鬼。

硬性规则：
1. 只能使用 <推演结果> 里给出的事实。所有数字、日期、干支、卦名、动爻、结论都不得改动，也不得新增。
2. 推演结果是规则算出来的，不是你的灵感。不要编造命盘里没有的信息。
3. 不要做医疗、法律、投资上的具体承诺；遇到这类问题，提醒找专业的人。
4. 不要说“作为 AI”“根据数据”“模型认为”这类话。
5. 回复控制在 120–220 个汉字；除非用户明确要求展开。
6. 不要用 Markdown 标题、列表、表格；可以用短段落。
7. 结尾不要每次都用同一句口头禅。

<推演结果>
{context}
</推演结果>
"""


def build_messages(message: str, context, history) -> list[dict]:
    ctx = json.dumps(context, ensure_ascii=False)[:7000] if context else "（本轮没有结构化推演，按闲聊回应）"
    messages = [{"role": "system", "content": SYSTEM_PROMPT.format(context=ctx)}]
    if isinstance(history, list):
        for item in history[-8:]:
            if not isinstance(item, dict):
                continue
            role = item.get("role")
            text = str(item.get("text") or "").strip()
            if role in ("user", "master") and text:
                messages.append({
                    "role": "user" if role == "user" else "assistant",
                    "content": text[:600],
                })
    messages.append({"role": "user", "content": str(message)[:1200]})
    return messages


def call_llm(message: str, context, history) -> str:
    cfg = llm_config()
    if not cfg["enabled"]:
        raise RuntimeError("未配置 LLM_API_KEY")

    payload = {
        "model": cfg["model"],
        "messages": build_messages(message, context, history),
        "temperature": 0.75,
        "max_tokens": 700,
        "stream": False,
    }
    req = urllib.request.Request(
        f"{cfg['base']}/chat/completions",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {cfg['key']}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError("模型没有返回内容")
    content = (choices[0].get("message") or {}).get("content") or ""
    return content.strip()


# ---------------------------------------------------------------- HTTP

class Handler(SimpleHTTPRequestHandler):
    server_version = "Yulou/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    # 安静一点，只记录错误
    def log_message(self, fmt, *args):
        if args and str(args[0]).startswith("4"):
            super().log_message(fmt, *args)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def _origin_allowed(self) -> str | None:
        origin = self.headers.get("Origin")
        if not origin:
            return None
        if origin == "null":
            return origin
        for prefix in ("http://127.0.0.1", "http://localhost", f"http://{lan_ip()}"):
            if origin.startswith(prefix):
                return origin
        return None

    def _cors(self):
        origin = self._origin_allowed()
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, code: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.split("?")[0] == "/api/health":
            cfg = llm_config()
            self._json(200, {
                "ok": True,
                "llm": cfg["enabled"],
                "model": cfg["model"] if cfg["enabled"] else "",
                "base": cfg["base"] if cfg["enabled"] else "",
                "lan": lan_ip(),
                "port": self.server.server_address[1],
                "version": "1.0.0",
            })
            return
        super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] != "/api/chat":
            self._json(404, {"error": "not found"})
            return

        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0 or length > 120_000:
                raise ValueError("请求体为空或过大")
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            self._json(400, {"error": f"请求格式不对：{exc}"})
            return

        cfg = llm_config()
        if not cfg["enabled"]:
            self._json(503, {"error": "未配置大模型；可继续使用本地推演模式。"})
            return

        message = str(body.get("message") or "").strip()
        if not message:
            self._json(400, {"error": "message 不能为空"})
            return

        try:
            reply = call_llm(message, body.get("context"), body.get("history"))
            self._json(200, {"reply": reply, "model": cfg["model"]})
        except urllib.error.HTTPError as exc:
            detail = ""
            try:
                detail = exc.read().decode("utf-8")[:300]
            except Exception:  # noqa: BLE001
                pass
            print(f"[LLM] HTTP {exc.code} {detail}", file=sys.stderr)
            self._json(502, {"error": f"模型接口返回 {exc.code}"})
        except Exception as exc:  # noqa: BLE001
            print(f"[LLM] {type(exc).__name__}: {exc}", file=sys.stderr)
            self._json(502, {"error": "模型调用失败，已退回本地模式。"})


def main():
    parser = argparse.ArgumentParser(description="玉楼问命 · 本地服务")
    parser.add_argument("--host", default="0.0.0.0", help="监听地址，默认 0.0.0.0（手机可访问）")
    parser.add_argument("--port", type=int, default=8787, help="端口，默认 8787")
    parser.add_argument("--no-open", action="store_true", help="不要自动打开浏览器")
    args = parser.parse_args()

    load_env()
    cfg = llm_config()

    try:
        httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    except OSError as exc:
        print(f"端口 {args.port} 起不来：{exc}\n换一个端口试试：python server.py --port 8788", file=sys.stderr)
        return 1

    local = f"http://127.0.0.1:{args.port}/"
    ip = lan_ip()
    print()
    print("  玉楼问命 · 陈大师的摊")
    print("  ─────────────────────────────")
    print(f"  本机：{local}")
    if ip:
        print(f"  手机：http://{ip}:{args.port}/   （同一 WiFi）")
    if cfg["enabled"]:
        print(f"  大模型：{cfg['model']} @ {cfg['base']}")
    else:
        print("  大模型：未配置（.env 填 LLM_API_KEY 后重启即可；不影响本地推演）")
    print("  按 Ctrl+C 结束")
    print()

    if not args.no_open:
        threading.Thread(
            target=lambda: (time.sleep(0.8), webbrowser.open(local)),
            daemon=True,
        ).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  收摊。")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
