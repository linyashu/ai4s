# AI4S 实施计划

> 目标：打造类似 aihot.virxact.com 的 AI 热门消息聚合站。
> 现状：MVP 已完成（多源 RSS 聚合 → DeepSeek 加工 → 精选时间线 → 分类 → 热门 → RSS）。
> 进度标记：⬜ 未开始 / 🔄 进行中 / ✅ 已完成

---

## 阶段一：内容体验补全

### 1. 全部动态页 + 全文搜索 `/all`
- ⬜ 实现 `/all` 页面：展示全部条目（含非精选），时间倒序
- ⬜ 全文搜索：标题/中文摘要/标签/来源关键字匹配，URL 参数 `?q=`
- ⬜ 分页或「加载更多」（数据量大时启用）
- 📁 涉及：`src/app/all/page.tsx`、`src/lib/search.ts`

### 2. 站内阅读页 `/items/[id]`
- ⬜ 详情页：展示 titleZh、原文链接、摘要全文、来源、标签、精选理由
- ⬜ 展示原始正文摘录（RSS content 已存）
- ⬜ 相关条目推荐（同分类/同标签）
- 📁 涉及：`src/app/items/[id]/page.tsx`

### 3. 故事聚合（story）— AIHOT 核心差异化
- ⬜ 数据模型：`Story { id, titleZh, summaryZh, itemIds[], score }`
- ⬜ 聚合算法：同事件多信源条目合并（URL 域名无关的语义相似 + 标题关键词）
- ⬜ 详情页 `/story/[publicId]`：聚合页展示多来源、合并摘要
- 📁 涉及：`src/lib/story.ts`、`src/app/story/[publicId]/page.tsx`

### 4. 每日 AI 日报
- ⬜ LLM 每日编排：将当天精选条目汇总，生成「今日 AI 日报」结构化文本（头条 + 要点）
- ⬜ 日报页 + `/feed/daily.xml` 独立 RSS
- 📁 涉及：`src/lib/daily.ts`、`src/app/daily/page.tsx`

---

## 阶段二：热度与榜单升级

### 5. 热度算法完善
- ✅ 基础热度：`(60 + finalScore) × 信源权重 × 2^(-age/24h)`（24h 半衰期）
- ⬜ 加入「重复来源计数」权重：同一故事被多信源报道 → 热度加成
- ⬜ 加入「氛围票」模拟数据源（后续接入真实用户投票后替换）
- ⬜ 热度历史存档：每小时快照，供趋势图使用
- 📁 涉及：`src/lib/hot.ts`、`data/heat-history.json`

### 6. 热门榜视觉升级
- ⬜ spark 迷你趋势图（SVG，基于热度历史）
- ⬜ 重复来源数展示（`<details>` 展开列出重复信源）
- ⬜ 时间窗口切换（24h/7d）
- 📁 涉及：`src/components/spark.tsx`、`src/app/hot/page.tsx`

---

## 阶段三：数据与工程化

### 7. 存储升级 JSON → SQLite
- ⬜ 引入 better-sqlite3（或 Prisma），表：`items` / `stories` / `heat_snapshots` / `daily_reports`
- ⬜ 迁移脚本：现有 JSON 数据导入 SQLite
- ⬜ 理由：搜索、历史热度、关联查询需要数据库
- 📁 涉及：`src/lib/db.ts`、`scripts/migrate.ts`

### 8. 定时调度
- ⬜ Vercel Cron（生产）：`/api/ingest` 每小时/每天触发
- ⬜ 本地 crontab 示例：`0 */6 * * * cd <repo> && npm run ingest`
- ⬜ ingest 幂等保护（并发锁，防止重复触发）
- 📁 涉及：`vercel.json`、`README.md`

### 9. 图片代理 `/api/img-proxy`
- ⬜ 代理外链图片（X 头像/媒体），带签名+过期（参考 AIHOT 的 `?u=&mode=&exp=&sig=`）
- ⬜ 内存/磁盘缓存，控制抓取频率
- 📁 涉及：`src/app/api/img-proxy/route.ts`

### 10. 生产部署
- ⬜ Vercel 部署 + 环境变量（DEEPSEEK_API_KEY / INGEST_SECRET）
- ⬜ 域名绑定、HTTPS
- ⬜ `.env.example` 文档化
- 📁 涉及：`vercel.json`、`README.md`

---

## 阶段四：信源扩展

### 11. X / Twitter 信源（x_search）
- ⬜ 需要 X API 凭证（需用户提供）
- ⬜ 信源：科技大V 关键词搜索（Jensen Huang、OpenAI、Anthropic 等）
- ⬜ 特殊字段：originalText / quotedTweet / xMediaProxied
- 📁 涉及：`src/lib/fetch-x.ts`、`src/lib/sources.ts`

### 12. 微信公众号信源
- ⬜ 需要公众号采集方案（需用户确认合规来源）
- 📁 涉及：`src/lib/fetch-mp.ts`

### 13. 更多 RSS 源与健康度
- ⬜ 增补源：Anthropic 官网、OpenRouter、LMSYS、a16z news、arXiv（多分类）
- ⬜ 信源健康度监控：失败率、空结果告警
- 📁 涉及：`src/lib/sources.ts`、`src/lib/health.ts`

---

## 阶段五：SEO 与产品化

### 14. SEO 增强
- ⬜ JSON-LD schema.org：Organization / WebSite / Article
- ⬜ sitemap.xml + robots.txt
- ⬜ 页面级 OG/Twitter Card 元数据（title 格式：`{标题} · AI4S`）
- 📁 涉及：`src/app/sitemap.ts`、`src/app/layout.tsx`

### 15. PWA
- ⬜ manifest.webmanifest + 图标 + 主题色
- ⬜ apple-touch-icon、移动端适配
- 📁 涉及：`src/app/manifest.ts`

### 16. 监控与告警
- ⬜ ingest 运行日志（成功/失败/耗时/成本）
- ⬜ LLM token 成本统计
- ⬜ 失败告警（邮件/Webhook）
- 📁 涉及：`src/lib/monitor.ts`

---

## 优先级建议

1. **高**：1（搜索）、2（详情页）、8（定时调度）— 让站点可用
2. **高**：7（SQLite）— 支撑后续功能的地基
3. **中**：3（故事聚合）、5（热度完善）— 差异化体验
4. **中**：4（日报）、10（部署）
5. **低**：11-13（信源）、14-16（SEO/PWA/监控）

---

## 已完成清单（MVP）

- ✅ Next.js 16 + TypeScript 项目搭建
- ✅ 6 源 RSS 聚合（OpenAI/HN/MarkTechPost/arXiv/IT之家/机器之心）
- ✅ DeepSeek LLM 加工（中文标题/摘要/分类/标签/评分/精选理由）
- ✅ 去重（URL + 标题）+ JSON 存储
- ✅ 精选时间线主页 + 6 分类筛选
- ✅ 热门排行（24h 半衰期热度算法）
- ✅ RSS 输出 + 浅色主题

---

## 执行进度（更新于 2026-08-11）

- ✅ 1 全部动态+搜索 · ✅ 2 站内阅读页 · ✅ 3 故事聚合 · ✅ 4 AI日报
- ✅ 5 热度算法（重复来源/氛围票/快照） · ✅ 6 spark趋势图/信源展开
- ✅ 7 SQLite 存储迁移 · ✅ 8 定时调度+幂等锁 · ✅ 9 图片代理
- ✅ 10 部署文档 · ✅ 11 X 信源代码（无凭证自动跳过） · ⏭ 12 公众号（无合规源，跳过）
- ✅ 13 增补 5 个 RSS 源+健康度 · ✅ 14 SEO(JSON-LD/sitemap/OG) · ✅ 15 PWA · ✅ 16 监控/成本

阶段一至五全部完成。剩余可选增强：真实用户氛围票、公众号合规源、Vercel+Postgres 迁移。

## ai4s-daily 优化合并（更新于 2026-08-11）

- ✅ 阶段一：智能内容过滤（`filter.ts`，生命科学/自然科学排除 + 强收录信号白名单）
- ✅ 阶段二：两阶段 LLM 管线（粗选候选 → Jina 全文抓取 → 精析），省 token 且点评更深入
- ✅ 阶段三：事件聚类升级（核心实体表 + 实体重叠/相似度匹配，Muse Glimmer 事件合并 6 源）
- ✅ 阶段四：多源实时排行榜（LMArena/LiveBench/OpenLLM/司南 4 抓取器 + rankings.json + benchmark 页实时榜单 tab）

剩余可选：知识库快照 + MCP 查询（延伸功能）、Firecrawl 付费层

---

## 后续计划

> 2026-08-13 全量代码审阅完成，修复与后续路线见 `PLAN-NEXT.md`（P0 修复 → 工程化 → 体验升级 → 管线与数据优化）。
