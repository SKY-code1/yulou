from html import parser
from os import name
from unittest import result
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder, PromptTemplate
from langchain.schema import StrOutputParser
from langchain_core.output_parsers import JsonOutputParser
from openai import api_key
from regex import P
import requests

from langchain_community.utilities import SerpAPIWrapper
from langchain_community.vectorstores import Qdrant
from qdrant_client import QdrantClient
from langchain_openai import OpenAIEmbeddings
from langchain.tools import tool
from pydantic import BaseModel, Field
import ssl,json
from requests.adapters import HTTPAdapter
from urllib3.util import create_urllib3_context

import os
API_KEY_BAZI = os.environ.get("API_KEY_BAZI")
DEFAULT_MODEL = os.environ.get("V1_MODEL") or os.environ.get("OPENAI_MODEL") or "deepseek-chat"
DEFAULT_BASE = os.environ.get("V1_OPENAI_BASE") or os.environ.get("OPENAI_API_BASE") or "https://api.deepseek.com/v1"


@tool
def test() -> str:
    """这是一个测试工具，用于验证Agent调用功能"""
    return "测试成功✓"

@tool
def search(query: str) -> str:
    """只有需要了解实时信息或不知道的事情时候才会使用这个工具"""
    serp = SerpAPIWrapper()
    result = serp.run(query)
    print("搜索结果:", result)
    return result

@tool
def get_info_from_local_db(query: str) -> str:
    """只有回答本年运势的相关问题时会使用这个工具。"""
    # 兼容版：这台演示机上没有本地 Qdrant 向量库。
    # 直接说明，避免 Agent 拿到一个异常后开始编造文档内容。
    return (
        "本地知识库（Qdrant）在这台演示机上没有接入。"
        "请不要引用任何“本地文档”内容；只根据八字排盘与流年信息作答，"
        "并明确告诉用户这一部分暂时查不到。"
    )




#bazi tool
@tool
def bazi_cesuan(query: str) -> str:
    """只有做八字排盘的时候才会使用，需要输入用户姓名和出生年月日，如果缺少用户姓名和出生年月日时则不可用。"""
    url = f"https://api.yuanfenju.com/index.php/v1/Bazi/cesuan"

    prompt = ChatPromptTemplate.from_template(
        """
         你是一个参数提取助手，需从用户输入中提取以下参数：
         从用户输入中提取以下参数，返回纯JSON字典（无其他文字）：
        - api_key: 固定为 '{API_KEY_BAZI}'
        - name: 用户姓名
        - sex: 性别（男/女，默认空）
        - type: 日历类型（0=农历，1=公历，默认1）
        - year: 出生年份（数字）
        - month: 出生月份（数字）
        - day: 出生日（数字）
        - hours: 出生小时（数字）
        - minute: 出生分钟（数字，默认0）
        用户输入：{query}。
        """
    )
    parser  = JsonOutputParser()
    prompt = prompt.partial(format_instructions=parser.get_format_instructions(), API_KEY_BAZI=API_KEY_BAZI)
    chain = prompt | ChatOpenAI(model=DEFAULT_MODEL, temperature=0, openai_api_base=DEFAULT_BASE, tiktoken_model_name="gpt-4o-mini") | parser
    try:
        data = chain.invoke({"query": query})
        print("八字排盘参数类型:", type(data)) 
        print("八字排盘参数:", data)
    except Exception as e:
        return f"参数提取失败：{str(e)}"
    result = requests.post(url, data=data, timeout=40)
    if result.status_code == 200:
        print("====返回数据====")
        print(result.json())
        try:
            data_json = result.json()
            returnstring = f"八字排盘结果：{data_json['data']['bazi_info']['bazi']}"
            return returnstring
        except Exception as e:
            return "八字查询失败，可能是你忘记询问用户信息了。"
    else:
        return "抱歉，八字排盘时出现错误，请稍后再试。"

@tool
def yaogua():
    """只有在用户想要占卜、摇签、求卦时才会使用这个工具"""
    api_key = API_KEY_BAZI
    url = f"https://api.yuanfenju.com/index.php/v1/Zhanbu/meiri"
    result = requests.post(url, data={"api_key": api_key}, timeout=40)
    if result.status_code == 200:
        print("====返回数据====")
        print(result.json())
        returnstring = json.loads(result.text)
        #image = returnstring['data']['image']
        #print("签诗图片:", image)
        return json.dumps(returnstring, ensure_ascii=False)
    else:
        return "抱歉，摇卦时出现错误，请稍后再试。"


@tool
def jiemeng(query: str) -> str:
    """只有在用户想要解梦时才会使用这个工具，需要输入梦境内容，如果缺少用户梦境内容则不可用。"""
    api_key = API_KEY_BAZI
    url = f"https://api.yuanfenju.com/index.php/v1/Gongju/zhougong"
    LLM = ChatOpenAI(model=DEFAULT_MODEL, temperature=0, openai_api_base=DEFAULT_BASE, tiktoken_model_name="gpt-4o-mini")
    prompt = PromptTemplate.from_template(
        """
        根据内容提取1个关键词且不提取“梦境”字样关键词，只返回关键词,必须全部是中文，并且只能用","分隔，且不能有空格。内容为：{topic}。
        """
    )
    prompt_value = prompt.format(topic=query)
    keyword = LLM.invoke(prompt_value).content
    print("解梦关键词:", keyword)
    result = requests.post(url, data={"api_key": api_key, "title_zhougong": keyword}, timeout=40)
    if result.status_code == 200:
        print("====返回数据====")
        print(result.json())
        resultstring = json.loads(result.text)
        return json.dumps(resultstring, ensure_ascii=False)
    else:
        return "抱歉，解梦时出现错误，请稍后再试。"