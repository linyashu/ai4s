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


def _extract_json(text: str) -> dict | list | None:
    """从容错解析 LLM 输出中的 JSON（对象或数组）。"""
    text = re.sub(r"```(?:json)?\s*", "", text).strip()
    # 先试整体解析
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # 对象：从第一个 { 到最后一个 }
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        candidate = text[start : end + 1]
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            candidate = re.sub(r",\s*([}\]])", r"\1", candidate)
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                pass
    # 数组：从第一个 [ 到最后一个 ]
    start, end = text.find("["), text.rfind("]")
    if start != -1 and end > start:
        candidate = text[start : end + 1]
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            candidate = re.sub(r",\s*([}\]])", r"\1", candidate)
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                pass
    return None


def _normalize(raw: dict) -> Digest:
    """把 LLM 返回的任意结构规整为 Digest。兼容多字段名。"""
    # 兼容对象 {"items":[...]} 与顶层数组 [...]
    if isinstance(raw, list):
        date, trend, items_raw = "", "", raw
    else:
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
        items = raw.get("items") if isinstance(raw, dict) else raw
        for it in items or []:
            if not isinstance(it, dict):
                continue
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
        "你是人工智能/计算机科学与计算社会科学领域的专业情报分析师。\n"
        "【重要】本简报所称 AI4S 的口径以下方清单为准：收录\"计算机/AI 领域进展\""
        "与\"AI 赋能社会科学研究\"，不收录生命科学及其他自然科学应用。\n\n"
        "收录范围（满足其一即可）：\n"
        "- 计算机科学与人工智能自身的研究与技术进展：模型架构、训练与推理方法、"
        "大模型与智能体、评测基准、系统与算力、重要开源模型/数据集发布\n"
        "- AI/机器学习/大模型应用于社会科学研究：经济学、金融学、管理学、社会学、"
        "政治学、心理学、传播学、法学、教育学、人口学等\n"
        "- 面向社会科学的研究方法创新：如 LLM 模拟受访者/被试、机器学习因果推断、"
        "基于智能体的社会模拟、文本挖掘用于社科数据\n"
        "- 科学学/元科学，以及 AI 对科研组织方式、科研生态的影响\n"
        "- 与上述主题直接相关的产业与人才动态\n\n"
        "排除范围（命中即不选，无论方法多新颖）：\n"
        "- 生命科学类：生物学、蛋白质结构与设计、药物发现、基因组学、脑科学、"
        "医学与健康等，即使核心方法是 AI/深度学习\n"
        "- 其他自然科学应用：物理、化学、材料、地球/海洋/气候、天文、工程仿真等\n\n"
        "判定规则：以条目的研究对象/应用领域为准——AI 方法应用于生命科学或其他"
        "自然科学的，一律排除；没有自然科学应用对象的纯 AI/计算机研究，予以收录。\n\n"
        "以下是近期从 arXiv、权威期刊、中文科技媒体和 HuggingFace 聚合的条目。\n"
        "请从中挑选最有价值的候选，输出为 JSON。\n"
        "要求：\n"
        f"1. 只挑与收录范围密切相关且信息量大的条目；命中排除范围的一律不选\n"
        f"2. 最多 {limit} 条，按重要性从高到低排列；相关条目不足时宁缺毋滥、"
        "不得凑数，若无相关条目则输出空数组 []\n"
        "3. 每条附 relevance 字段（一句话说明属于收录范围中的哪一类）\n"
        "4. title 和 url 必须一字不改取自上方条目\n"
        "5. 严格输出合法 JSON，字段名用英文（title/url/relevance）\n\n"
        "反例（不要选）：蛋白质构象预测、AI 药物发现、等离子体平衡求解、"
        "海洋-海冰模式、材料电子结构计算。\n"
        "正例（要选）：新的大模型训练/推理方法、智能体评测基准、LLM 模拟社会调查"
        "受访者、机器学习评估公共政策因果效应、AI 对劳动力市场影响的实证研究。\n\n"
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
        # 兼容对象 {"items": [...]} 与顶层数组 [...]
        items = raw.get("items") if isinstance(raw, dict) else raw
        for it in items or []:
            if not isinstance(it, dict):
                continue
            url = it.get("url")
            src = by_url.get(url) if url else None
            if src:
                merged = dict(src)
                if it.get("relevance"):
                    merged["relevance"] = it["relevance"]
                selected.append(merged)
        return selected
    except Exception as exc:
        logger.warning("LLM 候选粗选失败: %s", exc)
        return [dict(it) for it in payload[: min(limit, len(payload))]]


def _refine(cfg: dict, shortlist: list[dict]) -> Digest:
    """对候选条目做深度分析，产出最终 Digest。"""
    empty = Digest()
    prompt = (
        "你是人工智能/计算机科学与计算社会科学领域的专业情报分析师。\n"
        "【重要】本简报只收录\"计算机/AI 领域进展\"与\"AI 赋能社会科学研究\"两类内容，"
        "不收录生命科学（蛋白质、药物、医学等）及物理、化学、材料、地学、天文等"
        "自然科学应用。\n\n"
        "以下是你先前挑选出的候选条目，含原文摘要（可能含抓取到的全文）。\n"
        "请对每个候选做深度分析，输出为 JSON。\n"
        "JSON 字段：title/url/source/impact（一句话点评）/why（1-2句，尽量引用全文具体信息）/trend（趋势观察）\n"
        "要求：\n"
        "1. 先复核相关性：若发现某条实为生命科学或其他自然科学应用研究，直接剔除，不进入结果\n"
        "2. 按重要性排列，最多 8 条；不足 8 条不凑数\n"
        "3. title 和 url 一字不改\n"
        "4. source 填真实来源站点（优先 publisher）\n"
        "5. impact 凝练；why 要基于全文给出具体理由，不要泛泛而谈；"
        "trend 侧重对 AI 技术演进、社会科学研究方法或科研生态的意义\n"
        "6. 无 fulltext 则基于 summary 判断\n"
        "7. 严格输出合法 JSON\n\n"
        "输出结构：\n"
        "{\n"
        '  "date": "2026-08-09",\n'
        '  "items": [\n'
        "    {\"title\": \"原始标题\", \"url\": \"原始链接\", \"source\": \"真实来源\", "
        '"impact": "一句话点评", "why": "值得关注的理由"}\n'
        "  ],\n"
        '  "trend": "趋势观察，一段话"\n'
        "}\n\n"
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
