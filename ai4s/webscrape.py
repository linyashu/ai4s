"""统一网页抓取层：支持 Firecrawl 与 Jina Reader 双后端。

- Firecrawl：真实无头浏览器渲染，对 JS 动态加载的 SPA 页面（如 OpenCompass 司南）稳定
- Jina Reader：轻量、免费，适合普通文章正文提取

选择逻辑：配置了 FIRECRAWL_API_KEY 时优先用 Firecrawl，失败回退 Jina。
"""
from __future__ import annotations

import logging
import os
import re

import httpx

logger = logging.getLogger(__name__)

JINA_READER = "https://r.jina.ai/"
FIRECRAWL_API = "https://api.firecrawl.dev/v1/scrape"


def _firecrawl_headers() -> dict[str, str] | None:
    key = os.getenv("FIRECRAWL_API_KEY", "").strip()
    return {"Authorization": f"Bearer {key}"} if key else None


def _jina_headers() -> dict[str, str]:
    headers = {"X-Return-Format": "markdown"}
    key = os.getenv("JINA_API_KEY", "").strip()
    if key:
        headers["Authorization"] = f"Bearer {key}"
    return headers


def fetch_markdown(url: str, timeout: int = 90, render_timeout: int = 0) -> str:
    """抓取页面并返回 markdown 文本。

    render_timeout > 0 时用于 SPA 页面（等待 JS 渲染）。
    优先 Firecrawl（若配置 key），否则 Jina Reader。
    """
    fc = _firecrawl_headers()
    if fc:
        try:
            return _firecrawl(url, fc, timeout, render_timeout)
        except Exception as exc:
            logger.warning("Firecrawl 抓取失败回退 Jina [%s]: %s", url[:60], exc)
    return _jina(url, timeout, render_timeout)


def _firecrawl(url: str, headers: dict[str, str], timeout: int, render_timeout: int) -> str:
    """调用 Firecrawl /v1/scrape，返回 markdown。

    render_timeout > 0 时用 waitFor 毫秒等待 JS 渲染完成（应对 SPA 动态数据）。
    """
    body: dict = {"url": url, "formats": ["markdown"]}
    if render_timeout > 0:
        body["waitFor"] = int(render_timeout) * 1000
    with httpx.Client(timeout=timeout) as client:
        resp = client.post(FIRECRAWL_API, json=body, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    if not data.get("success"):
        raise RuntimeError(f"Firecrawl 返回未成功: {str(data)[:200]}")
    md = data.get("data", {}).get("markdown", "")
    if not md:
        raise RuntimeError("Firecrawl 返回空 markdown")
    return md


def _jina(url: str, timeout: int, render_timeout: int) -> str:
    headers = _jina_headers()
    if render_timeout > 0:
        headers["X-Timeout"] = str(render_timeout)
    with httpx.Client(timeout=timeout) as client:
        resp = client.get(JINA_READER + url, headers=headers)
        resp.raise_for_status()
    return resp.text


def fetch_fulltext(url: str, timeout: int = 60) -> str:
    """抓取单篇文章全文，返回 markdown 正文。失败返回空串。"""
    if not url:
        return ""
    try:
        text = fetch_markdown(url, timeout=timeout)
    except Exception as exc:
        logger.warning("全文抓取失败 [%s]: %s", url[:60], exc)
        return ""
    # 只保留 Markdown Content 之后的部分（去掉 Jina 的 header）
    idx = text.find("Markdown Content")
    content = text[idx + len("Markdown Content"):] if idx >= 0 else text
    return _clean(content)


def _clean(md: str) -> str:
    """清理全文中的噪声：连续空行、孤立导航链接等。"""
    if not md:
        return ""
    md = re.sub(r"\n{3,}", "\n\n", md)
    md = re.sub(r"^\s*\[(Image|Video|Audio)\d*\]", "", md, flags=re.M)
    return md.strip()
