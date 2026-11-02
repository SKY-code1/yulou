# -*- coding: utf-8 -*-
"""开发用：假装是一个 OpenAI 兼容接口，用来验证 /api/chat 链路。"""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(length).decode("utf-8"))
        msgs = body.get("messages") or []
        context = ""
        for m in msgs:
            if m.get("role") == "system":
                context = m.get("content", "")
        reply = f"老夫看过了。{context[-80:]}" if context else "老夫看过了。"
        payload = {
            "id": "mock",
            "choices": [{"index": 0, "message": {"role": "assistant", "content": reply}, "finish_reason": "stop"}],
        }
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8899
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
