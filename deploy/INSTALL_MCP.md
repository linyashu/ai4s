# AI4S 知识库 MCP 一键安装教程

> 目标：让任何人在自己的电脑上，用他们的 AI 助手（Claude Code / opencode / codex 等）
> 自动安装并接入 AI4S 知识库 MCP 服务。

本文件包含两种方式：
- **方式 A（推荐）**：复制一段安装指令给 AI 助手，AI 自动完成安装
- **方式 B**：手动安装（适合不用 AI 助手的场景）

---

## 方式 A：复制指令给 AI 助手（一键安装）

把下面这段文字完整复制给你的 AI 助手（Claude Code / opencode / codex / 任何支持 MCP 的 agent），
它会自动执行安装：

```
请帮我安装 AI4S 知识库 MCP 服务。安装指引在 https://raw.githubusercontent.com/<你的用户名>/<仓库名>/main/deploy/INSTALL_MCP.md

请严格按照该文档执行：
1. 阅读文档中的「手动安装步骤」
2. 自动 clone 仓库、创建虚拟环境、安装依赖
3. 引导我配置 .env（LLM 和 Firecrawl 的 API key 由我提供）
4. 根据文档自动注册 MCP 到当前客户端（stdio 方式）
5. 运行验证命令，把结果展示给我

注意：安装过程中需要我输入 API key 时，请停下来问我，不要跳过。
```

> 把 `<你的用户名>/<仓库名>` 替换为你的实际仓库地址。
> 如果没发布到 GitHub，也可以直接把 `INSTALL_MCP.md` 文件路径告诉 AI，例如
> `请按 /path/to/ai4s-daily/deploy/INSTALL_MCP.md 安装`。

---

## 方式 B：手动安装步骤

### 1. 获取项目

```bash
git clone https://github.com/<你的用户名>/<仓库名>.git
cd <仓库名>
```

（或直接使用你已有的项目副本。）

### 2. 创建虚拟环境并安装依赖

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

### 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入你提供的 key：

```bash
# LLM（用于 run_digest 分析）
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=sk-你的key
LLM_MODEL=deepseek-chat

# Firecrawl（抓取 SPA 页面，如司南排行榜，推荐）
FIRECRAWL_API_KEY=fc-你的key

# 可选：Jina Reader 兜底
# JINA_API_KEY=jina_你的key
```

### 4. 注册 MCP（本地 stdio，推荐）

本地 stdio 方式不暴露网络端口，数据不离开本机，最安全。

#### Claude Code

在项目目录创建 `.mcp.json`：

```json
{
  "mcpServers": {
    "ai4s-kb": {
      "command": "/绝对路径/<仓库名>/.venv/bin/python",
      "args": ["/绝对路径/<仓库名>/mcp_server.py", "--transport", "stdio"],
      "env": {
        "AI4S_KB_DIR": "/绝对路径/<仓库名>/kb"
      }
    }
  }
}
```

然后在 Claude Code 中运行：`claude` → `/mcp` 检查是否连接。

#### opencode

编辑 `opencode.json`（用户级：`~/.config/opencode/opencode.json`，
或项目级：`./opencode.json`）：

```json
{
  "mcp": {
    "ai4s-kb": {
      "type": "local",
      "command": ["/绝对路径/<仓库名>/.venv/bin/python", "/绝对路径/<仓库名>/mcp_server.py", "--transport", "stdio"],
      "environment": {
        "AI4S_KB_DIR": "/绝对路径/<仓库名>/kb"
      }
    }
  }
}
```

#### codex

在项目目录 `.codex/config.toml`：

```toml
[mcp_servers.ai4s-kb]
command = "/绝对路径/<仓库名>/.venv/bin/python"
args = ["/绝对路径/<仓库名>/mcp_server.py", "--transport", "stdio"]
env = { AI4S_KB_DIR = "/绝对路径/<仓库名>/kb" }
```

#### 其他支持 stdio 的客户端（kimi-code / Cursor 等）

找到对应客户端的 MCP 配置入口，把 `command` 指向
`.venv/bin/python`、`args` 设为 `["/绝对路径/<仓库名>/mcp_server.py", "--transport", "stdio"]` 即可。

---

## 远程方式（可选）：连接共享的 VPS 知识库

如果项目已部署在 VPS 上（数据存服务器），本地客户端通过 HTTP 远程连接，
需要服务方提供：`MCP URL` 和 `MCP_API_KEY`。

### Claude Code（远程）

```json
{
  "mcpServers": {
    "ai4s-kb": {
      "type": "http",
      "url": "https://你的域名/mcp",
      "headers": {
        "Authorization": "Bearer 服务方提供的key"
      }
    }
  }
}
```

### opencode（远程）

```json
{
  "mcp": {
    "ai4s-kb": {
      "type": "remote",
      "url": "https://你的域名/mcp",
      "headers": {
        "Authorization": "Bearer 服务方提供的key"
      },
      "enabled": true
    }
  }
}
```

> 安全说明：远程方式必须携带 Bearer 认证，未授权请求一律 401。
> 建议由服务方用 Caddy/Nginx 反代并开启 HTTPS。

---

## 验证安装是否成功

安装后让 AI 助手执行，或手动运行：

```bash
# 方式 1：直接启动并检查（能看到工具列表即成功）
#   Claude Code：输入 /mcp 查看 ai4s-kb 状态
#   opencode：opencode mcp list

# 方式 2：用 Python 快速验证（任意目录，用项目虚拟环境）
cd <仓库名>
.venv/bin/python -c "
import sys
sys.path.insert(0, '.')
import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def main():
    params = StdioServerParameters(command=sys.executable, args=['mcp_server.py', '--transport', 'stdio'])
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = await session.list_tools()
            print('工具:', [t.name for t in tools.tools])

asyncio.run(main())
"
```

看到 4 个工具（`list_snapshots` / `query_kb` / `export_markdown` / `run_digest`）即成功。

---

## 常见问题

### 1. 连接失败 / 显示未连接
- 确认 `.env` 存在且 key 有效
- 确认 `mcp_server.py` 路径是绝对路径
- 确认 `.venv/bin/python` 存在（先跑过 `pip install`）
- 项目目录需有 `kb/`（首次 `python main.py --no-digest` 会自动生成）

### 2. 首次使用知识库为空
先跑一次生成脚本产生存档：

```bash
# 仅抓取数据并生成看板/存档（不调用 LLM，避免消耗）
.venv/bin/python main.py --no-digest
```

### 3. run_digest 报"未配置 LLM"
检查 `.env` 里 `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` 是否填写正确。

### 4. 远程 401
确认使用的 `MCP_API_KEY` 与服务端一致，且请求头正确携带 `Authorization: Bearer <key>`。
