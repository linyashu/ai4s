"""渲染每日静态看板 HTML。"""
from __future__ import annotations

import datetime as dt
import html
import json
from pathlib import Path

from .collectors import Article
from .summarizer import Digest

SOURCE_LABELS = {
    "arxiv": "arXiv",
    "rss": "期刊/博客",
    "google_news": "中文媒体",
    "huggingface": "HuggingFace",
}

SOURCE_COLORS = {
    "arxiv": "#b31b1b",
    "rss": "#2e7d32",
    "google_news": "#e65100",
    "huggingface": "#ffd21e",
}


def _esc(s) -> str:
    if s is None:
        return ""
    return html.escape(str(s), quote=True)


def _group(articles: list[Article]) -> dict[str, list[Article]]:
    grouped: dict[str, list[Article]] = {}
    for a in articles:
        grouped.setdefault(a.source, []).append(a)
    return grouped


def _sorted(articles: list[Article]) -> list[Article]:
    def _key(a: Article):
        if a.published is None:
            return dt.datetime.min.replace(tzinfo=dt.timezone.utc)
        if a.published.tzinfo is None:
            return a.published.replace(tzinfo=dt.timezone.utc)
        return a.published

    return sorted(articles, key=_key, reverse=True)


def _render_articles(articles: list[Article]) -> str:
    chunks = []
    for a in _sorted(articles):
        color = SOURCE_COLORS.get(a.source, "#666")
        label = SOURCE_LABELS.get(a.source, a.source)
        date = a.date_str or "—"
        authors = "，".join(str(x) for x in (a.authors or [])[:4])
        display_source = a.publisher or a.source_name
        summary = ""
        if a.summary:
            clean = _strip_html(a.summary)
            s = clean[:300].strip()
            summary = f'<p class="summary">{_esc(s)}{"…" if len(clean) > 300 else ""}</p>'
        meta = "".join(
            f'<span class="tag">{_esc(t)}</span>' for t in (a.tags or [])[:4]
        )
        chunks.append(
            f"""<article class="card">
  <div class="card-head">
    <span class="badge" style="background:{color}">{_esc(label)}</span>
    <span class="date">{_esc(date)}</span>
    <span class="source">{_esc(display_source)}</span>
  </div>
  <h3><a href="{_esc(a.url)}" target="_blank" rel="noopener">{_esc(a.title)}</a></h3>
  {summary}
  <div class="card-foot">
    <span class="authors">{_esc(authors)}</span>
    {meta}
  </div>
</article>"""
        )
    return "\n".join(chunks)


def _strip_html(text) -> str:
    """去掉 HTML 标签，保留纯文本。"""
    import re

    return re.sub(r"<[^>]+>", "", str(text or "")).replace("&nbsp;", " ").strip()


def _render_digest(digest: Digest) -> str:
    """把结构化 Digest 渲染成干净的卡片排版。"""
    if not digest.valid:
        return ""

    date_html = f'<div class="digest-date">{_esc(digest.date)}</div>' if digest.date else ""
    item_cards = []
    for i, it in enumerate(digest.items, 1):
        impact = _esc(it.get("impact", ""))
        why = _esc(it.get("why", ""))
        source = _esc(it.get("source", ""))
        title = _esc(it.get("title", ""))
        url = _esc(it.get("url", ""))
        source_html = f'<span class="digest-source">{source}</span>' if source else ""
        impact_html = f'<p class="digest-impact"><strong>点评</strong> {impact}</p>' if impact else ""
        why_html = f'<p class="digest-why"><strong>值得关注</strong> {why}</p>' if why else ""
        if url:
            link_title = f"（{source}）打开原文" if source else "打开原文"
            link = f'<a href="{url}" target="_blank" rel="noopener" title="{_esc(link_title)}">{title}</a>'
        else:
            link = title
        item_cards.append(
            f"""<div class="digest-item">
  <div class="digest-item-head"><span class="digest-rank">{i}</span>{source_html}</div>
  <h3 class="digest-title">{link}</h3>
  {impact_html}
  {why_html}
</div>"""
        )

    trend_html = (
        f"""<div class="digest-trend">
  <h3>今日趋势观察</h3>
  <p>{_esc(digest.trend)}</p>
</div>"""
        if digest.trend
        else ""
    )

    return f"""<div class="digest">
  <h2>今日 AI4S 简报</h2>
  {date_html}
  {''.join(item_cards)}
  {trend_html}
</div>"""


def render(articles: list[Article], digest: Digest | str, output: Path) -> Path:
    """生成 index.html 到 output 目录。"""
    output.mkdir(parents=True, exist_ok=True)

    digest_html = _render_digest(digest) if isinstance(digest, Digest) else (digest or "")

    grouped = _group(articles)
    sections = []
    for key in ("arxiv", "rss", "google_news", "huggingface"):
        items = grouped.get(key, [])
        if not items:
            continue
        color = SOURCE_COLORS[key]
        label = SOURCE_LABELS[key]
        sections.append(
            f"""<section class="section">
  <h2 class="section-title"><span class="badge" style="background:{color}">{_esc(label)}</span><span class="count">{len(items)} 条</span></h2>
  <div class="grid">{_render_articles(items)}</div>
</section>"""
        )

    now = dt.datetime.now().strftime("%Y-%m-%d %H:%M")
    title = "AI4S 每日进展看板"
    html_str = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
:root {{ color-scheme: light dark; }}
* {{ box-sizing: border-box; }}
body {{ font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; margin:0; background:#f6f7f9; color:#222; line-height:1.6; }}
.wrap {{ max-width: 1080px; margin: 0 auto; padding: 24px 16px 64px; }}
header {{ text-align:center; padding: 32px 0 12px; }}
h1 {{ margin:0; font-size:1.9em; }}
.sub {{ color:#666; font-size:.92em; }}
.nav {{ margin-top:10px; }}
.nav a {{ color:#1a73e8; text-decoration:none; font-size:.9em; }}
.nav a:hover {{ text-decoration:underline; }}
.digest {{ background:#fff; border:1px solid #e3e6ea; border-radius:12px; padding:20px 24px; margin:20px 0; }}
.digest h2 {{ margin:0 0 4px; font-size:1.25em; }}
.digest-date {{ color:#888; font-size:.85em; margin-bottom:16px; }}
.digest-item {{ border-top:1px solid #eef0f3; padding:14px 0; }}
.digest-item-head {{ display:flex; align-items:center; gap:10px; margin-bottom:6px; }}
.digest-rank {{ display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; background:#1a73e8; color:#fff; font-size:.78em; font-weight:700; flex:none; }}
.digest-source {{ color:#666; font-size:.82em; }}
.digest-title {{ margin:0 0 6px; font-size:1.02em; line-height:1.45; }}
.digest-title a {{ color:#1a0dab; text-decoration:none; }}
.digest-title a:hover {{ text-decoration:underline; }}
.digest-impact, .digest-why {{ margin:3px 0; color:#333; font-size:.92em; }}
.digest-why {{ color:#555; }}
.digest-impact strong, .digest-why strong {{ color:#1a73e8; font-weight:600; margin-right:2px; }}
.digest-trend {{ border-top:2px solid #eef0f3; margin-top:10px; padding-top:14px; }}
.digest-trend h3 {{ margin:0 0 6px; font-size:1em; color:#b26a00; }}
.digest-trend p {{ margin:0; color:#555; font-size:.94em; }}
.section-title {{ display:flex; align-items:center; gap:10px; margin:32px 0 12px; }}
.count {{ color:#888; font-size:.85em; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:14px; }}
.card {{ background:#fff; border:1px solid #e3e6ea; border-radius:10px; padding:14px 16px; display:flex; flex-direction:column; }}
.card h3 {{ margin:8px 0 6px; font-size:1em; }}
.card h3 a {{ color:#1a0dab; text-decoration:none; }}
.card h3 a:hover {{ text-decoration:underline; }}
.card-head {{ display:flex; align-items:center; gap:8px; font-size:.8em; }}
.badge {{ color:#fff; padding:2px 8px; border-radius:999px; font-size:.75em; font-weight:600; white-space:nowrap; }}
.date {{ color:#888; }}
.source {{ color:#666; }}
.summary {{ color:#444; font-size:.86em; margin:4px 0; overflow-wrap:anywhere; }}
.card-foot {{ margin-top:auto; padding-top:8px; display:flex; flex-wrap:wrap; gap:6px; align-items:center; }}
.authors {{ color:#888; font-size:.8em; flex:1; min-width:100px; }}
.tag {{ background:#eef1f5; border-radius:4px; padding:2px 6px; font-size:.72em; color:#555; }}
footer {{ text-align:center; color:#999; font-size:.8em; margin-top:32px; }}
@media (prefers-color-scheme: dark) {{
  body {{ background:#14171c; color:#e8eaed; }}
  .digest, .card {{ background:#1e232b; border-color:#2b313b; }}
  .summary {{ color:#c9cdd3; }}
  .card h3 a {{ color:#8ab4f8; }}
  .tag {{ background:#2b313b; color:#b8bec8; }}
  .sub {{ color:#9aa0a6; }}
  .digest-date {{ color:#9aa0a6; }}
  .digest-item {{ border-top-color:#2b313b; }}
  .digest-impact {{ color:#e0e3e8; }}
  .digest-why {{ color:#c0c4cc; }}
  .digest-trend {{ border-top-color:#2b313b; }}
  .digest-trend p {{ color:#c0c4cc; }}
  .digest-title a {{ color:#8ab4f8; }}
}}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>🧪 AI4S 每日进展看板</h1>
    <div class="sub">AI for Science 每日聚合 · arXiv / 期刊 / 中文媒体 / HuggingFace</div>
    <div class="nav"><a href="eval.html">📊 AI 大模型测评看板 →</a></div>
  </header>
  {digest_html}
  {''.join(sections)}
  <footer>更新时间：{now} · 共 {len(articles)} 条</footer>
</div>
</body>
</html>"""
    out = output / "index.html"
    out.write_text(html_str, encoding="utf-8")
    return out


def render_json(articles: list[Article], output: Path) -> tuple[Path, list[dict]]:
    """同时输出 JSON，方便后续接前端或二次处理。返回 (路径, 数据)。"""
    data = [
        {
            "title": a.title,
            "url": a.url,
            "source": a.source,
            "source_name": a.source_name,
            "published": a.date_str,
            "summary": a.summary,
            "authors": a.authors,
            "tags": a.tags,
        }
        for a in articles
    ]
    out = output / "data.json"
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return out, data
