"""信源抓取：arXiv / RSS / Google News / HuggingFace。"""
from __future__ import annotations

import datetime as dt
import logging
import time
from dataclasses import dataclass, field

import feedparser
import httpx

logger = logging.getLogger(__name__)

USER_AGENT = "ai4s-daily/1.0 (+https://github.com/ai4s-daily)"


@dataclass
class Article:
    """统一文章条目结构。"""

    title: str
    url: str
    source: str          # 信源类别，如 arxiv / rss / google_news / huggingface
    source_name: str     # 展示名，如 "Nature"
    published: dt.datetime | None = None
    summary: str = ""
    authors: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    publisher: str = ""  # 真实来源站点名（如 "上观新闻"），可为空

    @property
    def date_str(self) -> str:
        return self.published.strftime("%Y-%m-%d") if self.published else ""


def _parse_date(value) -> dt.datetime | None:
    if not value:
        return None
    if isinstance(value, dt.datetime):
        return value
    if isinstance(value, dt.date):
        return dt.datetime.combine(value, dt.time.min)
    try:
        from email.utils import parsedate_to_datetime

        return parsedate_to_datetime(str(value))
    except Exception:
        try:
            return dt.datetime.fromisoformat(str(value)[:19])
        except Exception:
            return None


class BaseCollector:
    """基类：负责统一过滤窗口与限流。"""

    def __init__(self, config: dict, lookback_days: int, per_source_limit: int):
        self.cfg = config
        self.lookback_days = lookback_days
        self.per_source_limit = per_source_limit

    def window_days(self, source: dict) -> int:
        """单个信源可覆盖全局回看窗口（source 内的 days 字段优先）。"""
        return int(source.get("days") or self.lookback_days)

    def in_window(self, published: dt.datetime | None, days: int | None = None) -> bool:
        if published is None:
            return True
        cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days or self.lookback_days)
        if published.tzinfo is None:
            published = published.replace(tzinfo=dt.timezone.utc)
        return published >= cutoff

    def collect(self) -> list[Article]:
        raise NotImplementedError


class ArxivCollector(BaseCollector):
    """通过 arXiv API 抓取。https://export.arxiv.org/api/query"""

    API = "https://export.arxiv.org/api/query"

    def collect(self) -> list[Article]:
        items: list[Article] = []
        for source in self.cfg.get("arxiv", []):
            name = source.get("name", "arXiv")
            query = source.get("query", "")
            days = self.window_days(source)
            if not query:
                continue
            try:
                feed = self._query_with_retry(query)
            except Exception as exc:
                logger.warning("arXiv 抓取失败 [%s]: %s", name, exc)
                continue
            for entry in feed.get("entries", [])[: self.per_source_limit]:
                published = _parse_date(entry.get("published"))
                if not self.in_window(published, days):
                    continue
                authors = [a.get("name", "") for a in entry.get("authors", [])][:8]
                items.append(
                    Article(
                        title=entry.get("title", "").replace("\n", " ").strip(),
                        url=entry.get("link", ""),
                        source="arxiv",
                        source_name=name,
                        published=published,
                        summary=entry.get("summary", "").replace("\n", " ").strip(),
                        authors=authors,
                        tags=entry.get("tags", []) if isinstance(entry.get("tags"), list) else [],
                    )
                )
            # arXiv 官方建议请求间隔 ≥ 3 秒
            time.sleep(3)
            logger.info("arXiv [%s]: 完成", name)
        return items

    def _query_with_retry(self, query: str, retries: int = 4) -> dict:
        """arXiv 对并发/高频请求限流较严，串行 + 间隔 + 退避重试。"""
        last_exc: Exception | None = None
        for attempt in range(retries):
            try:
                feed = self._query(query)
                return feed
            except httpx.HTTPStatusError as exc:
                last_exc = exc
                if exc.response.status_code in (429, 503):
                    # 优先尊重 Retry-After，否则按 3 秒起退避
                    delay = 3 + attempt * 5
                    try:
                        ra = exc.response.headers.get("Retry-After")
                        if ra:
                            delay = max(int(float(ra)), 3)
                    except (ValueError, TypeError):
                        pass
                    logger.info("arXiv 限流(%s)，%ds 后重试…", exc.response.status_code, delay)
                    time.sleep(delay)
                    continue
                raise
        raise last_exc  # type: ignore[misc]

    def _query(self, query: str) -> dict:
        params = {
            "search_query": query,
            "start": 0,
            "max_results": self.per_source_limit + 5,
            "sortBy": "submittedDate",
            "sortOrder": "descending",
        }
        with httpx.Client(timeout=90, headers={"User-Agent": USER_AGENT}) as client:
            resp = client.get(self.API, params=params)
            resp.raise_for_status()
        return feedparser.parse(resp.content)


class RssCollector(BaseCollector):
    """抓取标准 RSS/Atom 源。"""

    def collect(self) -> list[Article]:
        items: list[Article] = []
        for source in self.cfg.get("rss", []):
            name = source.get("name", "RSS")
            url = source.get("url", "")
            if not url:
                continue
            try:
                with httpx.Client(timeout=30, headers={"User-Agent": USER_AGENT}) as client:
                    resp = client.get(url)
                    resp.raise_for_status()
                feed = feedparser.parse(resp.content)
            except Exception as exc:
                logger.warning("RSS 抓取失败 [%s]: %s", name, exc)
                continue
            n = 0
            for entry in feed.get("entries", [])[: self.per_source_limit]:
                published = _parse_date(entry.get("published") or entry.get("updated"))
                if not self.in_window(published):
                    continue
                items.append(
                    Article(
                        title=entry.get("title", "").strip(),
                        url=entry.get("link", "").strip(),
                        source="rss",
                        source_name=name,
                        published=published,
                        summary=entry.get("summary", "").strip(),
                    )
                )
                n += 1
            logger.info("RSS [%s]: %d 条", name, n)
        return items


class GoogleNewsCollector(BaseCollector):
    """通过 Google News RSS（中文）抓取，q 为搜索词。"""

    BASE = "https://news.google.com/rss/search"

    def collect(self) -> list[Article]:
        items: list[Article] = []
        for source in self.cfg.get("google_news", []):
            name = source.get("name", "中文科技")
            q = source.get("q", "")
            if not q:
                continue
            params = {
                "q": f"{q} when:{(self.lookback_days or 1)}d",
                "hl": "zh-CN",
                "gl": "CN",
                "ceid": "CN:zh-Hans",
            }
            try:
                with httpx.Client(timeout=30, headers={"User-Agent": USER_AGENT}) as client:
                    resp = client.get(self.BASE, params=params)
                    resp.raise_for_status()
                feed = feedparser.parse(resp.content)
            except Exception as exc:
                logger.warning("Google News 抓取失败 [%s]: %s", name, exc)
                continue
            n = 0
            for entry in feed.get("entries", [])[: self.per_source_limit]:
                published = _parse_date(entry.get("published") or entry.get("updated"))
                if not self.in_window(published):
                    continue
                link = entry.get("link", "")
                publisher = ""
                publisher_domain = ""
                src = entry.get("source") or {}
                if isinstance(src, dict):
                    publisher = str(src.get("title") or "").strip()
                    publisher_domain = _hostname(str(src.get("href") or ""))
                # source.title 有时本身就是域名，统一走友好化映射
                display_name = friendly_domain(publisher) or friendly_domain(publisher_domain) or name
                items.append(
                    Article(
                        title=entry.get("title", "").strip(),
                        url=link,
                        source="google_news",
                        source_name=name,
                        published=published,
                        summary=entry.get("summary", "").strip(),
                        publisher=display_name,
                    )
                )
                n += 1
            logger.info("Google News [%s]: %d 条", name, n)
        return items


def _hostname(url: str) -> str:
    """提取 URL 域名（去掉 www.）。"""
    from urllib.parse import urlsplit

    if not url:
        return ""
    host = urlsplit(url).netloc
    return host[4:] if host.startswith("www.") else host


# 常见中文站点域名 → 可读名称映射（用于摘要卡片来源显示）
_DOMAIN_NAMES = {
    "sohu.com": "搜狐",
    "news.futunn.com": "富途牛牛",
    "futunn.com": "富途牛牛",
    "sina.com.cn": "新浪",
    "163.com": "网易",
    "qq.com": "腾讯新闻",
    "ifeng.com": "凤凰网",
    "cnbeta.com": "cnBeta",
    "36kr.com": "36氪",
    "jiqizhixin.com": "机器之心",
    "qbitai.com": "量子位",
    "leiphone.com": "雷峰网",
    "ithome.com": "IT之家",
    "zhuanlan.zhihu.com": "知乎专栏",
    "zhihu.com": "知乎",
    "weibo.com": "微博",
    "dw.com": "德国之声",
    "yeeyi.com": "亿忆网",
    "csdn.net": "CSDN",
    "blog.csdn.net": "CSDN",
    "sciencenet.cn": "科学网",
}


def friendly_domain(host: str) -> str:
    """把域名/来源名映射为可读站点名；未知域名原样返回。"""
    if not host:
        return ""
    # 容错：去除协议、路径、空格
    h = host.strip()
    for prefix in ("https://", "http://", "www."):
        if h.startswith(prefix):
            h = h[len(prefix):]
    h = h.split("/")[0].split("?")[0].strip()
    return _DOMAIN_NAMES.get(h, host)


def _unwrap_google_news(url: str) -> str:
    """把 Google News 跳转链接还原成原文链接（如可提取）。"""
    from urllib.parse import parse_qs, urlsplit

    q = parse_qs(urlsplit(url).query)
    if "url" in q:
        return q["url"][0]
    return url


class HuggingFaceCollector(BaseCollector):
    """通过 HF API 抓取最近更新的模型。可扩展数据集/论文。"""

    def collect(self) -> list[Article]:
        if not self.cfg.get("huggingface", {}).get("enabled", False):
            return []
        limit = self.cfg.get("huggingface", {}).get("limit_per_page", 20)
        items: list[Article] = []
        try:
            with httpx.Client(timeout=30, headers={"User-Agent": USER_AGENT}) as client:
                resp = client.get(
                    "https://huggingface.co/api/models",
                    params={"sort": "lastModified", "direction": "-1", "limit": limit},
                )
                resp.raise_for_status()
                models = resp.json()
        except Exception as exc:
            logger.warning("HuggingFace 抓取失败: %s", exc)
            return items
        for m in models[: self.per_source_limit]:
            published = _parse_date(m.get("lastModified"))
            if not self.in_window(published):
                continue
            items.append(
                Article(
                    title=m.get("id", ""),
                    url=f"https://huggingface.co/{m.get('id', '')}",
                    source="huggingface",
                    source_name="HuggingFace 热门模型",
                    published=published,
                    summary=m.get("description", "") or "",
                    tags=[m.get("pipeline_tag", "")] if m.get("pipeline_tag") else [],
                )
            )
        logger.info("HuggingFace: %d 条", len(items))
        return items


def collect_all(config: dict) -> list[Article]:
    """依次运行所有启用的收集器，返回合并后的文章列表。

    可通过环境变量 A4S_DISABLE 禁用部分信源，逗号分隔，例如：
        A4S_DISABLE=arxiv,rss python main.py
    """
    import os

    lookback = int(config.get("lookback_days", 1))
    limit = int(config.get("per_source_limit", 15))
    disabled = {s.strip() for s in os.getenv("A4S_DISABLE", "").split(",") if s.strip()}

    collectors: list[tuple[str, BaseCollector]] = [
        ("arxiv", ArxivCollector(config, lookback, limit)),
        ("rss", RssCollector(config, lookback, limit)),
        ("google_news", GoogleNewsCollector(config, lookback, limit)),
        ("huggingface", HuggingFaceCollector(config, lookback, limit)),
    ]

    all_items: list[Article] = []
    for key, collector in collectors:
        if key in disabled:
            logger.info("已禁用信源: %s", key)
            continue
        all_items.extend(collector.collect())
    return all_items
