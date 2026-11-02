# 陈大师 v1 · 2025 年的 LangChain Agent

这是「玉楼问命」的第一版，2025 年 6–9 月学习 LangChain 时写的。
原始文件完整保留在 [`../legacy/`](../legacy/)，这个目录只为了让它**能在这台机器上跑起来并展示**。

## 它是什么

一条完整的 Agent 链路，不是一个聊天壳：

```
用户输入
  → 情绪判断（depressed / friendly / neutral / toxic / excited / sad）
  → 情绪写进 system prompt
  → LangChain Agent 选择工具
  → 工具结果回填
  → 陈玉楼口吻回答
  → ConversationTokenBufferMemory 记住上下文
```

工具共 5 个：

| 工具 | 作用 | 依赖 |
| --- | --- | --- |
| `search` | 搜实时信息 | SerpAPI |
| `bazi_cesuan` | 八字排盘 | 元分居 API |
| `yaogua` | 每日摇卦 | 元分居 API |
| `jiemeng` | 周公解梦 | 元分居 API + 模型提关键词 |
| `get_info_from_local_db` | 本地知识库 | Qdrant（本机未接入） |

## 为什么需要兼容修改

原版在 2025 年的环境里能跑。换到这台机器后，有四个现实问题：

1. `chatanywhere` 的免费 Key 已失效（接口明确返回“老版本免费 ApiKey 已失效”）；
2. 这台机器没有 Redis，`RedisChatMessageHistory` 起不来；
3. `h:/WYB的文件/vscode/local_qdrant` 不存在；
4. 原依赖里 `langchain-core==0.2.43` 与 `langchain==0.3.27` 版本冲突，装不上。

所以 v1 目录做了 **6 处兼容修改**，Agent 本身没动：

| # | 文件 | 修改 |
| --- | --- | --- |
| 1 | `server.py` | 去掉未使用的 `from openai import chat`（新版 openai 无此导出） |
| 2 | `server.py` | 模型 / Base URL 改为环境变量；默认用本机 DeepSeek Key，模型 `deepseek-chat` |
| 3 | `server.py` | `RedisChatMessageHistory` → `InMemoryChatMessageHistory` |
| 4 | `server.py` | 修正 `ChatPromptTemplate.from_tmessage` 拼写、根路由未定义变量 |
| 5 | `MYtools.py` | 本地 Qdrant 工具改为明确说明，不再抛 `QdrantClient` 构造错误 |
| 6 | `MYtools.py` | 外部请求加 40s 超时；工具返回统一转成字符串；bazi 参数提取改用当前模型 |

另外给 system prompt 补了一行**当前日期**，否则模型会按训练数据里的年份回答“今年”。

原始 `legacy/server.py`、`legacy/MYtools.py` 没有改动，可以并排对照。

## 跑起来

需要 Python 3.10+。在仓库根目录：

```powershell
# 第一次：建虚拟环境并装依赖（约 2–3 分钟）
python -m venv .venv-v1
.venv-v1\Scripts\python.exe -m pip install -r v1\requirements-v1.txt

# 启动
.venv-v1\Scripts\python.exe v1\server.py --port 8790
```

或者双击根目录的 `start_v1.bat`，第一次会自动装依赖。

打开 <http://127.0.0.1:8790/>。

## Key 从哪来

服务启动时会从 **Windows 用户环境变量**里补 Key（不需要重启终端）：

| 变量 | 用途 |
| --- | --- |
| `API_KEY_D` | 默认模型 Key（本机是 DeepSeek） |
| `V1_OPENAI_KEY` | 可选，覆盖上面的 Key |
| `V1_OPENAI_BASE` | 可选，默认 `https://api.deepseek.com/v1` |
| `V1_MODEL` | 可选，默认 `deepseek-chat` |
| `SERPAPI_API_KEY` | 搜索工具 |
| `API_KEY_BAZI` | 八字 / 摇卦 / 解梦 |

想换回原来的 OpenAI 兼容服务：

```powershell
$env:V1_OPENAI_KEY="sk-..."
$env:V1_OPENAI_BASE="https://api.chatanywhere.tech/v1"
$env:V1_MODEL="gpt-4.1-mini"
python v1\server.py
```

Key 只从环境变量读，不写进仓库。

## 已知限制

- 本地知识库没接入：问“今年详细运势”时，Agent 会说明这一块查不到，只给八字与流年推断；
- 记忆只在进程内，重启就清空（原版是 Redis，可以持久化）；
- 模型换成了 DeepSeek，语气和 2025 年用 GPT-4.1-mini 时会有差异；
- 每次回答要 10–40 秒，取决于是否调用工具；页面上的 `xx.xs` 是真实耗时。

## 和 v2 的关系

v1 证明的是：**我会用代码把一个 Agent 配起来**——prompt、工具、情绪、记忆、外部 API。
v2 解决的是另一件事：**怎么让别人打开就能用**——零依赖前端、离线推演、手机扫码。

两个版本都在仓库里，没有谁替代谁。
