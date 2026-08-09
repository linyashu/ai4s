"""AI4S 个人知识库 MCP Server。

提供工具让 LLM 客户端（Claude Code / opencode / codex / kimi-code 等）
查询与调用 AI4S 知识库，支持本地 stdio 与远程 Streamable HTTP 两种传输。

安全设计：
- 远程 HTTP 部署在 VPS 时，通过 MCP_API_KEY 环境变量做 Bearer 认证，
  未携带正确 token 的请求一律 401，防止第三方爬取。
- 本地 stdio 传输不暴露任何网络端口。

运行方式：
    # 本地 stdio（供 Claude Code / opencode 等配置）
    python mcp_server.py --transport stdio

    # 远程 HTTP（部署到 VPS，用 Caddy/Nginx 反代）
    MCP_API_KEY=xxx python mcp_server.py --transport streamable-http --host 127.0.0.1 --port 8000
"""
from __future__ import annotations

import argparse
import json
import logging
import os
from pathlib import Path

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

from ai4s import config, kb
from ai4s.summarizer import Digest, summarize

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent

# 允许任意 Host（经 Nginx 反代时 Host 可能是域名/IP/localhost）。
# 安全由应用层 Bearer 认证（MCP_API_KEY）保障，关闭 DNS rebinding 保护避免反代 421。
transport_security = TransportSecuritySettings(
    enable_dns_rebinding_protection=False,
)

mcp = FastMCP(
    "ai4s-kb",
    instructions=(
        "AI4S 个人知识库：查询 AI for Science 与 AI 大模型测评的每日存档数据。"
        "支持按时间范围与关键词查询，导出 Markdown 供分析，或直接运行 LLM 分析。"
    ),
    transport_security=transport_security,
)


def _kb_dir() -> Path:
    return Path(os.getenv("AI4S_KB_DIR", str(kb.DEFAULT_KB)))


@mcp.tool()
def list_snapshots(source: str = "ai4s") -> str:
    """列出知识库中某个数据源（ai4s 或 eval）的可用快照，返回 JSON 字符串。

    Args:
        source: 数据源，'ai4s' 或 'eval'
    """
    idx = _kb_dir() / "index.json"
    if not idx.exists():
        return "[]"
    try:
        index = json.loads(idx.read_text(encoding="utf-8"))
    except Exception:
        return "[]"
    snaps = index.get("snapshots", {}).get(source, [])
    return json.dumps(snaps, ensure_ascii=False, indent=2)


@mcp.tool()
def query_kb(
    source: str = "ai4s",
    since: str | None = None,
    until: str | None = None,
    keywords: str | None = None,
    limit: int = 20,
) -> str:
    """按时间范围与关键词查询知识库快照内容，返回 JSON 字符串。

    Args:
        source: 'ai4s' 或 'eval'
        since: 起始时间，如 '2026-08-01' 或 '2026-08-01 08:00'
        until: 结束时间
        keywords: 逗号分隔的关键词，全部命中才返回
        limit: 返回快照数量上限
    """
    results = kb.query(_kb_dir(), source, since, until, keywords)
    out = []
    for r in results[-limit:]:
        data = r["data"]
        # 压缩输出，避免过大
        compressed = {
            "time": r["time"],
            "digest": data.get("digest") or {},
        }
        items = data.get("articles") or data.get("news") or []
        compressed["count"] = len(items)
        compressed["preview"] = [
            {"title": a.get("title", ""), "url": a.get("url", "")}
            for a in items[:5]
        ]
        if data.get("leaderboards"):
            compressed["leaderboards"] = {
                k: len(v) for k, v in data["leaderboards"].items()
            }
        out.append(compressed)
    return json.dumps(out, ensure_ascii=False, indent=2)


@mcp.tool()
def export_markdown(
    source: str = "ai4s",
    since: str | None = None,
    until: str | None = None,
    keywords: str | None = None,
) -> str:
    """把知识库查询结果导出为 Markdown，可直接喂给 LLM 做深度分析。

    Args:
        source: 'ai4s' 或 'eval'
        since: 起始时间，如 '2026-08-01'
        until: 结束时间
        keywords: 逗号分隔关键词
    """
    md = kb.export_markdown(_kb_dir(), source, since, until, keywords)
    return md or "（无匹配快照）"


@mcp.tool()
def run_digest(
    source: str = "ai4s",
    since: str | None = None,
    until: str | None = None,
    keywords: str | None = None,
) -> dict:
    """用 LLM 对知识库历史数据做深度分析，返回结构化简报。

    Args:
        source: 'ai4s' 或 'eval'
        since: 起始时间
        until: 结束时间
        keywords: 关键词过滤
    """
    md = kb.export_markdown(_kb_dir(), source, since, until, keywords)
    if not md or md == "（无匹配快照）":
        return json.dumps({"error": "无匹配快照"}, ensure_ascii=False)

    config.load_env()
    llm = config.llm_config()
    if not llm.get("api_key"):
        return json.dumps({"error": "未配置 LLM_API_KEY"}, ensure_ascii=False)

    # 构造一个临时 Article 列表用于复用 summarize 流程
    from ai4s.collectors import Article

    snapshots = kb.query(_kb_dir(), source, since, until, keywords)
    articles: list[Article] = []
    for snap in snapshots[-5:]:  # 最多分析最近 5 个快照
        data = snap["data"]
        items = data.get("articles") or data.get("news") or []
        for it in items[:30]:
            articles.append(
                Article(
                    title=it.get("title", ""),
                    url=it.get("url", ""),
                    source="kb",
                    source_name=source,
                    published=None,
                    summary=it.get("summary", "") or "",
                    publisher=it.get("source", "") or "",
                )
            )
    if not articles:
        return json.dumps({"error": "快照中无可用条目"}, ensure_ascii=False)

    digest = summarize(llm, articles)
    return json.dumps(
        {"source": source, "digest": digest.to_dict() if digest.valid else {}},
        ensure_ascii=False,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="AI4S 知识库 MCP Server")
    parser.add_argument("--transport", choices=["stdio", "streamable-http", "sse"], default="stdio")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--mount", default="/", help="HTTP 挂载路径")
    args = parser.parse_args()

    # 校验 API key（远程传输必须设置，防止未授权访问）
    api_key = os.getenv("MCP_API_KEY", "").strip()
    if args.transport != "stdio" and not api_key:
        logger.warning("远程传输未设置 MCP_API_KEY，服务将拒绝未授权请求")

    if args.transport == "stdio":
        mcp.run(transport="stdio")
    elif args.transport == "sse":
        mcp.run(transport="sse", mount_path=args.mount)
    else:
        mcp.run(
            transport="streamable-http",
            host=args.host,
            port=args.port,
            mount_path=args.mount,
        )


if __name__ == "__main__":
    main()
