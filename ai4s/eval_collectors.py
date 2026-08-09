"""AI 大模型测评跟踪：排行榜数据 + 测评新闻抓取。

数据源：
- LMArena Text Arena 排行榜（经 Jina Reader 抓取 HTML 表格）
- Artificial Analysis changelog/articles（页面标题）
- Epoch AI RSS / MIT Tech Review / The Verge AI（测评新闻流）
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import re
from dataclasses import dataclass, field

import feedparser
import httpx

from .collectors import Article, _parse_date

logger = logging.getLogger(__name__)

USER_AGENT = "ai4s-daily/1.0 (+https://github.com/ai4s-daily)"


@dataclass
class RankEntry:
    """排行榜条目。字段可随基准不同而省略。"""

    rank: int
    model: str
    score: str = ""
    org: str = ""
    url: str = ""
    # LMArena 专用
    votes: str = ""
    price: str = ""
    context: str = ""
    # AA / LiveBench 专用
    category_scores: dict = field(default_factory=dict)
    # Open LLM Leaderboard 专用
    params: str = ""
    license: str = ""
    arch: str = ""
    extra: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# LMArena 排行榜
# ---------------------------------------------------------------------------

def fetch_lmarena(top_n: int = 10) -> list[RankEntry]:
    """抓取 LMArena (Arena Intelligence) Text Arena 排行榜前 N 名。

    新版站点 lmarena.ai → arena.ai（301 跳转），页面为 Tailwind HTML 表格。
    优先直接解析 HTML；失败则回退 Jina Reader markdown 表格。
    """
    rows = _fetch_lmarena_html(top_n)
    if rows:
        logger.info("LMArena 排行榜: %d 条", len(rows))
        return rows
    rows = _fetch_lmarena_jina(top_n)
    logger.info("LMArena 排行榜: %d 条", len(rows))
    return rows


def _fetch_lmarena_html(top_n: int = 10) -> list[RankEntry]:
    """直接请求 lmarena.ai 并解析新版 HTML 表格。"""
    try:
        with httpx.Client(timeout=90, follow_redirects=True) as client:
            resp = client.get(
                "https://lmarena.ai/leaderboard/text",
                headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"},
            )
            resp.raise_for_status()
        html = resp.text
    except Exception as exc:
        logger.warning("LMArena HTML 抓取失败: %s", exc)
        return []

    trs = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S)
    rows: list[RankEntry] = []
    for tr in trs:
        tds = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
        if len(tds) < 5:
            continue
        try:
            rank = int(_clean_td(tds[0]))
        except (ValueError, TypeError):
            continue
        if rank > top_n:
            break
        # 第三列：模型名在 <a> 内，组织在 <title> 内，描述为 "Org · Proprietary"
        col3 = tds[2]
        a = re.search(r'<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>', col3, re.S)
        model_name = re.sub(r"<[^>]+>", "", a.group(2)).strip() if a else _clean_td(col3)
        model_url = a.group(1) if a else ""
        title = re.search(r"<title>([^<]+)</title>", col3)
        org = title.group(1).strip() if title else ""
        rows.append(
            RankEntry(
                rank=rank,
                model=model_name,
                score=_clean_td(tds[3]),
                votes=_clean_td(tds[4]),
                price=_clean_td(tds[5]) if len(tds) > 5 else "",
                context=_clean_td(tds[6]) if len(tds) > 6 else "",
                org=org,
                url=model_url,
            )
        )
    return rows


def _clean_td(td: str) -> str:
    import html as H

    txt = re.sub(r"<[^>]+>", "", td)
    return H.unescape(txt).strip()


def _extract_lmarena_org(model_cell: str) -> str:
    """从模型单元格提取组织名（如 'Anthropic'）。"""
    m = re.search(r"(Anthropic|OpenAI|Google|Meta|DeepSeek|Moonshot|Alibaba|Microsoft|Mistral AI|Amazon|xAI)", model_cell, re.I)
    return m.group(1) if m else ""


def _fetch_lmarena_jina(top_n: int = 10) -> list[RankEntry]:
    """回退：经 Jina Reader 抓取 markdown 表格（旧版页面）。"""
    try:
        md = _jina_markdown("https://lmarena.ai/leaderboard/text")
        table = _extract_table(md)
    except Exception as exc:
        logger.warning("LMArena Jina 抓取失败: %s", exc)
        return []
    rows: list[RankEntry] = []
    for line in table.splitlines():
        line = line.strip()
        if not line.startswith("|") or "Rank" in line or "---" in line:
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) < 5:
            continue
        try:
            rank = int(cells[0])
        except (ValueError, TypeError):
            continue
        if rank > top_n:
            break
        model_cell = cells[2]
        m = re.search(r"\[([^\]]+)\]\(([^)]+)\)", model_cell)
        model_name = m.group(1) if m else model_cell
        model_url = m.group(2) if m else ""
        org = "Proprietary" if "Proprietary" in model_cell else (
            "Open" if "Open" in model_cell else ""
        )
        rows.append(
            RankEntry(
                rank=rank,
                model=model_name,
                score=cells[3],
                votes=cells[4],
                price=cells[5] if len(cells) > 5 else "",
                context=cells[6] if len(cells) > 6 else "",
                org=org,
                url=model_url,
            )
        )
    return rows


def _extract_table(markdown: str) -> str:
    """从 Jina 返回的 markdown 中提取含 'Rank' 的表块。"""
    lines = markdown.splitlines()
    out: list[str] = []
    in_table = False
    for line in lines:
        if "| Rank" in line or "| Rank |" in line:
            in_table = True
            out.append(line)
            continue
        if in_table:
            if line.strip().startswith("|") or line.strip().startswith("|---"):
                out.append(line)
                if line.strip() == "---" or "| --- |" in line:
                    out.append(line)
            elif line.strip():
                break
    return "\n".join(out)


def _jina_markdown(url: str, timeout: int = 90, render_timeout: int = 0) -> str:
    """抓取页面 markdown。失败抛异常。

    底层走 webscrape 双后端：配置 FIRECRAWL_API_KEY 时优先 Firecrawl
    （真实浏览器渲染，对 SPA 如 OpenCompass 司南更稳定），否则 Jina Reader。
    render_timeout > 0 时等待 JS 渲染。
    """
    from .webscrape import fetch_markdown

    return fetch_markdown(url, timeout=timeout, render_timeout=render_timeout)


def _extract_md_table(markdown: str, header_kw: str) -> list[list[str]]:
    """从 markdown 中提取含指定表头的表格，返回单元格二维列表。

    容错：跳过表头前/后可能出现的空行与重复表头行。
    """
    lines = markdown.splitlines()
    rows: list[list[str]] = []
    found_header = False
    for line in lines:
        line = line.rstrip()
        # 找表头：含关键词且是表格行
        if not found_header and header_kw in line and line.strip().startswith("|"):
            found_header = True
            continue
        if not found_header:
            continue
        # 跳过空行、分隔行、重复表头
        if not line.strip():
            continue
        if not line.strip().startswith("|"):
            break
        if re.match(r"^\|[\s\-|:]+\|?$", line):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if not cells:
            continue
        # 跳过重复表头行
        if cells[0].lower() == "rank" or (cells[0] == "" and "模型" in "|".join(cells)):
            continue
        rows.append(cells)
        # 碰到表格结束（下一个非表格内容前的连续表格结束）
    return rows
    return rows


# ---------------------------------------------------------------------------
# Artificial Analysis Intelligence Index 排行榜
# ---------------------------------------------------------------------------

def fetch_aa_index(top_n: int = 10) -> list[RankEntry]:
    """抓取 Artificial Analysis Intelligence Index 排行榜。"""
    try:
        md = _jina_markdown("https://artificialanalysis.ai/leaderboards/models")
    except Exception as exc:
        logger.warning("AA Index 抓取失败: %s", exc)
        return []
    rows = _extract_md_table(md, "Intelligence Index")
    entries: list[RankEntry] = []
    for cells in rows[: top_n + 3]:
        if len(cells) < 3:
            continue
        model_cell = cells[0]
        m = re.search(r"\[([^\]]+)\]\(([^)]+)\)", model_cell)
        model_name = m.group(1) if m else model_cell
        model_url = m.group(2) if m else ""
        # 单元格 [模型, 上下文, 组织(含logo), Index分, 成本, ...]
        org_cell = cells[2] if len(cells) > 2 else ""
        org = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", org_cell).strip()
        score = cells[3] if len(cells) > 3 else ""
        cost = cells[4] if len(cells) > 4 else ""
        entries.append(
            RankEntry(
                rank=len(entries) + 1,
                model=model_name,
                score=score,
                org=org,
                url=model_url,
                price=cost,
            )
        )
        if len(entries) >= top_n:
            break
    logger.info("AA Intelligence Index: %d 条", len(entries))
    return entries


# ---------------------------------------------------------------------------
# LiveBench 排行榜
# ---------------------------------------------------------------------------

def fetch_livebench(top_n: int = 10) -> list[RankEntry]:
    """抓取 LiveBench 总排行榜。"""
    try:
        md = _jina_markdown("https://livebench.ai/")
    except Exception as exc:
        logger.warning("LiveBench 抓取失败: %s", exc)
        return []
    rows = _extract_md_table(md, "Model")
    entries: list[RankEntry] = []
    # 列: 空 | Model | Overall | Reasoning | Coding | Agentic Coding | Math | Data Analysis | Language | Instruction | Cost
    for cells in rows[: top_n + 3]:
        if len(cells) < 3:
            continue
        model = cells[1] if len(cells) > 1 else ""
        overall = cells[2] if len(cells) > 2 else ""
        if not model or not overall:
            continue
        entries.append(
            RankEntry(
                rank=len(entries) + 1,
                model=model,
                score=overall,
                category_scores={
                    "reasoning": cells[3] if len(cells) > 3 else "",
                    "coding": cells[4] if len(cells) > 4 else "",
                    "agentic": cells[5] if len(cells) > 5 else "",
                    "math": cells[6] if len(cells) > 6 else "",
                    "data": cells[7] if len(cells) > 7 else "",
                    "language": cells[8] if len(cells) > 8 else "",
                    "instruct": cells[9] if len(cells) > 9 else "",
                },
                price=cells[10] if len(cells) > 10 else "",
            )
        )
        if len(entries) >= top_n:
            break
    logger.info("LiveBench: %d 条", len(entries))
    return entries


# ---------------------------------------------------------------------------
# Open LLM Leaderboard v2（开源模型）
# ---------------------------------------------------------------------------

def fetch_open_llm(top_n: int = 10) -> list[RankEntry]:
    """从 HF datasets 分页拉取 Open LLM Leaderboard v2 数据并按分数排序。"""
    base = (
        "https://datasets-server.huggingface.co/rows"
        "?dataset=open-llm-leaderboard%2Fcontents&config=default&split=train"
    )
    entries: list[RankEntry] = []
    seen: set[str] = set()
    try:
        with httpx.Client(timeout=60) as client:
            for offset in range(0, 600, 100):
                resp = client.get(f"{base}&offset={offset}&length=100")
                if resp.status_code != 200:
                    logger.warning(
                        "Open LLM Leaderboard 分页 %s: HTTP %s", offset, resp.status_code
                    )
                    break
                data = resp.json()
                rows = data.get("rows", [])
                for item in rows:
                    row = item.get("row", {})
                    avg = row.get("Average ⬆️")
                    if avg is None:
                        continue
                    try:
                        avg_f = float(avg)
                    except (ValueError, TypeError):
                        continue
                    model = row.get("Model", "")
                    if not model or model in seen:
                        continue
                    seen.add(model)
                    model_clean = re.sub(r"<[^>]+>", "", model).strip()
                    entries.append(
                        RankEntry(
                            rank=0,
                            model=model_clean,
                            score=f"{avg_f:.1f}",
                            org=row.get("Architecture", ""),
                            url="https://huggingface.co/" + model_clean,
                            params=row.get("#Params (B)", ""),
                            license=row.get("Hub License", ""),
                            arch=row.get("Architecture", ""),
                        )
                    )
                if len(rows) < 100:
                    break
    except Exception as exc:
        logger.warning("Open LLM Leaderboard 抓取失败: %s", exc)
        return []

    entries.sort(key=lambda r: float(r.score), reverse=True)
    for i, e in enumerate(entries[:top_n], 1):
        e.rank = i
    logger.info("Open LLM Leaderboard: %d 条（共看 %d 个模型）", len(entries), len(seen))
    return entries[:top_n]


# ---------------------------------------------------------------------------
# OpenCompass 司南（上海AI实验室 · 中文最权威评测）
# ---------------------------------------------------------------------------

def fetch_opencompass(top_n: int = 10, retries: int = 4) -> list[RankEntry]:
    """经 Jina Reader 抓取 OpenCompass 司南官方评测榜。

    榜单列：模型 | 发布日期 | 参数量 | 均分 | 语言 | 知识 | 推理 | 数学 | 代码 | 智能体

    司南为 React SPA，榜单数据由 JS 加载，Jina 偶发渲染失败返回空壳，
    因此用 X-Timeout 强制等待渲染，并在解析为空时退避重试。
    """
    import time as _time

    entries: list[RankEntry] = []
    for attempt in range(retries + 1):
        try:
            # render_timeout=15s：Firecrawl 用 waitFor 等待渲染，Jina 用 X-Timeout
            md = _jina_markdown(
                "https://rank.opencompass.org.cn/home",
                timeout=100,
                render_timeout=15,
            )
        except Exception as exc:
            logger.warning("OpenCompass 抓取失败: %s", exc)
            if attempt < retries:
                _time.sleep(3 + attempt * 3)
                continue
            return []
        entries = _parse_opencompass(md, top_n)
        if entries:
            break
        logger.warning("OpenCompass 解析为空（第 %d/%d 次）", attempt + 1, retries)
        _time.sleep(3 + attempt * 3)
    logger.info("OpenCompass 司南: %d 条", len(entries))
    return entries


def _parse_opencompass(md: str, top_n: int) -> list[RankEntry]:
    """解析司南榜单 markdown 表格。"""
    # 清洗 Firecrawl/Jina 渲染差异：<br> → 空格
    md = re.sub(r"<br\s*/?>", " ", md)
    rows = _extract_md_table(md, "均分")
    entries: list[RankEntry] = []
    for cells in rows[: top_n + 3]:
        if len(cells) < 4:
            continue
        model_cell = cells[1] if len(cells) > 1 else ""
        model = re.sub(r"^new\s*", "", model_cell).strip()
        if not model or "模型" in model:
            continue
        # 提取模型名与组织（如 "GPT-5.4-2026-03-05 (high) 闭源 · OpenAI"）
        m = re.search(r"^(.*?)(?:\s+(?:闭源|开源)\s*·\s*(.+))?$", model)
        model_name = m.group(1).strip() if m else model
        org = m.group(2).strip() if m and m.group(2) else ""
        params = cells[3] if len(cells) > 3 else ""
        avg = cells[4] if len(cells) > 4 else ""
        cat = {
            "language": cells[5] if len(cells) > 5 else "",
            "knowledge": cells[6] if len(cells) > 6 else "",
            "reasoning": cells[7] if len(cells) > 7 else "",
            "math": cells[8] if len(cells) > 8 else "",
            "coding": cells[9] if len(cells) > 9 else "",
            "agent": cells[10] if len(cells) > 10 else "",
        }
        entries.append(
            RankEntry(
                rank=len(entries) + 1,
                model=model_name,
                score=avg,
                org=org,
                url="https://rank.opencompass.org.cn/home",
                params=params,
                category_scores=cat,
            )
        )
        if len(entries) >= top_n:
            break
    return entries


# ---------------------------------------------------------------------------
# Artificial Analysis 动态
# ---------------------------------------------------------------------------

def fetch_artificial_analysis(limit: int = 15) -> list[Article]:
    """抓取 AA changelog 标题作为测评动态。"""
    items: list[Article] = []
    for path in ("/changelog", "/articles"):
        try:
            with httpx.Client(timeout=60, headers={"User-Agent": USER_AGENT}) as client:
                resp = client.get("https://artificialanalysis.ai" + path)
                resp.raise_for_status()
            html = resp.text
        except Exception as exc:
            logger.warning("Artificial Analysis 抓取失败 [%s]: %s", path, exc)
            continue
        seen: set[str] = set()
        for m in re.finditer(r"<h3[^>]*>(.*?)</h3>", html, re.S):
            title = re.sub(r"<[^>]+>", "", m.group(1)).strip()
            title = __import__("html").unescape(title)
            if not title or len(title) < 8 or title in seen:
                continue
            if any(
                kw in title.lower()
                for kw in ("cookies", "sign in", "subscribe", "faq", "terms")
            ):
                continue
            seen.add(title)
            items.append(
                Article(
                    title=title,
                    url="https://artificialanalysis.ai" + path,
                    source="eval",
                    source_name="Artificial Analysis",
                    published=dt.datetime.now(dt.timezone.utc),
                )
            )
            if len(items) >= limit:
                break
        if len(items) >= limit:
            break
    logger.info("Artificial Analysis 动态: %d 条", len(items))
    return items[:limit]


# ---------------------------------------------------------------------------
# 测评新闻 RSS
# ---------------------------------------------------------------------------

EVAL_RSS = {
    "Epoch AI": "https://epochai.substack.com/feed",
    "MIT Technology Review": "https://www.technologyreview.com/feed/",
    "The Verge AI": "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
}

# 中文测评/科技新闻源
CN_EVAL_RSS = {
    "量子位": "https://www.qbitai.com/feed",
    "IT之家 AI": "https://www.ithome.com/rss/",
}


def fetch_eval_news(
    lookback_days: int = 7, per_source: int = 10, rss_sources: dict[str, str] | None = None
) -> list[Article]:
    """抓取测评新闻 RSS。用关键词过滤出与 AI 模型评测相关的条目。"""
    sources = rss_sources or EVAL_RSS
    items: list[Article] = []
    # 标题命中任一即收录（覆盖模型发布、评测、排行榜、行业动态；含中文关键词）
    keywords = [
        "benchmark", "benchmarks", "leaderboard", "elo", "evaluation",
        "bench", "model", "models", "artificial intelligence", "llm",
        "openai", "anthropic", "deepseek", "gemini", "claude", "gpt",
        "muse", "llama", "hockey", "ai", "machine learning",
        # 中文关键词
        "大模型", "模型", "智能", "人工智能", "评测", "测评", "排行榜",
        "基准", "开源", "闭源", "参数量", "竞技场", "发布", "越狱",
        "幻觉", "安全", "能力", "超越", "登顶", "碾压",
    ]
    exclude = [
        "newsletter", "sign up", "subscribe", "podcast", "sponsored",
    ]
    for name, url in sources.items():
        try:
            with httpx.Client(timeout=40, headers={"User-Agent": USER_AGENT}) as client:
                resp = client.get(url)
                resp.raise_for_status()
            feed = feedparser.parse(resp.content)
        except Exception as exc:
            logger.warning("测评 RSS 抓取失败 [%s]: %s", name, exc)
            continue
        n = 0
        for entry in feed.get("entries", [])[: per_source * 3]:
            title = entry.get("title", "").strip()
            summary = entry.get("summary", "").strip()
            published = _parse_date(entry.get("published") or entry.get("updated"))
            if published is None:
                continue
            cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=lookback_days)
            if published.tzinfo is None:
                published = published.replace(tzinfo=dt.timezone.utc)
            if published < cutoff:
                continue
            if any(kw in title.lower() for kw in exclude):
                continue
            if not any(kw in title.lower() for kw in keywords):
                continue
            items.append(
                Article(
                    title=title,
                    url=entry.get("link", "").strip(),
                    source="eval",
                    source_name=name,
                    published=published,
                    summary=summary,
                )
            )
            n += 1
        logger.info("测评新闻 [%s]: %d 条", name, n)
    return items


# ---------------------------------------------------------------------------
# 汇总
# ---------------------------------------------------------------------------

def collect_eval(config: dict) -> dict:
    """收集测评看板所需全部数据。返回 {leaderboards: {name: [RankEntry]}, news}。"""
    eval_cfg = config.get("eval", {})
    top_n = int(eval_cfg.get("lmarena_top_n", 10))
    lookback = int(eval_cfg.get("lookback_days", 7))

    leaderboards: dict[str, list[RankEntry]] = {}
    enabled = eval_cfg.get("leaderboards", ["lmarena", "aa_index", "livebench", "open_llm"])
    if "lmarena" in enabled:
        leaderboards["LMArena"] = fetch_lmarena(top_n)
    if "aa_index" in enabled:
        leaderboards["Artificial Analysis"] = fetch_aa_index(top_n)
    if "livebench" in enabled:
        leaderboards["LiveBench"] = fetch_livebench(top_n)
    if "open_llm" in enabled:
        leaderboards["Open LLM Leaderboard"] = fetch_open_llm(top_n)
    if "opencompass" in enabled:
        leaderboards["OpenCompass 司南"] = fetch_opencompass(top_n)

    news: list[Article] = []
    if eval_cfg.get("artificial_analysis", True):
        news.extend(fetch_artificial_analysis(int(eval_cfg.get("aa_limit", 12))))
    # 英文测评新闻 + 中文测评新闻
    zh_sources = eval_cfg.get("cn_news_rss", CN_EVAL_RSS)
    news.extend(
        fetch_eval_news(
            lookback_days=lookback,
            per_source=int(eval_cfg.get("news_per_source", 8)),
            rss_sources={**EVAL_RSS, **zh_sources},
        )
    )
    return {"leaderboards": leaderboards, "news": news}


def ranks_to_json(ranks: list[RankEntry]) -> list[dict]:
    return [r.__dict__ for r in ranks]
