"""LLM 摘要：将抓取到的条目交给 LLM 生成每日 AI4S 简报。

LLM 输出结构化 JSON，便于前端渲染成干净卡片排版。
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field

import httpx

from .collectors import Article

logger = logging.getLogger(__name__)


@dataclass
class Digest:
    """结构化简报。items 中每项为 dict：title/url/source/impact/why。"""

    date: str = ""
    items: list[dict] = None
    trend: str = ""

    def __post_init__(self) -> None:
        if self.items is None:
            self.items = []

    @property
    def valid(self) -> bool:
        return bool(self.items)

    def to_dict(self) -> dict:
        return {"date": self.date, "items": self.items or [], "trend": self.trend}


def _client(cfg: dict) -> httpx.Client:
    return httpx.Client(
        base_url=cfg["base_url"].rstrip("/") + "/",
        headers={
            "Authorization": f"Bearer {cfg['api_key']}",
            "Content-Type": "application/json",
        },
        timeout=180,
    )


def _extract_json(text: str) -> dict | None:
    """从容错解析 LLM 输出中的 JSON 对象。"""
    # 去掉 markdown 代码块围栏
    text = re.sub(r"```(?:json)?\s*", "", text).strip()
    # 直接从第一个 { 到最后一个 } 截取
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    candidate = text[start : end + 1]
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        pass
    # 容错：清理常见尾部逗号
    candidate = re.sub(r",\s*([}\]])", r"\1", candidate)
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        return None


def _normalize(raw: dict) -> Digest:
    """把 LLM 返回的任意结构规整为 Digest。兼容多字段名。"""
    date = str(raw.get("date") or raw.get("发布日期") or "")
    trend = str(raw.get("trend") or raw.get("趋势") or raw.get("今日趋势观察") or "")

    items_raw = raw.get("items") or raw.get("progresses") or raw.get("进展") or raw.get("entries")
    items: list[dict] = []
    for it in items_raw or []:
        if not isinstance(it, dict):
            continue
        title = it.get("title") or it.get("标题") or ""
        if not title:
            continue
        items.append(
            {
                "title": str(title).strip(),
                "url": it.get("url") or it.get("链接") or it.get("link") or "",
                "source": str(it.get("source") or it.get("来源") or ""),
                "impact": str(it.get("impact") or it.get("点评") or it.get("一句话点评") or "").strip(),
                "why": str(it.get("why") or it.get("理由") or it.get("值得关注") or "").strip(),
            }
        )
    return Digest(date=date, items=items, trend=trend.strip())


def summarize_eval(
    cfg: dict,
    articles: list[Article],
    fulltexts: dict[str, str] | None = None,
    candidate_limit: int = 12,
    max_items: int = 6,
) -> Digest:
    """测评新闻的深度分析：粗选 → 全文精析。

    与 summarize() 不同，这里聚焦「AI 模型测评」主题。
    """
    empty = Digest()
    if not cfg.get("api_key") or not cfg.get("base_url"):
        logger.info("未配置 LLM，跳过测评摘要")
        return empty

    payload = [
        {
            "title": a.title,
            "source": a.source_name,
            "publisher": a.publisher,
            "url": a.url,
            "published": a.date_str,
            "summary": (a.summary or "")[:800],
        }
        for a in articles
    ]
    if not payload:
        return empty

    shortlist = _select_eval_candidates(cfg, payload, candidate_limit)
    if not shortlist:
        return empty
    if fulltexts:
        for it in shortlist:
            full = fulltexts.get(it["url"])
            if full:
                it["fulltext"] = full[:6000]
    return _refine_eval(cfg, shortlist, max_items)


def _select_eval_candidates(cfg: dict, payload: list[dict], limit: int) -> list[dict]:
    """基于标题和摘要挑选模型测评相关候选。"""
    prompt = (
        "你是 AI 大模型测评领域的专业情报分析师。\n"
        "以下是近期从 Artificial Analysis、Epoch AI、MIT Tech Review、The Verge 等聚合的模型测评与发布动态。\n"
        "请挑选最有价值、最能反映模型能力变化的候选，输出为 JSON。\n\n"
        "JSON 结构：\n"
        "{\n"
        '  "items": [\n'
        "    {\"title\": \"原始标题\", \"url\": \"原始链接\"}\n"
        "  ]\n"
        "}\n\n"
        f"要求：\n1. 挑出最多 {limit} 条，按重要性从高到低排列\n"
        "2. 优先挑与模型能力/评测/排行榜/发布相关的条目\n"
        "3. title 和 url 必须一字不改取自上方条目\n"
        "4. 严格输出合法 JSON，字段名用英文\n\n"
        "条目列表（JSON）：\n"
        + json.dumps(payload, ensure_ascii=False, indent=2)
    )
    try:
        with _client(cfg) as client:
            content = _chat(
                client,
                cfg,
                "你是严谨的 AI 模型测评分析师，输出简体中文，只输出 JSON。",
                prompt,
            )
        raw = _extract_json(content)
        if not raw:
            return []
        selected = []
        by_url = {it["url"]: it for it in payload if it.get("url")}
        for it in raw.get("items") or []:
            url = it.get("url")
            src = by_url.get(url) if url else None
            if src:
                selected.append(dict(src))
        return selected
    except Exception as exc:
        logger.warning("测评候选粗选失败: %s", exc)
        return [dict(it) for it in payload[: min(limit, len(payload))]]


def _refine_eval(cfg: dict, shortlist: list[dict], max_items: int) -> Digest:
    """对测评候选做全文深度分析。"""
    empty = Digest()
    prompt = (
        "你是 AI 大模型测评领域的专业情报分析师。\n"
        "以下是你先前挑选出的候选条目，含原文摘要（可能含抓取到的全文）。\n"
        "请基于全文做深度分析，输出为 JSON。\n\n"
        "JSON 结构（示例）：\n"
        "{\n"
        '  "date": "2026-08-09",\n'
        '  "items": [\n'
        "    {\n"
        '      "title": "原始标题（必须与条目完全一致）",\n'
        '      "url": "原始链接",\n'
        '      "source": "真实来源名称",\n'
        '      "impact": "一句话点评，说明这条测评/发布动态为何重要",\n'
        '      "why": "值得关注的理由，1-2 句，尽量引用全文中的具体数据（如分数、排名变化、能力维度）"\n'
        "    }\n"
        "  ],\n"
        '  "trend": "今日模型测评趋势观察，一段话"\n'
        "}\n\n"
        "要求：\n"
        "1. 按重要性从高到低排列 items，最多 " + str(max_items) + " 条\n"
        "2. title 和 url 必须一字不改地取自候选条目\n"
        "3. source 字段填真实来源站点\n"
        "4. impact 用词凝练；why 要基于全文内容给出具体、有信息量的理由（引用分数/排名/能力变化），不要泛泛而谈\n"
        "5. 若某条目没有 fulltext，则基于其 summary 判断\n"
        "6. 严格输出合法 JSON，字段名用英文\n\n"
        "候选条目（JSON）：\n"
        + json.dumps(shortlist, ensure_ascii=False, indent=2)
    )
    try:
        with _client(cfg) as client:
            content = _chat(
                client,
                cfg,
                "你是严谨的 AI 模型测评分析师，输出简体中文，只输出 JSON。",
                prompt,
            )
        raw = _extract_json(content)
        if not raw:
            return empty
        digest = _normalize(raw)
        logger.info("测评深度分析完成：%d 条动态", len(digest.items))
        return digest
    except Exception as exc:
        logger.warning("测评深度分析失败: %s", exc)
        return empty


def _chat(client: httpx.Client, cfg: dict, system: str, user: str) -> str:
    """调用 LLM 聊天接口，返回文本。"""
    body = {
        "model": cfg["model"],
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": cfg.get("temperature", 0.3),
        "response_format": {"type": "json_object"},
    }
    resp = client.post("chat/completions", json=body)
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"].strip()


def summarize(
    cfg: dict,
    articles: list[Article],
    fulltexts: dict[str, str] | None = None,
    candidate_limit: int = 14,
) -> Digest:
    """把文章列表交给 LLM，返回结构化 Digest。

    两阶段分析：
    1. 基于标题+摘要粗选最有价值的候选
    2. 若提供 fulltexts（{url: 全文}），对候选用全文做深度分析
    """
    empty = Digest()
    if not cfg.get("api_key") or not cfg.get("base_url"):
        logger.info("未配置 LLM，跳过摘要")
        return empty

    payload = [
        {
            "title": a.title,
            "source": a.source_name,
            "publisher": a.publisher,
            "url": a.url,
            "published": a.date_str,
            "summary": (a.summary or "")[:800],
        }
        for a in articles
    ]
    if not payload:
        return empty

    # 阶段 1：粗选候选（标题 + 摘要）
    shortlist = _select_candidates(cfg, payload, candidate_limit)
    if not shortlist:
        return empty

    # 阶段 2：全文精析（有全文则注入）
    if fulltexts:
        for it in shortlist:
            full = fulltexts.get(it["url"])
            if full:
                it["fulltext"] = full[:6000]
    return _refine(cfg, shortlist)


def _select_candidates(cfg: dict, payload: list[dict], limit: int) -> list[dict]:
    """基于标题和摘要挑选候选条目。返回条目 dict 列表。"""
    prompt = (
        "你是 AI for Science (AI4S) 领域的专业情报分析师。\n"
        "以下是近期从 arXiv、权威期刊、中文科技媒体和 HuggingFace 聚合的条目。\n"
        "请从中挑选最有价值的候选，输出为 JSON，不要输出任何其他文字。\n\n"
        "JSON 结构：\n"
        "{\n"
        '  "items": [\n'
        "    {\"title\": \"原始标题\", \"url\": \"原始链接\"}\n"
        "  ]\n"
        "}\n\n"
        f"要求：\n1. 挑出最多 {limit} 条，按重要性从高到低排列\n"
        "2. 只挑与 AI for Science 密切相关且信息量大的条目\n"
        "3. title 和 url 必须一字不改取自上方条目\n"
        "4. 严格输出合法 JSON，字段名用英文\n\n"
        "条目列表（JSON）：\n"
        + json.dumps(payload, ensure_ascii=False, indent=2)
    )
    try:
        with _client(cfg) as client:
            content = _chat(
                client,
                cfg,
                "你是严谨的科研情报分析师，输出简体中文，只输出 JSON。",
                prompt,
            )
        raw = _extract_json(content)
        if not raw:
            return []
        selected = []
        by_url = {it["url"]: it for it in payload if it.get("url")}
        for it in raw.get("items") or []:
            url = it.get("url")
            src = by_url.get(url) if url else None
            if src:
                selected.append(dict(src))
        return selected
    except Exception as exc:
        logger.warning("LLM 候选粗选失败: %s", exc)
        return [dict(it) for it in payload[: min(limit, len(payload))]]


def _refine(cfg: dict, shortlist: list[dict]) -> Digest:
    """对候选条目做深度分析，产出最终 Digest。"""
    empty = Digest()
    prompt = (
        "你是 AI for Science (AI4S) 领域的专业情报分析师。\n"
        "以下是你先前挑选出的候选条目，含原文摘要（可能含抓取到的全文）。\n"
        "请对每个候选做深度分析，输出为 JSON，不要输出任何其他文字。\n\n"
        "JSON 结构（示例）：\n"
        "{\n"
        '  "date": "2026-08-09",\n'
        '  "items": [\n'
        "    {\n"
        '      "title": "原始标题（必须与条目完全一致）",\n'
        '      "url": "原始链接",\n'
        '      "source": "真实来源名称",\n'
        '      "impact": "一句话点评，说明它为何重要",\n'
        '      "why": "值得关注的理由，1-2 句，尽量引用全文中的具体信息"\n'
        "    }\n"
        "  ],\n"
        '  "trend": "今日趋势观察，一段话"\n'
        "}\n\n"
        "要求：\n"
        "1. 按重要性从高到低排列 items，最多 8 条\n"
        "2. title 和 url 必须一字不改地取自候选条目\n"
        "3. source 字段填真实来源站点（优先用 publisher 字段）\n"
        "4. impact 用词凝练；why 要基于全文内容给出具体、有信息量的理由，不要泛泛而谈\n"
        "5. 若某条目没有 fulltext，则基于其 summary 判断\n"
        "6. 严格输出合法 JSON，字段名用英文\n\n"
        "候选条目（JSON）：\n"
        + json.dumps(shortlist, ensure_ascii=False, indent=2)
    )
    try:
        with _client(cfg) as client:
            content = _chat(
                client,
                cfg,
                "你是严谨的科研情报分析师，输出简体中文，只输出 JSON。",
                prompt,
            )
        raw = _extract_json(content)
        if not raw:
            return empty
        digest = _normalize(raw)
        logger.info("LLM 深度分析完成：%d 条进展", len(digest.items))
        return digest
    except Exception as exc:
        logger.warning("LLM 深度分析失败: %s", exc)
        return empty
