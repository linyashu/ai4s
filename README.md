# AI4S 每日进展看板

自动聚合 **AI for Science (AI4S)** 领域进展与 **AI 大模型测评**动态，每日生成静态看板网页，并沉淀为可查询的个人知识库。

## 功能总览

| 功能 | 说明 |
|---|---|
| 📊 **双看板** | `index.html`（AI4S 进展）+ `eval.html`（大模型测评），每日刷新 |
| 📈 **五大权威排行榜** | LMArena / Artificial Analysis / LiveBench / Open LLM Leaderboard / OpenCompass 司南，标签切换 |
| 🤖 **LLM 深度分析** | 抓取全文 → LLM 生成每日简报（非仅看标题） |
| 📚 **个人知识库** | 结构化数据 + 分析结果按快照存档，可查询/导出喂 LLM |
| 🔌 **MCP Server** | 供 Claude Code / opencode / codex 等客户端远程调用知识库 |
| ⏰ **定时刷新** | 每天 8:00 / 20:00（UTC+8）自动更新 |

## 信源

### AI4S 进展（四类）

| 类别 | 抓取方式 | 默认源 |
|---|---|---|
| arXiv 预印本 | [arXiv API](https://export.arxiv.org/api/query) | cs.AI / cs.LG / q-bio / cond-mat / physics.comp-ph |
| 期刊与机构博客 | RSS/Atom | Nature、Science、Nature Machine Intelligence、DeepMind |
| 中文科技媒体 | Google News RSS（中文） | AI4S、AI 新材料、AI 药物研发 等 |
| HuggingFace 社区 | HF API | 最近更新的模型 |

### 模型测评（排行榜 + 新闻）

- **排行榜**（标签切换）：LMArena Elo、Artificial Analysis Intelligence Index、LiveBench、Open LLM Leaderboard v2、OpenCompass 司南
- **新闻**：Epoch AI / MIT Tech Review / The Verge（英文）+ 量子位 / IT之家（中文）

> 所有信源可自定义，见 `config.yaml`。

## 工作流

```
信源抓取（arXiv/RSS/HF/排行榜）
      │
      ▼
粗选候选（标题+摘要，省 token）
      │
      ▼
全文抓取（Firecrawl 优先，Jina 兜底）
      │
      ▼
LLM 深度分析（基于全文）→ 结构化 Digest
      │
      ├──► 渲染看板   site/index.html, site/eval.html
      ├──► 导出数据   site/data.json, site/eval.json
      └──► 知识库存档 kb/ + archive/（30 天保留）
```

## 快速开始

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

cp .env.example .env        # 填入 LLM / Firecrawl key

# 仅聚合（不摘要、不分析全文）
.venv/bin/python main.py --no-digest

# 完整流程（抓取 + 全文 + LLM 分析 + 看板 + 知识库存档）
.venv/bin/python main.py
```

生成后打开 `site/index.html` 与 `site/eval.html` 查看两个看板。

## 环境变量（.env）

| 变量 | 必填 | 说明 |
|---|---|---|
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | ✅ | OpenAI 兼容接口（DeepSeek/OpenAI/vLLM） |
| `FIRECRAWL_API_KEY` | ✅ 推荐 | 真实浏览器渲染 SPA（如司南），优先使用 |
| `JINA_API_KEY` | 可选 | Jina Reader 兜底（Firecrawl 失败时） |
| `MCP_API_KEY` | 远程部署 | MCP Server Bearer 认证密钥 |

## 配置（config.yaml）

- **AI4S 信源**：`arxiv` / `rss` / `google_news` / `huggingface` 各列表
- **测评**：`eval.leaderboards`（启用哪些排行榜）、`eval.news_rss` / `cn_news_rss`（新闻源）
- **窗口**：`lookback_days`（AI4S）、`eval.lookback_days`（测评）
- **临时禁用信源**：`A4S_DISABLE=arxiv,rss python main.py`

## 个人知识库

每次运行自动存档：

```
kb/
  ai4s/YYYYMMDD-HHMM.json   # AI4S 抓取 + LLM 分析
  eval/YYYYMMDD-HHMM.json   # 测评抓取 + 分析
  index.json                # 快照索引
archive/
  YYYYMMDD-HHMM/            # 看板 HTML 快照（30 天自动清理）
```

查询工具：

```bash
# 导出 Markdown（可直接喂 LLM）
python kb_query.py --source ai4s --since 2026-08-01 --markdown

# 关键词过滤（评测数据）
python kb_query.py --source eval --keywords deepseek,评测

# 原始 JSON
python kb_query.py --source ai4s --json
```

调整保留天数：`python main.py --retention 60`

## MCP Server（让 Agent 调用知识库）

```bash
# 本地 stdio（不暴露端口，天然安全）
.venv/bin/python mcp_server.py --transport stdio

# 远程 HTTP（VPS 部署，需认证）
MCP_API_KEY=xxx .venv/bin/python mcp_http.py --host 127.0.0.1 --port 8000
```

**工具**：

| 工具 | 说明 |
|---|---|
| `list_snapshots(source)` | 列出 ai4s / eval 存档 |
| `query_kb(source, since, until, keywords)` | 按时间/关键词查询 |
| `export_markdown(source, since, until, keywords)` | 导出 Markdown 喂 LLM |
| `run_digest(source, since, until, keywords)` | 直接调用 LLM 分析历史数据 |

各客户端（Claude Code / opencode / codex / kimi-code）配置见 **`deploy/MCP.md`**。

## 部署

见 **`deploy/`** 目录：

- `README.md` — GitHub Actions 或 VPS 部署两种方案
- `MCP.md` — MCP Server 多客户端配置
- `DEPLOYMENT_EVAL.md` — 部署方案评估（GitHub vs VPS）

**VPS 定时任务**（已配置实例）：

```cron
0 8 * * *  cd /opt/ai4s-daily && .venv/bin/python main.py --output /opt/ai4s-daily/site >> /var/log/ai4s.log 2>&1
0 20 * * * cd /opt/ai4s-daily && .venv/bin/python main.py --output /opt/ai4s-daily/site >> /var/log/ai4s.log 2>&1
```

## 项目结构

```
ai4s-daily/
├── main.py              # 主入口：抓取 → 分析 → 渲染 → 存档
├── config.yaml          # 信源配置
├── kb_query.py          # 知识库查询 CLI
├── mcp_server.py        # MCP Server（stdio + HTTP）
├── mcp_http.py          # MCP HTTP 启动器（带认证）
├── ai4s/
│   ├── collectors.py    # AI4S 四类信源抓取
│   ├── eval_collectors.py  # 测评排行榜/新闻抓取
│   ├── render.py        # AI4S 看板渲染
│   ├── eval_render.py   # 测评看板渲染
│   ├── summarizer.py    # LLM 深度分析（粗选 + 精析）
│   ├── webscrape.py     # Firecrawl/Jina 双后端抓取层
│   ├── fulltext.py      # 全文抓取
│   └── kb.py            # 知识库存档/查询
├── site/                # 生成的看板（输出）
├── kb/                  # 知识库（存档）
├── archive/             # 看板快照（30 天保留）
└── deploy/              # 部署文档
```

## 说明

- arXiv API 有限流（429），代码已做退避重试；若临时返回 429/503 属正常限流，稍后重跑即可
- 司南（OpenCompass）是 React SPA，需 Firecrawl 渲染；未配置 Firecrawl 时用 Jina（偶发不稳定）
- 无 LLM Key 时自动跳过摘要，仅展示聚合列表
