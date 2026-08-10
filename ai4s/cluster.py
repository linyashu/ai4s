"""信源聚类、热点评分与内容分类。

- cluster_articles：将同一事件的多篇报道聚合成一个 cluster（去重）
- score_hotness：按信源数量/时效/权威度计算热度
- classify_article：将条目分类为 模型/论文/行业/教程/观点
"""
from __future__ import annotations

import datetime as dt
import logging
import re
from collections import Counter
from dataclasses import dataclass, field

from .collectors import Article

logger = logging.getLogger(__name__)

CATEGORIES = ["模型", "论文", "行业", "教程", "观点"]

# 内容分类关键词规则
_CATEGORY_KEYWORDS = {
    "模型": [
        "模型", "发布", "开源", "权重", "API", "gpt", "claude", "gemini", "llama",
        "deepseek", "qwen", "kimi", "通义", "豆包", "文心", "moonshot", "mistral",
        "字节", "智谱", "glm", "参数", "多模态", "上下文", "inference", "训练",
    ],
    "论文": [
        "论文", "arxiv", "研究", "benchmark", "基准", "评测", "评估", "消融",
        "实验", "数据集", "论文发表", "nature", "science", "预印本", "scaling",
        "对齐", "微调", "强化学习", "rl", "sft", "蒸馏",
    ],
    "行业": [
        "融资", "上市", "收购", "战略", "营收", "市场", "企业", "公司", "商业化",
        "监管", "政策", "专利", "诉讼", "合作", "投资", "纳斯达克", "股价",
        "量子", "机器人", "芯片", "gpu", "英伟达", "nvidia", "云计算", "招聘",
    ],
    "教程": [
        "教程", "指南", "上手", "实践", "部署", "示例", "tutorial", "how-to",
        "如何", "配置", "安装", "入门", "踩坑", "手把手", "代码", "github",
    ],
    "观点": [
        "观点", "评论", "反思", "解读", "分析", "展望", "趋势", "op-ed",
        "opinion", "批评", "质疑", "争论", "思考", "洞察", "访谈", "作者说",
    ],
}

# 权威信源（用于热度加权）
_AUTHORITY_SOURCES = {
    "Nature", "Science", "Nature Machine Intelligence", "DeepMind Blog",
    "MIT Technology Review", "The Verge AI", "Epoch AI", "Artificial Analysis",
    "The Verge", "TechCrunch", "Ars Technica", "Hacker News",
}


@dataclass
class Cluster:
    """同一事件的合并簇。"""

    key: str                    # 规范化标题 key（去停用词）
    title: str                  # 代表性标题（最短/最早）
    url: str                    # 代表链接
    articles: list[Article] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)   # 信源名列表
    publishers: list[str] = field(default_factory=list)  # 站点名列表
    categories: set[str] = field(default_factory=set)
    heat: int = 0

    @property
    def published(self) -> dt.datetime | None:
        """簇内最早发布时间。"""
        times = [a.published for a in self.articles if a.published]
        return min(times) if times else None

    @property
    def date_str(self) -> str:
        return self.published.strftime("%Y-%m-%d") if self.published else ""

    @property
    def source_count(self) -> int:
        return len(self.articles)

    @property
    def top_category(self) -> str:
        return max(self.categories, key=lambda c: -len(self.categories)) if self.categories else ""

    def merge(self, article: Article) -> None:
        self.articles.append(article)
        if article.source_name:
            self.sources.append(article.source_name)
        if article.publisher:
            self.publishers.append(article.publisher)
        for c in classify_article(article):
            self.categories.add(c)


def _normalize_title(title: str) -> str:
    """标题规范化：去标点、小写、去停用词，用于相似度匹配。"""
    if not title:
        return ""
    t = title.lower()
    t = re.sub(r"[-–—_—:：|·,，。.!！?？()（）\[\]{}<>《》\"'“”‘’/\\+\-]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    # 去除常见噪音词（媒体后缀、来源标记）
    noise = [
        r"\b(the|a|an|of|for|and|or|in|on|to|with|by|at|from|new|发布|推出|上线)\b",
        r"[- ][-0-9]*\b",                    # 版本号片段
    ]
    for pat in noise:
        t = re.sub(pat, " ", t)
    return re.sub(r"\s+", " ", t).strip()


def _similarity(a: str, b: str) -> float:
    """字符 n-gram Jaccard 相似度（对中英文都鲁棒）。"""
    ta, tb = _normalize_title(a), _normalize_title(b)
    if not ta or not tb:
        return 0.0
    # 用 bigram + 词集合双重特征
    def feats(s: str) -> set[str]:
        f = set(s[i:i + 2] for i in range(len(s) - 1)) if len(s) > 1 else {s}
        f.update(s.split())
        return f
    fa, fb = feats(ta), feats(tb)
    inter = fa & fb
    union = fa | fb
    if not union:
        return 0.0
    return len(inter) / len(union)


# 核心实体关键词（模型名/公司/高频事件词），用于事件级匹配
_CORE_ENTITIES = [
    "gpt", "claude", "gemini", "deepseek", "qwen", "通义", "kimi", "moonshot",
    "llama", "mistral", "muse", "glimmer", "spark", "openai", "anthropic",
    "google", "deepmind", "meta", "微软", "阿里", "字节", "百度", "腾讯",
    "豆包", "智谱", "glm", "auto mode", "claude code", "agent", "智能体",
    "机器人", "hugging face", "开源", "发布", "上新", "榜单", "排行榜",
    "融资", "上市", "收购", "禁用", "封锁", "安全", "漏洞",
    "创世纪", "科研大模型", "里程碑", "数据收集", "实验室", "模型",
    "ai4s", "ai for science", "科学发现", "智能体", "agent", "评测", "基准",
]


def _extract_entities(title: str) -> set[str]:
    """提取标题中的核心实体（小写）。"""
    t = title.lower()
    hits = set()
    for ent in _CORE_ENTITIES:
        if ent in t:
            hits.add(ent)
    return hits


def _event_match(a: str, b: str) -> bool:
    """事件级匹配：核心实体重叠 ≥2 个（或共现 1 个强实体 + 相似度>0.3）。"""
    ea, eb = _extract_entities(a), _extract_entities(b)
    inter = ea & eb
    if len(inter) >= 2:
        return True
    # 单个强实体（模型名/公司）重合且有一定标题相似
    if len(inter) == 1 and _similarity(a, b) > 0.30:
        return True
    return False


def cluster_articles(articles: list[Article], threshold: float = 0.55) -> list[Cluster]:
    """将文章按标题相似度聚类。同一事件多篇报道合并为一个 Cluster。

    threshold 为 Jaccard 相似度阈值；仅对同一 source 类别（如 google_news）聚合，
    避免把不同信源类别的不同文章误合并。
    """
    clusters: list[Cluster] = []
    # 先按 source 类别分组（跨类别不聚合，保持 arXiv/RSS/新闻 独立）
    by_source: dict[str, list[Article]] = {}
    for a in articles:
        by_source.setdefault(a.source, []).append(a)

    for source, items in by_source.items():
        # 只对可能重复的类别做聚合（新闻类），arXiv/HF 标题一般独立
        if source not in ("google_news", "rss"):
            for a in items:
                clusters.append(Cluster(key=_normalize_title(a.title), title=a.title, url=a.url, articles=[a]))
            continue

        for a in items:
            best = None
            best_sim = 0.0
            for cl in clusters:
                if a.source != (cl.articles[0].source if cl.articles else ""):
                    continue
                # 事件级匹配（实体重叠）或高相似度
                if _event_match(a.title, cl.title) or _similarity(a.title, cl.title) >= threshold:
                    sim = _similarity(a.title, cl.title)
                    if sim > best_sim:
                        best, best_sim = cl, sim
            if best:
                # 保留更短/更新的标题作代表
                best.merge(a)
                if len(a.title) < len(best.title):
                    best.title = a.title
                    best.url = a.url
                best.key = _normalize_title(best.title)
            else:
                clusters.append(Cluster(
                    key=_normalize_title(a.title), title=a.title, url=a.url, articles=[a],
                ))
                clusters[-1].merge(a)  # 记录自身 source/publisher
    return clusters


def score_hotness(
    cluster: Cluster,
    now: dt.datetime | None = None,
    base_heat: int = 10,
    per_source: int = 5,
    time_decay_hours: float = 24.0,
) -> int:
    """计算 cluster 热度：信源数 + 时效 + 权威度。"""
    now = now or dt.datetime.now(dt.timezone.utc)
    heat = base_heat

    # 信源数量：每多一家信源加分
    heat += per_source * (cluster.source_count - 1)

    # 权威信源加权
    for s in cluster.sources:
        if s in _AUTHORITY_SOURCES:
            heat += 8

    # 时效衰减：越旧越低
    pub = cluster.published
    if pub:
        if pub.tzinfo is None:
            pub = pub.replace(tzinfo=dt.timezone.utc)
        age_h = max(0.0, (now - pub).total_seconds() / 3600)
        decay = max(0.0, 1.0 - age_h / (time_decay_hours * 2))
        heat += int(20 * decay)

    # 代表标题关键词加权（模型名/重要术语）
    title = _normalize_title(cluster.title)
    for kw in ("gpt", "claude", "gemini", "deepseek", "qwen", "kimi", "openai", "anthropic", "meta"):
        if kw in title:
            heat += 3
            break
    return heat


def classify_article(article: Article) -> list[str]:
    """规则分类，可能命中多个类别。"""
    text = f"{article.title} {article.summary or ''}".lower()
    hits = []
    for cat, kws in _CATEGORY_KEYWORDS.items():
        if any(kw in text for kw in kws):
            hits.append(cat)
    return hits or ["行业"]


def classify_clusters(clusters: list[Cluster]) -> dict[str, list[Cluster]]:
    """将 clusters 按类别分组。每簇归入最匹配的类别。

    教程/观点为强信号类别（标题含'教程/指南/如何'等词时优先判定），
    避免被模型/论文类的大量关键词淹没。
    """
    grouped: dict[str, list[Cluster]] = {c: [] for c in CATEGORIES}
    for cl in clusters:
        text = cl.title
        if cl.articles:
            text = f"{cl.title} {cl.articles[0].summary or ''}"
        text = text.lower()
        cats = list(cl.categories)
        if not cats:
            cats = classify_article(cl.articles[0]) if cl.articles else ["行业"]
        # 强信号类别优先
        strong = {"教程", "观点"}
        for cat in strong:
            if cat in cats:
                grouped[cat].append(cl)
                break
        else:
            # 其余按关键词匹配数
            cat = max(cats, key=lambda c: -sum(
                1 for kw in _CATEGORY_KEYWORDS[c] if kw in text
            ))
            grouped[cat].append(cl)
    return grouped


def finalize_clusters(clusters: list[Cluster], now: dt.datetime | None = None) -> list[Cluster]:
    """计算热度并排序。"""
    now = now or dt.datetime.now(dt.timezone.utc)
    for cl in clusters:
        cl.heat = score_hotness(cl, now)
    # 去重 sources/publishers
    for cl in clusters:
        cl.sources = list(dict.fromkeys(cl.sources))
        cl.publishers = list(dict.fromkeys(cl.publishers))
    return sorted(clusters, key=lambda c: c.heat, reverse=True)
