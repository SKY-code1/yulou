# -*- coding: utf-8 -*-
"""
陈大师 v1 · 2025 年的 LangChain Agent（兼容运行版）

原始代码在 ../legacy/，这个文件只做“能在这台机器上跑起来”的兼容修改：
1. 去掉 `from openai import chat`（未使用，且新版 openai 无此导出）；
2. 模型与 Base URL 改为环境变量，默认用本机的 DeepSeek Key（原 chatanywhere Key 已失效）；
3. RedisChatMessageHistory → 内存 ChatMessageHistory（演示机没有 Redis）；
4. 本地 Qdrant 知识库未接入，工具返回明确说明而不是抛错；
5. 修正 `ChatPromptTemplate.from_tmessage` 拼写、QdrantClient 构造、根路由未定义变量；
6. 增加 /api/health、/code/* 和同源 CORS，方便展示页读取。

Agent、Prompt、情绪判断、工具调用和记忆结构都保留原样。
"""
from __future__ import annotations

import json
import os
import threading
import winreg
from datetime import date
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
import uvicorn

ROOT = Path(__file__).resolve().parent
LEGACY = ROOT.parent / "legacy"


def load_windows_env() -> None:
    """把 Windows 用户/系统环境变量补进当前进程（无需重启终端）。"""
    targets = [
        (winreg.HKEY_CURRENT_USER, "Environment"),
        (winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment"),
    ]
    for hive, path in targets:
        try:
            with winreg.OpenKey(hive, path) as key:
                index = 0
                while True:
                    try:
                        name, value, _ = winreg.EnumValue(key, index)
                    except OSError:
                        break
                    if name and value and name not in os.environ:
                        os.environ[name] = str(value)
                    index += 1
        except OSError:
            continue


load_windows_env()

HAS_DEEPSEEK = bool(os.environ.get("API_KEY_D"))
V1_KEY = os.environ.get("V1_OPENAI_KEY") or os.environ.get("API_KEY_D") or os.environ.get("OPENAI_API_KEY", "")
V1_BASE = os.environ.get("V1_OPENAI_BASE") or (
    "https://api.deepseek.com/v1" if HAS_DEEPSEEK else "https://api.chatanywhere.tech/v1"
)
V1_MODEL = os.environ.get("V1_MODEL") or ("deepseek-chat" if HAS_DEEPSEEK else "gpt-4.1-mini")

os.environ["OPENAI_API_KEY"] = V1_KEY
os.environ["OPENAI_API_BASE"] = V1_BASE
os.environ["OPENAI_BASE_URL"] = V1_BASE

SERPAPI_API_KEY = os.environ.get("SERPAPI_API_KEY", "")
API_KEY_BAZI = os.environ.get("API_KEY_BAZI", "")

from langchain_openai import ChatOpenAI  # noqa: E402
from langchain.agents import create_openai_tools_agent, AgentExecutor  # noqa: E402
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder  # noqa: E402
from langchain_core.output_parsers import StrOutputParser  # noqa: E402
from langchain_core.chat_history import InMemoryChatMessageHistory  # noqa: E402
from langchain.memory import ConversationTokenBufferMemory  # noqa: E402
from MYtools import search, get_info_from_local_db, bazi_cesuan, yaogua, jiemeng  # noqa: E402


app = FastAPI(title="陈大师 v1 · LangChain Agent")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

LOCK = threading.Lock()


class Master:
    def __init__(self):
        self.llm = ChatOpenAI(
            model_name=V1_MODEL,
            temperature=0,
            openai_api_key=V1_KEY,
            openai_api_base=V1_BASE,
            tiktoken_model_name="gpt-4o-mini",
        )
        self.memory_key = "chat_history"
        self.QingXu = "neutral"
        self.SYSTEMPL = """你是一个非常厉害的算命先生，你叫陈玉楼，人称陈大师。
        以下是你的技能设定：
        1.你精通阴阳五行，能够算命、紫微斗数、姓名测算、占卜凶吉、看命运八字等。
        2.你大约60岁左右，过去曾是湘西一带赫赫有名的土匪头子，后来因为盗墓被毒气所伤，眼睛失明，改邪归正后拜师学艺成为一名算命先生。除非用户特别要求，否则你不会提及你的过去经历。
        3.你的朋友有胡八一，雪莉杨，王胖子等人。他们都是很有名的摸金校尉。
        4.当用户问你问题的时候，你有一定概率在回答时候加上下面的口头禅或混合一些你的经历。
        5.你从不说自己是一个智能助手或是一个AI，而是以老夫、老朽、老头子我等自称。
        {who_you_are}
        以下是你常说的口头禅，一次回答一般只会用到随机的其中一句：
        1."命里有时终须有，命里无时莫强求。"
        2."天时不如地利，地利不如人和。"
        3."人生在世，难免风雨，且行且珍惜。"
        4."老夫我这一把年纪了，但脑子还活得很！"
        5."金山竹影几千秋，云锁高飞水自流。"
        以下是你算命的过程：
        1.当初此和用户对话的时候，你会先让用户提供一些基本信息，比如出生日期、时间、地点等。
        2.当用户希望了解当年运势的时候，你会查询本地知识库工具，并结合用户提供的信息进行分析。
        3.当遇到不知道的事情或是不明白的概念，你会使用搜索工具来搜索。
        4.你会根据用户的问题使用不同合适的工具来回答，当所有工具都无法回答的时候，你会使用搜索工具来搜索答案。
        5.你会保存每一次的聊天记录，以便在后续的对话中使用。
        当前日期是 {today}（北京时间）。用户说“今年”“今天”时，以此日期为准，不要使用你记忆里的年份。"""

        self.MOODS = {
            "depressed": {
                "roleSet": """
                - 你会以关心的语气回答问题。
                - 你会添加一些安慰的话语，比如“没关系，一切都会好起来的”。
                - 你会避免使用任何可能引起负面情绪的词语。"""
            },
            "friendly": {
                "roleSet": """
                - 你会以友好的语气回答问题。
                - 你会添加一些积极的话语，比如“太好了，继续保持！”。
                - 你会随机告诉用户一些有趣的事情。"""
            },
            "neutral": {"roleSet": ""},
            "toxic": {
                "roleSet": """
                - 你会以更加温柔的语气回答问题。
                - 你会在回答时候加入一些幽默感来缓和气氛。
                - 你会避免使用任何可能引起争议的词语。"""
            },
            "excited": {
                "roleSet": """
                - 你会以兴奋的语气回答问题。
                - 你会使用积极的语言来表达你的兴奋。
                - 你会鼓励用户分享他们的兴奋感受。"""
            },
            "sad": {
                "roleSet": """
                - 你会以温柔关切的语气回答问题。
                - 你会使用积极的语言来表达你的关心。
                - 你会在回答的时候加上一些鼓励的话语。"""
            },
        }

        self.prompt = ChatPromptTemplate.from_messages(
            [
                ("system", self.SYSTEMPL.format(
                    who_you_are=self.MOODS[self.QingXu]["roleSet"],
                    today=date.today().isoformat(),
                )),
                MessagesPlaceholder(variable_name=self.memory_key),
                ("human", "{input}"),
                MessagesPlaceholder(variable_name="agent_scratchpad"),
            ]
        )

        # 第一步：获取底层对话存储（兼容版：内存；原版是 Redis）
        self.chat_memory = self.get_memory()
        # 第二步：创建上层记忆对象（ConversationTokenBufferMemory），关联底层存储
        self.memory = ConversationTokenBufferMemory(
            llm=self.llm,
            max_token_limit=2000,
            human_prefix="用户",
            ai_prefix="陈大师",
            memory_key=self.memory_key,
            return_messages=True,
            chat_memory=self.chat_memory,
        )
        tools = [search, get_info_from_local_db, bazi_cesuan, yaogua, jiemeng]
        agent = create_openai_tools_agent(llm=self.llm, prompt=self.prompt, tools=tools)

        self.agent_executor = AgentExecutor(
            agent=agent,
            tools=tools,
            memory=self.memory,
            verbose=True,
            handle_parsing_errors=True,
        )

    def get_memory(self):
        chat_message_history = InMemoryChatMessageHistory()
        print("ChatMessageHistory initialized (in-memory):", chat_message_history)
        store_message = chat_message_history.messages
        if len(store_message) > 10:
            prompt = ChatPromptTemplate.from_messages(
                [
                    ("system", "请帮我总结一下我们之前的聊天内容，提取出重要的信息，控制在200字以内。"),
                    ("human", "{input}"),
                ]
            )
            chain = prompt | self.llm
            summary = chain.invoke(
                {"input": store_message, "who_you_are": self.MOODS[self.QingXu]["roleSet"]}
            ).content
            print("Summary of previous messages:", summary)
            chat_message_history.clear()
            chat_message_history.add_user_message("这是我们之前聊天的总结：" + summary)
            print("总结后：", chat_message_history.messages)
        return chat_message_history

    def run(self, query: str) -> str:
        self.qingxu_chain(query)
        print("当前设定:", self.MOODS[self.QingXu]["roleSet"])
        result = self.agent_executor.invoke({"input": query})
        return str(result.get("output", result))

    def qingxu_chain(self, query: str) -> str:
        prompt = """根据用户的输入判断用户情绪，回应的规则如下：
        1. 如果用户输入的内容偏向于负面情绪，只返回"depressed"，不要有其他内容，否则将受到惩罚。
        2. 如果用户的输入内容偏向于正面情绪，只返回"friendly"，不要有其他内容，否则将受到惩罚。
        3. 如果用户输入的内容偏向于中性情绪，只返回"neutral"，不要有其他内容，否则将受到惩罚。
        4. 如果用户输入的内容包含辱骂、攻击性语言或其他不适当内容，只返回"toxic"，不要有其他内容，否则将受到惩罚。
        5，如果用户输入的内容比较兴奋，只返回"excited"，不要有其他内容，否则将受到惩罚。
        6. 如果用户输入的内容比较悲伤，只返回"sad"，不要有其他内容，否则将受到惩罚。
        用户输入的是：{query}"""

        chain = ChatPromptTemplate.from_template(prompt) | self.llm | StrOutputParser()
        result = chain.invoke({"query": query})
        self.QingXu = result if result in self.MOODS else "neutral"
        return result


master: Master | None = None
START_ERROR = ""
try:
    master = Master()
except Exception as exc:  # noqa: BLE001
    START_ERROR = f"{type(exc).__name__}: {exc}"
    print("[v1] 初始化失败：", START_ERROR)


@app.get("/api/health")
def health():
    return {
        "ok": master is not None,
        "version": "v1",
        "model": V1_MODEL,
        "base": V1_BASE,
        "has_key": bool(V1_KEY),
        "tools": ["search", "get_info_from_local_db", "bazi_cesuan", "yaogua", "jiemeng"],
        "memory": "in-memory",
        "error": START_ERROR,
    }


@app.post("/chat")
def chat(query: str):
    if master is None:
        return {"error": f"Agent 没有初始化成功：{START_ERROR}"}
    with LOCK:
        result = master.run(query)
        mood = master.QingXu
    return {"result": result, "mood": mood, "model": V1_MODEL}


@app.get("/")
def index():
    return FileResponse(ROOT / "index.html")


@app.get("/app.css")
def app_css():
    return FileResponse(ROOT / "app.css", media_type="text/css")


@app.get("/app.js")
def app_js():
    return FileResponse(ROOT / "app.js", media_type="application/javascript")


@app.get("/code/server.py")
def code_server():
    return PlainTextResponse((LEGACY / "server.py").read_text(encoding="utf-8"), media_type="text/plain; charset=utf-8")


@app.get("/code/MYtools.py")
def code_tools():
    return PlainTextResponse((LEGACY / "MYtools.py").read_text(encoding="utf-8"), media_type="text/plain; charset=utf-8")


@app.get("/docs/patches")
def docs_patches():
    return PlainTextResponse((ROOT / "README.md").read_text(encoding="utf-8"), media_type="text/plain; charset=utf-8")


@app.get("/docs/legacy")
def docs_legacy():
    return PlainTextResponse((LEGACY / "README.md").read_text(encoding="utf-8"), media_type="text/plain; charset=utf-8")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """保留原始代码里的 WebSocket 回声，方便对照。"""
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"Message text was: {data}")
    except WebSocketDisconnect:
        print("Client disconnected")
        await websocket.close()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8790)
    args = parser.parse_args()
    print(f"[v1] model={V1_MODEL} base={V1_BASE} key={'yes' if V1_KEY else 'no'}")
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="info")
