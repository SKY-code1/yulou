# 旧版：2025 年的 LangChain 实验

这是「玉楼问命」的第一版，写于 2025 年 6–9 月，学习 LangChain 时的练习。

## 它当时是什么

- FastAPI 起一个 `/chat` 接口；
- LangChain `create_openai_tools_agent` 做工具调用；
- 工具：SerpAPI 搜索、本地 Qdrant 知识库、八字排盘、每日摇卦、周公解梦；
- `RedisChatMessageHistory` 做长时记忆，超过 10 条让模型总结；
- 先判断用户情绪（depressed / friendly / neutral / toxic / excited / sad），再拼进 system prompt；
- 模型走 OpenAI 兼容接口（`api.chatanywhere.tech`）。

## 为什么现在跑不起来

```
$ python server.py
ModuleNotFoundError: No module named 'openai'
```

就算补齐依赖，还需要：

1. `OPENAI_API_KEY`、`SERPAPI_API_KEY`、`API_KEY_BAZI` 三个 Key；
2. 本机跑一个 Redis（`redis://localhost:6379/0`）；
3. `h:/WYB的文件/vscode/local_qdrant` 这个本地向量库还在；
4. 2025 年那套 `langchain 0.3.x` 依赖能装得上。

换一台电脑，这四件事任何一件不成立，它就打不开。这也是后来重做第二版的直接原因。

## 保留它的原因

它记录了起点：会调 API、会拼 prompt、会接工具，但**没有入口、没有失败处理、没有交付**。
第二版把这些补上了，这个目录只作为对照，不参与运行。

## 和第二版的关系

| | v1（本目录） | v2（仓库根目录） |
| --- | --- | --- |
| 入口 | 只有 `/chat` 接口 | 浏览器 + 手机扫码 |
| 运行 | Python + Redis + Qdrant + 3 个 Key | 静态页面，零依赖 |
| 推演 | 依赖模型自由发挥 | 本地规则先算，模型只负责措辞 |
| 记忆 | Redis | localStorage |
| 交付 | 无 | GitHub Pages + 本地一键启动 |
