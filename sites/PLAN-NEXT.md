# AI4S 审阅修复与下一步计划

> 来源：2026-08-13 全量代码审阅（构建 ✅ · lint ✅ · 40+ 文件通读）
> 目标：修复 P0 缺陷 → 补齐工程化地基 → 体验升级 → 管线与数据优化
> 进度标记：⬜ 未开始 / 🔄 进行中 / ✅ 已完成
> 优先级标记：P0 必须立即修复 · P1 高 · P2 中 · P3 低

---

## 阶段一：P0 修复（本周完成）

### 1. 修复 ingest 幂等锁失效
- ⬜ `src/app/api/ingest/route.ts:17`：`tryAcquireLock("ingest")` 补 `await`
- ⬜ 用两个并发 curl 验证：第二个请求返回 409
- 📁 涉及：`src/app/api/ingest/route.ts`
- ✅ 验收：`if (!(await tryAcquireLock("ingest")))`；并发触发时恰有一次进入管线，其余 409

### 2. 统一站点 URL 配置
- ⬜ 新建 `src/lib/site-url.ts`：`export function siteUrl()`，读 `SITE_URL` 回退 `https://ai4s.local`
- ⬜ 替换硬编码点：`api/feed/route.ts:15`、`api/feed/daily/route.ts:16`、`robots.ts:4`、`sitemap.ts:6`、`layout.tsx:19,41`、`items/[id]/page.tsx:63`
- ⬜ RSS `<link>` 改为站内页 `/items/{id}`，原文链接保留在 description 内
- ⬜ 注意：`metadataBase` 在构建期求值，生产运行时才注入 `SITE_URL` 的场景需评估（自托管可接受，Vercel 需构建期变量）
- 📁 涉及：`src/lib/site-url.ts`（新）、6 处替换
- ✅ 验收：生产环境 RSS 校验器无 ai4s.local 残留；`grep -r "ai4s.local" src/` 仅剩 site-url.ts 一处回退值

### 3. img-proxy 安全加固
- ⬜ `img-sign.ts`：移除默认密钥，无 `IMG_PROXY_SECRET` 时 `signProxyUrl` 抛错（禁用代理）
- ⬜ `img-proxy/route.ts`：无 secret 时返回 503；host 匹配改 `endsWith(".twimg.com")`（前缀点）
- ⬜ 上游响应限制：`Content-Length` 预检 + body 截断（5MB），拒绝非 image/* content-type
- ⬜ `.env.local.example` 补 `IMG_PROXY_SECRET` 说明
- 📁 涉及：`src/lib/img-sign.ts`、`src/app/api/img-proxy/route.ts`、`.env.local.example`
- ✅ 验收：无 secret 部署时代理不可用而非不安全；`eviltwimg.com` 被拒；超 5MB 响应被拒

### 4. 管理 API 强制鉴权
- ⬜ 抽公共中间件/helper `src/lib/api-auth.ts`：`requireIngestSecret(req)`，未配置 `INGEST_SECRET` 时一律 503（而非放行）
- ⬜ 应用到 4 个路由：`api/ingest`、`api/monitor`、`api/benchmark-refresh`、`api/github-trending`
- ⬜ 保留 `X-Ingest-Secret` 头鉴权（Vercel Cron 用 `CRON_SECRET` 时可双头兼容，见 DEPLOYMENT.md 第 70 行描述，需验证 Vercel 实际注入的是 Authorization 头并做兼容）
- 📁 涉及：`src/lib/api-auth.ts`（新）、4 个 route
- ✅ 验收：无 secret 时所有管理 API 返回 503；有 secret 时错误/正确头分别 401/200

### 5. 提交全部现有工作
- ⬜ `git add -A` 后检查无 `.env.local`、无 `data/*.db` 泄密，分批提交（初始应用代码 / 管线与页面 / 部署配置）
- ⬜ 提交后推送远端
- ✅ 验收：`git status` 干净；`git log` 有清晰历史

---

## 阶段二：工程化地基（1-2 周）

### 6. 引入 vitest 单元测试
- ⬜ 安装 `vitest`（devDependency），`package.json` 加 `"test": "vitest run"`
- ⬜ 第一批测试（覆盖审阅发现 bug 的模块，防回归）：
  - `src/lib/story.test.ts`：实体重叠聚类、跨源合并、`itemsSimilar` 边界（同词不同事件不误并）
  - `src/lib/filter.test.ts`：强排除/强收录优先级、生命周期科学排除、AI 手机保留意图
  - `src/lib/search.test.ts`：多字段匹配、评分排序、空查询
  - `src/lib/hot.test.ts`：半衰期衰减、信源权重、重复来源加成
  - `src/lib/pipeline.test.ts`：`normalizeUrl`（utm 剔除、hash 剔除）、`titleKey`、`makeId` 稳定性
- ⬜ 测试即需求：先写测试暴露 filter.ts 矛盾（见任务 7），修复后测试转绿
- 📁 涉及：`vitest.config.ts`（新）、`src/lib/*.test.ts`（5 个新）
- ✅ 验收：`npm test` 全绿；CI 集成

### 7. 修复 filter.ts 规则矛盾
- ⬜ 移除 `"自动驾驶出租车" ` 尾随空格
- ⬜ 强排除词条收窄为长短语（`"手机发布"`、`"新机发布"` 等），使 `INCLUDE_STRONG` 的"AI 手机"意图生效
- ⬜ 用任务 6 的 filter 测试锁定预期行为
- 📁 涉及：`src/lib/filter.ts`
- ✅ 验收：`AI 手机` 保留、`手机新品` 排除、`自动驾驶出租车` 正常参与匹配

### 8. GitHub Actions CI
- ⬜ `.github/workflows/ci.yml`：`npm ci` → `npm run lint` → `npm test` → `npm run build`
- ⬜ 触发条件：push main + PR
- 📁 涉及：`.github/workflows/ci.yml`（新）
- ✅ 验收：PR 上自动跑全部检查，红绿可见

### 9. 依赖与 Docker 清理
- ⬜ 移除 `better-sqlite3`、`@types/better-sqlite3`
- ⬜ Dockerfile 三阶段删掉 `python3 make g++` 安装（runner 段已无用），仅保留 npm ci 所需（libsql 为纯 JS/预编译绑定，验证构建后删除）
- ⬜ Dockerfile 移除硬编码 `107.182.191.63` 与 `BASE_PATH`，改由 compose/运行时 env 注入
- ⬜ 重建镜像验证 `npm run ingest` 在容器内可执行
- 📁 涉及：`package.json`、`Dockerfile`、`docker-compose.yml`
- ✅ 验收：构建时间显著下降；镜像体积下降；容器内 ingest 正常

### 10. 时区修正
- ⬜ 新建 `src/lib/time.ts`：`cnTodayRange(ref)` 用 `Asia/Shanghai` 计算 [0:00, 24:00) 边界
- ⬜ `daily.ts` 的 `isToday`、`cnDateKey`（pipeline.ts）改用统一实现
- 📁 涉及：`src/lib/time.ts`（新）、`src/lib/daily.ts`、`src/lib/pipeline.ts`
- ✅ 验收：Docker（UTC）环境北京时间 0-8 点日报归属正确

### 11. 管线稳健性
- ⬜ `llm.ts`：`chatJson`/`processWithLLM` 加 2 次指数退避重试（500/429/网络错误）
- ⬜ `fetch-fulltext.ts`：批量抓取改并发 3 条 + 单条超时 45s；fulltext 截断降到 8K
- ⬜ `llm.ts` 粗选 prompt 只传标题+来源（摘要在候选>30 时省略）
- ⬜ `pipeline.ts`：`const llm` 改名 `useMock`；ingest 完成日志补时长
- 📁 涉及：`src/lib/llm.ts`、`src/lib/fetch-fulltext.ts`、`src/lib/pipeline.ts`
- ✅ 验收：压测一次真实 ingest，无 300s 超时；失败源不影响主流程

### 12. 代码卫生
- ⬜ 删除 dead code `buildDailyReport`（daily.ts:39）
- ⬜ `.gitignore` 修正 `!/data/.gitkeep`
- ⬜ `usage.ts` 价格改环境变量（`LLM_INPUT_PRICE_PER_M` / `LLM_OUTPUT_PRICE_PER_M`），默认 DeepSeek 现价
- ⬜ `.env.local.example` 补全部变量（含 `SITE_URL`、`IMG_PROXY_SECRET`、`REFRESH_*` 开关）
- 📁 涉及：`src/lib/daily.ts`、`.gitignore`、`src/lib/usage.ts`、`.env.local.example`
- ✅ 验收：`npx tsc --noEmit` 与 lint 通过；env example 覆盖所有 `process.env.` 引用

---

## 阶段三：体验升级（2-3 周）

### 13. 真实氛围票
- ⬜ DB 迁移：`votes` 表（`id, itemId, sessionId, value, createdAt`）+ `item_votes` 视图/索引
- ⬜ API：`POST /api/vote`（itemId + value ∈ {+1,-1}，sessionId cookie 防重）
- ⬜ `hot.ts`：`vibeVotes` 改读真实票数（0 票回退隐藏而非伪随机）；热度公式融入票数（权重可调，如 `+0.5/票` 上限封顶）
- ⬜ UI：`ItemCard` 与 hot 页加 👍/👎 按钮（client component），未登录态用 cookie 匿名票
- 📁 涉及：`src/lib/db.ts`、`src/app/api/vote/route.ts`（新）、`src/lib/hot.ts`、`src/components/*`
- ✅ 验收：同 session 重复投票被拒；热度实时反映票数；无伪随机数展示

### 14. 热门榜时间窗口
- ⬜ hot 页加 24h / 7d tab：`computeHotRanking` 加 `windowHours` 参数（7d 用不同半衰期 72h）
- ⬜ spark 图随窗口缩放 x 轴
- 📁 涉及：`src/lib/hot.ts`、`src/app/hot/page.tsx`、`src/components/spark.tsx`
- ✅ 验收：两窗口榜单有合理差异；URL 参数 `?window=7d` 可分享

### 15. 日报 LLM 深度版
- ⬜ `daily.ts` 新增 `buildDailyReportLLM()`：当日精选条目交给 LLM 生成「头条深度解读」（头条选择 + 300 字解读 + 要点列表）
- ⬜ 每日 ingest 后生成并存 kv/表（`daily_reports`），页面读缓存而非实时调 LLM
- ⬜ 与 ai4s-kb 知识库联动：日报页附「昨日回顾」（查询 kb 快照）
- 📁 涉及：`src/lib/daily.ts`、`src/lib/db.ts`、`src/app/daily/page.tsx`、`src/app/api/feed/daily/route.ts`
- ✅ 验收：日报页出现 LLM 生成的当日解读；无 key 时优雅回退现状排版

### 16. 首页信息密度
- ⬜ 首页侧栏/下方加：今日 Top 5 热度迷你榜、GitHub 周榜 Top 3、排行榜变动速览
- ⬜ 保持移动端单列优先，桌面双列
- 📁 涉及：`src/app/page.tsx`、`src/components/mini-hot.tsx`（新）
- ✅ 验收：首页一眼可见多板块；Lighthouse 移动端 ≥ 90

---

## 阶段四：管线与数据（持续）

### 17. 信源健康告警
- ⬜ `health.ts` 加 `findFailingSources()`：连续 3 次失败的信源列表
- ⬜ ingest 末尾检查：有持续失败源时推送通知（`ALERT_WEBHOOK_URL` 支持 Discord/Slack/钉钉通用 webhook，失败则记日志）
- 📁 涉及：`src/lib/health.ts`、`src/lib/alert.ts`（新）、`src/lib/pipeline.ts`
- ✅ 验收：手动断一个源连跑 3 次，webhook 收到告警

### 18. 成本仪表盘
- ⬜ `llm_usage` 表加 `kind` 列（select/refine/single/daily/github），`recordLLMUsage` 带 kind
- ⬜ `/monitor` 页面（现有 `/api/monitor` 数据源）：ingest 历史、源健康度、token 成本曲线（SVG 简单折线）
- 📁 涉及：`src/lib/db.ts`、`src/lib/usage.ts`、`src/app/monitor/page.tsx`（新）
- ✅ 验收：页面可见近 7/30 天成本与分类占比

### 19. 数据保留策略
- ⬜ ingest 尾部清理：`heat_snapshots`、`source_health`、`llm_usage`、`ingest_runs` 各保留 30 天
- ⬜ 封装 `src/lib/cleanup.ts`，单测覆盖边界（0 行、跨月）
- 📁 涉及：`src/lib/cleanup.ts`（新）、`src/lib/pipeline.ts`
- ✅ 验收：跑 30 次模拟 ingest 后旧数据被清、新数据完好

### 20. 搜索与分页升级
- ⬜ `readItems` 支持 SQL 层参数（`{ category?, aiSelected?, limit, offset, since }`），页面不再全量加载
- ⬜ 搜索先做 SQLite 普通 LIKE（加 `lower()` 索引评估）；数据量破万再上 FTS5 trigram
- 📁 涉及：`src/lib/db.ts`、`src/lib/store.ts`、`src/lib/search.ts`、各页面
- ✅ 验收：items 1 万条时页面响应 < 300ms；`/all?q=` 结果正确

---

## 可选探索（低优先级）

- ⬜ Vercel + Turso/libsql remote：db.ts 已用 @libsql/client，改 remote URL + token 即可，评估迁移成本半天内
- ⬜ X 信源限额管理：`x_quota` 计数表，接近限额自动降频
- ⬜ 公众号合规源调研
- ⬜ 事件时间轴视图（story 详情加"首次报道 → 多源跟进"可视化）
- ⬜ 暗色主题（globals.css 已用 CSS 变量，成本低）
- ⬜ Firecrawl 付费层评估（SPA 反爬场景）

---

## 里程碑

| 里程碑 | 内容 | 预计 |
|---|---|---|
| M1 安全与正确性 | 阶段一全部 + 提交 | 本周 |
| M2 工程化落地 | 测试 + CI + 依赖清理 + 时区 + 管线稳健 | 第 2 周 |
| M3 体验 1.0 | 真实投票 + 时间窗口 | 第 3-4 周 |
| M4 内容升级 | LLM 日报 + 首页密度 + 告警/仪表盘 | 第 5-6 周 |
| M5 规模化 | 数据保留 + SQL 分页 + 搜索 | 视数据增长启动 |

## 执行原则

1. 每个任务先写测试或验证脚本，再改代码（M1 的锁修复例外，属一行 bug）
2. 每完成一个里程碑 commit 一次，保持小步提交
3. 阶段一至二完成前不新增功能需求
4. 所有对外文本（告警、文案）用中文，技术标识保留英文
