"""全文抓取：把文章 URL 转为可读全文 markdown（底层走 webscrape 双后端）。

全文抓取走 Firecrawl（若配置 key）或 Jina Reader。
"""
from __future__ import annotations

import logging
import time

from .webscrape import fetch_fulltext

logger = logging.getLogger(__name__)


def fetch_fulltext_batch(
    urls: list[tuple[str, str]],  # (title, url)
    max_items: int = 12,
    delay: float = 1.0,
    max_chars: int = 20000,
) -> dict[str, str]:
    """批量抓取全文。返回 {url: 全文}，串行并限流。

    每篇全文截断到 max_chars 字符，避免浪费 token。自动按 URL 去重。
    """
    result: dict[str, str] = {}
    seen_urls: set[str] = set()
    for title, url in urls[:max_items]:
        if not url or url in seen_urls:
            continue
        seen_urls.add(url)
        text = fetch_fulltext(url)
        if text:
            if len(text) > max_chars:
                text = text[:max_chars] + "\n……(全文过长已截断)"
            result[url] = text
            logger.info("全文抓取完成 [%s]: %d 字", title[:30], len(text))
        time.sleep(delay)
    return result
