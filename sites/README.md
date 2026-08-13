# AI4S — AI 热门消息聚合站

类似 aihot.virxact.com 的 AI 行业动态聚合站。多源 RSS 抓取 → DeepSeek LLM 加工（中文标题/摘要/分类/标签/评分/精选理由）→ 精选时间线、热门排行、事件聚合、每日日报、RSS 订阅。

## 快速开始

```bash
npm install
cp .env.local.example .env.local   # 填入 DEEPSEEK_API_KEY
npm run migrate                    # 可选：从 JSON 迁移到 SQLite（首次）
npm run dev                        # http://localhost:3000
```

抓取并 AI 加工一条数据流：

```bash
npm run ingest
```

## 环境变量

| 变量 | 说明 |
|---|---|
| `DEEPSEEK_API_KEY` | 必填，DeepSeek API 密钥 |
| `LLM_MODEL` | 可选，默认 `deepseek-chat` |
| `INGEST_SECRET` | 可选，调用 `/api/ingest` 需带 `X-Ingest-Secret` 请求头 |
| `LLM_MOCK` | `1` 时用启发式规则代替真实 LLM（本地无 key 测试用） |

## 定时调度

**本地 crontab**（每 6 小时抓取一次）：

```bash
0 */6 * * * cd /path/to/ai4s-sites && /usr/bin/npm run ingest >> data/ingest.log 2>&1
```

**Vercel Cron**：已在 `vercel.json` 配置 `/api/ingest` 每 6 小时触发。生产环境设置 `INGEST_SECRET` 后，如需自定义 Cron Header 鉴权可查阅 Vercel 文档。

并发保护：`/api/ingest` 内置幂等锁，重复触发返回 `409`。

## 页面

- `/` 精选时间线（含分类筛选）
- `/hot` 热门排行（热度算法 + spark 趋势图）
- `/benchmark` 模型测评榜单
- `/stories` 事件聚合（同事件多信源合并）
- `/daily` 每日 AI 日报
- `/all` 全部动态 + 全文搜索
- `/items/[id]` 站内阅读页
- `/api/feed` 精选 RSS · `/api/feed/daily` 日报 RSS

## 信源

- **RSS**（11+ 源）：OpenAI/Google AI Blog/MIT/VentureBeat/MarkTechPost/InfoQ/IT之家/机器之心/Hacker News/arXiv(2) 等
- **Reddit**（4 源）：r/artificial、r/LocalLLaMA、r/MachineLearning、r/OpenAI（每次 ingest 轮换抓取 1 个，规避限流）
- **X/Twitter**：可选，配置 `X_BEARER_TOKEN` 后启用（需付费 Basic 层）

## 内容管线（两阶段 LLM）

1. **预过滤**（`filter.ts`）：关键词规则剔除生命科学/自然科学等无关内容，避免浪费 token
2. **粗选**（`selectCandidates`）：标题+摘要交给 LLM 挑最有价值的候选
3. **全文精析**（`refineWithFulltext`）：候选抓全文（Jina Reader）→ LLM 深度分析，产出中文标题/摘要/精选理由
4. 事件聚类（实体匹配 + 专有名词）→ 热度快照 → 入库

## 模型测评

- **AA 主榜**：`npm run fetch-aa` 抓取 Artificial Analysis 全量模型数据（584 模型，多基准加权综合分）
- **实时榜单**：`npm run refresh-rankings` 抓取 LMArena / LiveBench / Open LLM Leaderboard / OpenCompass 司南，存 `data/rankings.json`，benchmark 页面 tab 切换
- ingest 完成后自动刷新实时榜单（`REFRESH_RANKINGS=0` 可禁用）

## GitHub 周热榜

- `/github`：近 7 天创建的 AI/LLM/Agent 热门仓库 **Top 10**，含 AI 生成的中文简介与趋势总览
- 数据源：GitHub Search API（topic:ai / llm / agent / mcp 等）
- `npm run refresh-github` 手动刷新；ingest 后自动刷新（`REFRESH_GITHUB=0` 可禁用）
- 生产环境建议配置 `GITHUB_TOKEN` 提升 API 限额（未认证 10 次/分）

## OpenRouter 实际使用量排行

- benchmark 页面「OpenRouter 实际使用量排行」区块：按 token 消耗量排序，反映真实 API 使用热度
- 数据源：`openrouter.ai/api/frontend/v1/rankings/models`
- `npm run refresh-openrouter` 手动刷新；ingest 后自动刷新（`REFRESH_OPENROUTER=0` 可禁用）


## 数据存储

SQLite：`data/ai4s.db`（items / stories / heat_snapshots / ingest_runs）。
首次使用需 `npm run migrate` 从旧 JSON 数据迁移（如无旧数据可跳过）。

## 部署

见 `DEPLOYMENT.md`（自托管/Docker 推荐，Vercel 有 SQLite 持久化限制）。

## 路线图

见 `PLAN.md`。
