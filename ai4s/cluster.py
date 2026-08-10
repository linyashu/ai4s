"""新闻同事件聚类去重（仅去重，不改变其他渲染）。

将同一事件的多个媒体报道合并为一个 Cluster，展示时用一张卡片
+ 多家来源标签，避免列表重复。
"""
from __future__ import annotations

import datetime as dt
import logging
import re
from dataclasses import dataclass, field

from .collectors import Article

logger = logging.getLogger(__name__)


@dataclass
class Cluster:
    """同一事件的合并簇。"""

    title: str                  # 代表性标题（最短）
    url: str                    # 代表链接
    articles: list[Article] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)   # 去重后的来源名
    publishers: list[str] = field(default_factory=list)  # 去重后的站点名

    @property
    def published(self) -> dt.datetime | None:
        times = [a.published for a in self.articles if a.published]
        return min(times) if times else None

    @property
    def date_str(self) -> str:
        return self.published.strftime("%Y-%m-%d") if self.published else ""

    @property
    def source_count(self) -> int:
        return len(self.articles)

    def add(self, article: Article) -> None:
        self.articles.append(article)
        if article.source_name:
            self.sources.append(article.source_name)
        if article.publisher:
            self.publishers.append(article.publisher)
        # 取更短的标题作代表
        if len(article.title) < len(self.title):
            self.title = article.title
            self.url = article.url


def _normalize_title(title: str) -> str:
    if not title:
        return ""
    t = title.lower()
    t = re.sub(r"[-–—_—:：|·,，。.!！?？()（）\[\]{}<>《》\"'“”‘’/\\+\-]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    for pat in [r"\b(the|a|an|of|for|and|or|in|on|to|with|by|at|from|new|发布|推出|上线)\b"]:
        t = re.sub(pat, " ", t)
    return re.sub(r"\s+", " ", t).strip()


# 核心实体（模型名/公司/事件词），用于事件级匹配
_CORE_ENTITIES = [
    "gpt", "claude", "gemini", "deepseek", "qwen", "通义", "kimi", "moonshot",
    "llama", "mistral", "muse", "glimmer", "openai", "anthropic", "google",
    "deepmind", "meta", "微软", "阿里", "字节", "百度", "腾讯", "豆包", "智谱",
    "glm", "claude code", "智能体", "机器人", "hugging face", "开源", "发布",
    "榜单", "排行榜", "融资", "上市", "收购", "禁用", "封锁", "安全", "漏洞",
    "创世纪", "科研大模型", "里程碑", "agent", "评测", "基准",
]


def _entities(title: str) -> set[str]:
    t = title.lower()
    return {e for e in _CORE_ENTITIES if e in t}


def _similarity(a: str, b: str) -> float:
    """字符 bigram + 词集合 Jaccard 相似度。"""
    ta, tb = _normalize_title(a), _normalize_title(b)
    if not ta or not tb:
        return 0.0

    def feats(s: str) -> set[str]:
        f = set(s[i:i + 2] for i in range(len(s) - 1)) if len(s) > 1 else {s}
        f.update(s.split())
        return f

    fa, fb = feats(ta), feats(tb)
    union = fa | fb
    return len(fa & fb) / len(union) if union else 0.0


def _event_match(a: str, b: str) -> bool:
    """事件级匹配：核心实体重叠 ≥2，或重叠 1 个且标题相似度>0.30。"""
    ea, eb = _entities(a), _entities(b)
    inter = ea & eb
    if len(inter) >= 2:
        return True
    if len(inter) == 1 and _similarity(a, b) > 0.30:
        return True
    return False


def cluster_articles(articles: list[Article], threshold: float = 0.55) -> list[Cluster]:
    """将同一事件的多篇报道聚合成簇。仅聚合新闻类（source=google_news）。"""
    clusters: list[Cluster] = []
    for a in articles:
        if a.source != "google_news":
            # 非新闻类单篇成簇（保持独立）
            clusters.append(Cluster(title=a.title, url=a.url, articles=[a]))
            clusters[-1].sources.append(a.source_name)
            if a.publisher:
                clusters[-1].publishers.append(a.publisher)
            continue
        best = None
        best_sim = 0.0
        for cl in clusters:
            if cl.articles and a.source != cl.articles[0].source:
                continue
            if _event_match(a.title, cl.title) or _similarity(a.title, cl.title) >= threshold:
                sim = _similarity(a.title, cl.title)
                if sim > best_sim:
                    best, best_sim = cl, sim
        if best:
            best.add(a)
        else:
            clusters.append(Cluster(title=a.title, url=a.url, articles=[a]))
            clusters[-1].sources.append(a.source_name)
            if a.publisher:
                clusters[-1].publishers.append(a.publisher)
    # 去重 sources/publishers
    for cl in clusters:
        cl.sources = list(dict.fromkeys([s for s in cl.sources if s]))
        cl.publishers = list(dict.fromkeys([p for p in cl.publishers if p]))
    return clusters
