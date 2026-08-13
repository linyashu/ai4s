# AI4S 生产部署说明

## 架构注意

本项目使用 **SQLite 文件存储**（`data/ai4s.db`）。选择部署平台时需考虑文件持久化能力：

### 方案 A：自托管 / Docker（推荐）

SQLite 文件持久化最自然，也方便 `npm run ingest` 定时任务访问同一份数据。

```bash
# 1. 构建
npm ci && npm run build

# 2. 启动（生产）
DATA_DIR=/data npm start

# 3. 定时抓取（crontab）
0 */6 * * * cd /path/to/app && DATA_DIR=/data npm run ingest >> /var/log/ai4s-ingest.log 2>&1
```

Docker：

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS runner
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
ENV NODE_ENV=production DATA_DIR=/data
VOLUME /data
EXPOSE 3000
CMD ["npm", "start"]
```

### 方案 B：Vercel（有限支持）

Vercel Serverless 无持久磁盘（`/tmp` 每次冷启动重建）。可行但需额外工程：

- 用 Vercel Postgres（`@vercel/postgres`）替换 SQLite，或
- 引入对象存储（S3）同步 SQLite 文件，或
- 使用第三方托管 SQLite（Turso / libsql）

若坚持 Vercel，建议将 `src/lib/db.ts` 替换为 Postgres 实现（API 层不变，改动集中在 db 模块）。

## 环境变量

| 变量 | 部署必填 | 说明 |
|---|---|---|
| `DEEPSEEK_API_KEY` | 是 | DeepSeek API 密钥 |
| `DATA_DIR` | 建议 | 数据目录（默认 `./data`） |
| `INGEST_SECRET` | 是 | 保护 `/api/ingest`（Cron 触发时用 Header 鉴权） |
| `LLM_MODEL` | 否 | 默认 `deepseek-chat` |

## Vercel Cron

`vercel.json` 已配置 `/api/ingest` 每 6 小时触发。

```json
{
  "crons": [{ "path": "/api/ingest", "schedule": "0 */6 * * *" }]
}
```

Cron 调用 `/api/ingest` 时会自动附带 `Authorization: Bearer $CRON_SECRET`（Vercel 内置，设为 `INGEST_SECRET` 值），请求中校验逻辑在 `src/app/api/ingest/route.ts`。

## 首次部署

1. 配置环境变量（含 `INGEST_SECRET` 与 `CRON_SECRET`）
2. 首次抓取：`DATA_DIR=/data npm run ingest`（生产目录）
3. 验证页面、RSS、Cron 日志

## 监控

`ingest_runs` 表记录每次抓取的统计（fetched/processed/selected/failed）。可通过 SQL 查询：

```sql
SELECT * FROM ingest_runs ORDER BY id DESC LIMIT 10;
```
