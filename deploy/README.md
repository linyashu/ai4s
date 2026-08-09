# 服务器/云托管部署方案（二选一）

## 方案 A：GitHub Actions + GitHub Pages（推荐，免费）

1. 把仓库推送到 GitHub
2. 在仓库 Settings → Pages → Build and deployment 选择
   Source: Deploy from a branch，分支 gh-pages，目录 / (root)
3. 在仓库 Settings → Secrets and variables → Actions 添加：
   - `LLM_BASE_URL` = https://api.deepseek.com/v1
   - `LLM_API_KEY` = 你的 key
   - `LLM_MODEL` = deepseek-chat
   - `FIRECRAWL_API_KEY` = 你的 firecrawl key（司南 SPA 渲染必需，可选但推荐）
   - `JINA_API_KEY` = 你的 jina key（可选兜底）
4. Actions 定时任务已配置：每天 **UTC 00:00 和 12:00 运行**
   = 北京时间 **08:00 和 20:00**（可在 .github/workflows/daily.yml 调整）
5. 手动触发：Actions 页面 "Run workflow"

看板地址：https://<你的用户名>.github.io/<仓库名>/

> 注意：免费 GitHub Pages 每次 deploy 用 `force_orphan` 重建分支，
> 存档（kb/ 与 archive/）建议存入**同一仓库的 main 分支**（被 checkout 保留），
> 这样每次运行基于最新 main 继续累积存档。

## 方案 B：自己的服务器 / VPS（cron + 静态文件服务）

1. 上传项目到服务器，例如 /opt/ai4s-daily
2. 安装依赖：
   ```bash
   python3 -m venv /opt/ai4s-daily/.venv
   /opt/ai4s-daily/.venv/bin/pip install -r requirements.txt
   ```
3. 配置环境变量：
   ```bash
   cp .env.example .env   # 填入 LLM_API_KEY、FIRECRAWL_API_KEY 等
   ```
4. 安装 crontab（每天北京时间 08:00 和 20:00 生成看板）：
   ```bash
   crontab -e
   # 系统时区需为 UTC+8，或按需换算
   0 8 * * * cd /opt/ai4s-daily && /opt/ai4s-daily/.venv/bin/python main.py --output /var/www/ai4s >> /var/log/ai4s.log 2>&1
   0 20 * * * cd /opt/ai4s-daily && /opt/ai4s-daily/.venv/bin/python main.py --output /var/www/ai4s >> /var/log/ai4s.log 2>&1
   ```
   若服务器时区非 UTC+8，先 `timedatectl set-timezone Asia/Shanghai`。
5. 用任意静态服务器托管输出目录，例如 Caddy：
   ```
   ai4s.example.com {
       root * /var/www/ai4s
       file_server
   }
   ```

看板地址：https://ai4s.example.com/

## 存档与知识库（两种方案都启用）

- **看板存档**：每次运行把 `site/` 快照复制到 `archive/YYYYMMDD-HHMM/`，默认保留 30 天自动清理
- **知识库**：结构化数据 + LLM 分析存入 `kb/ai4s/` 与 `kb/eval/`（JSON，带时间戳），保留 30 天
- **查询/喂 LLM**：
  ```bash
  python kb_query.py --source ai4s --since 2026-08-01 --markdown   # 导出 Markdown
  python kb_query.py --source eval --keywords deepseek,评测           # 关键词过滤
  python kb_query.py --source ai4s --json                            # 原始 JSON
  ```
- 调整保留天数：`python main.py --retention 60`

> VPS 部署时注意：`archive/`、`kb/` 目录默认保留 30 天，20G 硬盘完全够用
> （每次快照约 200KB，30 天 × 2 次/天 ≈ 12MB）。
