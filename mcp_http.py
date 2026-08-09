"""MCP Server HTTP 启动器（带 Bearer token 认证，防第三方爬取）。

部署到 VPS 时用此方式启动，配合 Caddy/Nginx 反代对外提供服务。

用法：
    MCP_API_KEY=secret python mcp_http.py --host 127.0.0.1 --port 8000
"""
from __future__ import annotations

import argparse
import logging
import os

import uvicorn
from starlette.middleware import Middleware
from starlette.responses import JSONResponse

from mcp_server import mcp

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class BearerAuthMiddleware:
    """校验 Authorization: Bearer <token>，未授权返回 401。"""

    def __init__(self, app, api_key: str):
        self.app = app
        self.api_key = api_key

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # 允许 GET 到根路径（健康检查）
        if scope["method"] == "GET" and scope.get("path") in ("/", "/health"):
            await self.app(scope, receive, send)
            return

        if not self.api_key:
            # 未配置 key：拒绝（安全默认）
            resp = JSONResponse({"error": "MCP_API_KEY 未配置"}, status_code=500)
            await resp(scope, receive, send)
            return

        headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
        auth = headers.get("authorization", "")
        if auth != f"Bearer {self.api_key}":
            resp = JSONResponse({"error": "未授权"}, status_code=401)
            await resp(scope, receive, send)
            return
        await self.app(scope, receive, send)


def main() -> None:
    parser = argparse.ArgumentParser(description="AI4S MCP HTTP (带认证)")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--mount", default="/", help="挂载路径，默认 /")
    args = parser.parse_args()

    api_key = os.getenv("MCP_API_KEY", "").strip()
    if not api_key:
        logger.error("必须设置环境变量 MCP_API_KEY")
        raise SystemExit(1)

    # FastMCP 的 streamable_http_app 生成 Starlette app
    app = mcp.streamable_http_app()
    # 直接给 FastMCP 的 Starlette app 叠加认证中间件（保留其 lifespan）
    from starlette.middleware import Middleware

    app.user_middleware.append(Middleware(lambda a: BearerAuthMiddleware(a, api_key)))
    app.middleware_stack = None  # 强制重建中间件栈

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
