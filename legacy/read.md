# 服务器端：接口--》langchain——》openai、ollama
# 客户端：电报机器人、微信机器人等
# 接口：http、https、websocket

# 服务器：
1. 接口访问，python选型fastapi
2. /chat的接口，post请求
3. /add_url 从url学习知识
4. /add_pdfs,/add_texts 从pdf、txt中学习 

# 人性化
1. 用户输入→AI判断当前问题的情绪倾向→判断→反馈→agent判断
2. 工具调用：用户发起请求，agent判断使用哪个工具，带着相关工具请求参数，得到观察结果

### 截至目前：
1. api
2. agent框架
3. tools：搜索、查询、专业知识库
4. 记忆、长时记忆
5. 学习能力

## 从url学习，实现增强
1. 输入url
2. 地址的HTML文本
3. 向量化
4. 检索——相关文本块
5. LLM回答