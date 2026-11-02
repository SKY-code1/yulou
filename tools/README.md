# 开发工具

这些脚本不参与运行，只在改数据或回归时用。

## `gen_data.py`

重新生成 `assets/js/data/solar-terms.js`、`hexagrams.js` 和 `tests/fixtures.json`。

依赖（只在生成时需要，运行时不需要）：

```powershell
pip install sxtwl lunar_python
```

还需要把 [liujuntao123/yijing](https://github.com/liujuntao123/yijing) 的
`src/data/yijing.json` 放到仓库上一级目录（`../yijing_raw.json`）。

## `cdp-test.mjs` / `cdp-shot.mjs` / `cdp-llm.mjs`

用 Chrome DevTools Protocol 控制本机 Edge，做端到端检查和截图，不依赖 puppeteer。

- 需要 Windows + Edge（路径写在脚本顶部）；
- 需要先运行 `python server.py`（默认 8787）；
- `cdp-llm.mjs` 需要另一个端口上的 mock 服务：`python tools/mock_llm.py 8899`，
  并用环境变量启动主服务：

```powershell
$env:LLM_API_KEY="test"; $env:LLM_BASE_URL="http://127.0.0.1:8899/v1"; $env:LLM_MODEL="mock"
python server.py --port 8788 --no-open
```

## `mock_llm.py`

一个最小的 OpenAI 兼容接口，只用来验证 `/api/chat` 链路，不产生真实模型调用。
