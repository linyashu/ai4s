# MCP Server 部署与客户端配置

AI4S 知识库 MCP Server，让 Claude Code / opencode / codex / kimi-code 等
客户端查询与调用 AI4S 知识库。

## 快速开始（本地 stdio）

```bash
# 本地直接跑，不暴露网络端口，第三方无法访问
.venv/bin/python mcp_server.py --transport stdio
```

### Claude Code 配置

编辑 `~/.claude.json` 或项目 `.mcp.json`：

```json
{
  "mcpServers": {
    "ai4s-kb": {
      "command": "/path/to/ai4s-daily/.venv/bin/python",
      "args": ["/path/to/ai4s-daily/mcp_server.py", "--transport", "stdio"],
      "env": {
        "AI4S_KB_DIR": "/path/to/ai4s-daily/kb"
      }
    }
  }
}
```

### opencode 配置

编辑 `opencode.json`：

```json
{
  "mcp": {
    "ai4s-kb": {
      "type": "local",
      "command": ["/path/to/ai4s-daily/.venv/bin/python", "/path/to/ai4s-daily/mcp_server.py", "--transport", "stdio"],
      "environment": {
        "AI4S_KB_DIR": "/path/to/ai4s-daily/kb"
      }
    }
  }
}
```

### codex 配置

codex 使用原生 MCP（`.codex/config.toml`）：
```toml
[mcp_servers.ai4s-kb]
command = "/path/to/ai4s-daily/.venv/bin/python"
args = ["/path/to/ai4s-daily/mcp_server.py", "--transport", "stdio"]
env = { AI4S_KB_DIR = "/path/to/ai4s-daily/kb" }
```

### kimi-code / 其他支持 stdio 的客户端

参考 Claude Code 配置：`command` 指向 `.venv/bin/python`，
`args` 为 `[mcp_server.py, --transport, stdio]`。

## 远程调用 VPS 上的知识库（Streamable HTTP + 认证）

数据存在 VPS 上，本地通过 MCP HTTP 远程调用。安全模型：

- 服务端启动时要求 `MCP_API_KEY`
- 所有请求必须带 `Authorization: Bearer <key>`，否则 401
- 建议用 Caddy/Nginx 反代并开启 TLS

### 服务端（VPS）启动

```bash
# 项目目录下
MCP_API_KEY=你的长随机密钥 .venv/bin/python mcp_http.py --host 127.0.0.1 --port 8000
```

### Caddy 反代（推荐，自动 HTTPS）

```caddyfile
mcp.example.com {
    reverse_proxy 127.0.0.1:8000
}
```

认证已由应用层（BearerAuthMiddleware）处理，Caddy 无需再加，
双重保护可选加 `basic_auth`。

### 本地客户端配置

#### Claude Code（远程）

```json
{
  "mcpServers": {
    "ai4s-kb": {
      "type": "http",
      "url": "https://mcp.example.com/mcp",
      "headers": {
        "Authorization": "Bearer 你的key"
      }
    }
  }
}
```

#### opencode（远程）

```json
{
  "mcp": {
    "ai4s-kb": {
      "type": "remote",
      "url": "https://mcp.example.com/mcp",
      "headers": {
        "Authorization": "Bearer 你的key"
      },
      "enabled": true
    }
  }
}
```

## 提供的工具

| 工具 | 说明 |
|---|---|
| `list_snapshots(source)` | 列出 ai4s / eval 的可用存档 |
| `query_kb(source, since, until, keywords)` | 按时间/关键词查询，返回 JSON |
| `export_markdown(source, since, until, keywords)` | 导出 Markdown 喂 LLM |
| `run_digest(source, since, until, keywords)` | 直接用 LLM 分析历史数据，返回简报 |

## 安全说明

- **本地 stdio**：纯进程管道，不监听端口，天然防爬取
- **远程 HTTP**：必须 `MCP_API_KEY` + Bearer 认证；建议 TLS + 反代
- 不开启 CORS 跨域，浏览器/页面无法直接调用
- 工具只读知识库数据，不暴露服务器其他文件
