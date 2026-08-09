"""AI 大模型测评看板渲染。"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

from .collectors import Article
from .eval_collectors import RankEntry
from .summarizer import Digest

SOURCE_COLORS = {
    "Artificial Analysis": "#1a73e8",
    "Epoch AI": "#7c3aed",
    "MIT Technology Review": "#0d9488",
    "The Verge AI": "#dc2626",
    "量子位": "#00a854",
    "IT之家 AI": "#2f6fed",
}


def _esc(s) -> str:
    if s is None:
        return ""
    return __import__("html").escape(str(s), quote=True)


def _render_rank_rows(ranks: list[RankEntry], key: str) -> str:
    """按排行榜类型渲染表格行。"""
    rows = []
    for r in ranks:
        model = _esc(r.model)
        model_url = _esc(r.url)
        model_html = (
            f'<a href="{model_url}" target="_blank" rel="noopener">{model}</a>'
            if model_url
            else model
        )
        org = _esc(r.org)
        if key == "LMArena":
            rows.append(
                f"""<tr>
  <td class="rank">{r.rank}</td>
  <td class="model">{model_html}<span class="org">{org}</span></td>
  <td class="score">{_esc(r.score)}</td>
  <td class="votes">{_esc(r.votes)}</td>
  <td class="price">{_esc(r.price)}</td>
  <td class="ctx">{_esc(r.context)}</td>
</tr>"""
            )
        elif key == "Artificial Analysis":
            rows.append(
                f"""<tr>
  <td class="rank">{r.rank}</td>
  <td class="model">{model_html}<span class="org">{org}</span></td>
  <td class="score">{_esc(r.score)}</td>
  <td class="price">{_esc(r.price)}</td>
</tr>"""
            )
        elif key == "LiveBench":
            cs = r.category_scores
            rows.append(
                f"""<tr>
  <td class="rank">{r.rank}</td>
  <td class="model">{model_html}</td>
  <td class="score">{_esc(r.score)}</td>
  <td class="votes">{_esc(cs.get('reasoning', ''))}</td>
  <td class="votes">{_esc(cs.get('coding', ''))}</td>
  <td class="votes">{_esc(cs.get('math', ''))}</td>
  <td class="votes">{_esc(cs.get('language', ''))}</td>
  <td class="price">{_esc(r.price)}</td>
</tr>"""
            )
        elif key == "OpenCompass 司南":
            cs = r.category_scores
            rows.append(
                f"""<tr>
  <td class="rank">{r.rank}</td>
  <td class="model"><span class="plain-model">{model}</span><span class="org">{org}</span></td>
  <td class="score">{_esc(r.score)}</td>
  <td class="price">{_esc(r.params)}</td>
  <td class="votes">{_esc(cs.get('language', ''))}</td>
  <td class="votes">{_esc(cs.get('knowledge', ''))}</td>
  <td class="votes">{_esc(cs.get('reasoning', ''))}</td>
  <td class="votes">{_esc(cs.get('math', ''))}</td>
  <td class="votes">{_esc(cs.get('coding', ''))}</td>
  <td class="votes">{_esc(cs.get('agent', ''))}</td>
</tr>"""
            )
        else:  # Open LLM Leaderboard
            rows.append(
                f"""<tr>
  <td class="rank">{r.rank}</td>
  <td class="model">{model_html}<span class="org">{_esc(r.license)}</span></td>
  <td class="score">{_esc(r.score)}</td>
  <td class="price">{_esc(r.params)}B</td>
  <td class="ctx">{_esc(r.arch)}</td>
</tr>"""
            )
    return "\n".join(rows)


def _render_rank_table(leaderboards: dict[str, list[RankEntry]]) -> str:
    """渲染多排行榜，标签卡片切换查看。"""
    if not leaderboards:
        return '<p class="empty">暂无排行榜数据（稍后重试）</p>'

    tabs = []
    panels = []
    for i, (name, ranks) in enumerate(leaderboards.items()):
        active = " active" if i == 0 else ""
        tab_aria = "true" if i == 0 else "false"
        count = len(ranks)
        tabs.append(
            f'<button class="tab{active}" data-tab="{i}" role="tab" '
            f'aria-selected="{tab_aria}">{_esc(name)} <span class="tab-count">{count}</span></button>'
        )
        if name == "LMArena":
            thead = "<tr><th>#</th><th>模型</th><th>Score (Elo)</th><th>投票</th><th>价格 $/M</th><th>上下文</th></tr>"
            note = "数据来源：LMArena Text Arena · 人工盲测 Elo 排行榜"
            source_url = "https://lmarena.ai/leaderboard/text"
        elif name == "Artificial Analysis":
            thead = "<tr><th>#</th><th>模型</th><th>Intelligence Index</th><th>Cost/Task</th></tr>"
            note = "数据来源：Artificial Analysis Intelligence Index"
            source_url = "https://artificialanalysis.ai/leaderboards/models"
        elif name == "LiveBench":
            thead = "<tr><th>#</th><th>模型</th><th>Overall</th><th>推理</th><th>编码</th><th>数学</th><th>语言</th><th>Cost</th></tr>"
            note = "数据来源：LiveBench · 抗污染客观评测"
            source_url = "https://livebench.ai/"
        elif name == "OpenCompass 司南":
            thead = "<tr><th>#</th><th>模型</th><th>均分</th><th>参数量</th><th>语言</th><th>知识</th><th>推理</th><th>数学</th><th>代码</th><th>智能体</th></tr>"
            note = "数据来源：OpenCompass 司南 · 上海人工智能实验室官方评测榜"
            source_url = "https://rank.opencompass.org.cn/home"
        else:
            thead = "<tr><th>#</th><th>模型</th><th>Average</th><th>参数量</th><th>架构</th></tr>"
            note = "数据来源：HuggingFace Open LLM Leaderboard v2 · 开源模型"
            source_url = "https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard"

        body = (
            _render_rank_rows(ranks, name)
            if ranks
            else '<tr><td colspan="6" class="empty-cell">暂无数据</td></tr>'
        )
        source_link = (
            f'<p class="table-note">{note} · <a href="{_esc(source_url)}" target="_blank" rel="noopener" class="source-link">查看原始来源 ↗</a></p>'
            if source_url
            else f'<p class="table-note">{note}</p>'
        )
        panels.append(
            f"""<div class="tab-panel{active}" id="panel-{i}" role="tabpanel">
<div class="table-wrap">
<table>
<thead>{thead}</thead>
<tbody>{body}</tbody>
</table>
{source_link}
</div>
</div>"""
        )

    return f"""<div class="tabs">
<div class="tab-bar" role="tablist">
{''.join(tabs)}
</div>
{''.join(panels)}
</div>"""


def _render_digest(digest: Digest) -> str:
    """把结构化 Digest 渲染成干净的卡片排版（与 AI4S 简报同款）。"""
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
  <h2>今日模型测评简报</h2>
  {date_html}
  {''.join(item_cards)}
  {trend_html}
</div>"""


def _render_news(news: list[Article]) -> str:
    if not news:
        return '<p class="empty">暂无测评新闻</p>'
    articles = sorted(
        news, key=lambda a: a.published or dt.datetime.min, reverse=True
    )
    chunks = []
    for a in articles:
        color = SOURCE_COLORS.get(a.source_name, "#666")
        summary = ""
        if a.summary:
            import re

            clean = re.sub(r"<[^>]+>", "", a.summary).replace("&nbsp;", " ").strip()
            s = clean[:220].strip()
            summary = f'<p class="summary">{_esc(s)}{"…" if len(clean) > 220 else ""}</p>'
        chunks.append(
            f"""<article class="card">
  <div class="card-head">
    <span class="badge" style="background:{color}">{_esc(a.source_name)}</span>
    <span class="date">{_esc(a.date_str)}</span>
  </div>
  <h3><a href="{_esc(a.url)}" target="_blank" rel="noopener">{_esc(a.title)}</a></h3>
  {summary}
</article>"""
        )
    return '<div class="grid">' + "\n".join(chunks) + "</div>"


def render_eval(
    leaderboards: dict[str, list[RankEntry]],
    news: list[Article],
    output: Path,
    digest: Digest | None = None,
) -> Path:
    """渲染 AI 大模型测评看板到 output/eval.html（与主看板 index.html 同级）。"""
    output.mkdir(parents=True, exist_ok=True)

    now = dt.datetime.now().strftime("%Y-%m-%d %H:%M")
    digest_html = _render_digest(digest) if digest and digest.valid else ""
    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI 大模型测评看板</title>
<style>
:root {{ color-scheme: light dark; }}
* {{ box-sizing: border-box; }}
body {{ font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; margin:0; background:#f6f7f9; color:#222; line-height:1.6; }}
.wrap {{ max-width: 1080px; margin: 0 auto; padding: 24px 16px 64px; }}
header {{ text-align:center; padding: 28px 0 12px; }}
h1 {{ margin:0; font-size:1.8em; }}
.sub {{ color:#666; font-size:.92em; }}
.nav {{ text-align:center; margin:8px 0 16px; }}
.nav a {{ color:#1a73e8; text-decoration:none; font-size:.9em; }}
.nav a:hover {{ text-decoration:underline; }}
.section {{ margin-top:28px; }}
.section-title {{ display:flex; align-items:center; gap:10px; margin:0 0 12px; font-size:1.2em; }}
.table-wrap {{ overflow-x:auto; background:#fff; border:1px solid #e3e6ea; border-radius:12px; padding:8px 16px; }}
table {{ border-collapse:collapse; width:100%; font-size:.9em; }}
th, td {{ padding:9px 10px; text-align:left; border-bottom:1px solid #eef0f3; }}
th {{ color:#666; font-weight:600; font-size:.85em; }}
.rank {{ font-weight:700; color:#1a73e8; width:36px; }}
.model {{ font-weight:600; }}
.model a {{ color:#1a0dab; text-decoration:none; }}
.model a:hover {{ text-decoration:underline; }}
.org {{ display:block; color:#888; font-size:.78em; font-weight:400; }}
.score {{ font-weight:600; }}
.votes, .price, .ctx {{ color:#555; font-size:.88em; }}
.empty-cell {{ color:#999; text-align:center; padding:16px; }}
.table-note {{ color:#999; font-size:.8em; margin:8px 0 12px; }}
.source-link {{ color:#1a73e8; text-decoration:none; font-weight:600; }}
.source-link:hover {{ text-decoration:underline; }}
.tabs {{ margin-bottom:8px; }}
.tab-bar {{ display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px; }}
.tab {{ background:#fff; border:1px solid #d5dbe2; border-radius:999px; padding:7px 16px; font-size:.88em; cursor:pointer; color:#444; transition:all .15s; }}
.tab:hover {{ border-color:#1a73e8; color:#1a73e8; }}
.tab.active {{ background:#1a73e8; border-color:#1a73e8; color:#fff; }}
.tab-count {{ opacity:.75; font-size:.82em; margin-left:4px; }}
.tab-panel {{ display:none; }}
.tab-panel.active {{ display:block; }}
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
.grid {{ display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:14px; }}
.card {{ background:#fff; border:1px solid #e3e6ea; border-radius:10px; padding:14px 16px; }}
.card h3 {{ margin:8px 0 6px; font-size:.98em; }}
.card h3 a {{ color:#1a0dab; text-decoration:none; }}
.card h3 a:hover {{ text-decoration:underline; }}
.card-head {{ display:flex; align-items:center; gap:8px; font-size:.8em; }}
.badge {{ color:#fff; padding:2px 8px; border-radius:999px; font-size:.72em; font-weight:600; white-space:nowrap; }}
.date {{ color:#888; }}
.summary {{ color:#444; font-size:.86em; margin:4px 0; }}
.empty {{ color:#888; padding:20px; background:#fff; border:1px solid #e3e6ea; border-radius:10px; }}
footer {{ text-align:center; color:#999; font-size:.8em; margin-top:32px; }}
@media (prefers-color-scheme: dark) {{
  body {{ background:#14171c; color:#e8eaed; }}
  .table-wrap, .card, .empty, .digest {{ background:#1e232b; border-color:#2b313b; }}
  th, td {{ border-bottom-color:#2b313b; }}
  th, .org, .date, .table-note, .votes, .price, .ctx, .digest-date {{ color:#9aa0a6; }}
  .model a, .card h3 a, .digest-title a {{ color:#8ab4f8; }}
  .summary, .digest-impact {{ color:#c9cdd3; }}
  .digest-why, .digest-trend p {{ color:#c0c4cc; }}
  .digest-item, .digest-trend {{ border-top-color:#2b313b; }}
  .tab {{ background:#1e232b; border-color:#2b313b; color:#c9cdd3; }}
  .sub {{ color:#9aa0a6; }}
  .source-link {{ color:#8ab4f8; }}
}}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>📊 AI 大模型测评看板</h1>
    <div class="sub">四大权威排行榜 · 全文深度分析 · 权威媒体测评新闻</div>
    <div class="nav"><a href="index.html">← 返回 AI4S 进展看板</a></div>
  </header>

  {digest_html}

  <section class="section">
    <h2 class="section-title">🏆 权威基准排行榜（点击标签切换）</h2>
    {_render_rank_table(leaderboards)}
  </section>

  <section class="section">
    <h2 class="section-title">📰 模型测评动态与新闻</h2>
    {_render_news(news)}
  </section>

  <footer>更新时间：{now} · LMArena / Artificial Analysis / LiveBench / Open LLM Leaderboard / MIT TR / The Verge</footer>
</div>
<script>
document.querySelectorAll('.tab').forEach(function(tab) {{
  tab.addEventListener('click', function() {{
    var idx = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach(function(t) {{
      t.classList.remove('active'); t.setAttribute('aria-selected', 'false');
    }});
    tab.classList.add('active'); tab.setAttribute('aria-selected', 'true');
    document.querySelectorAll('.tab-panel').forEach(function(p) {{
      p.classList.toggle('active', p.id === 'panel-' + idx);
    }});
  }});
}});
</script>
</body>
</html>"""
    out = output / "eval.html"
    out.write_text(html, encoding="utf-8")
    return out


def render_eval_json(
    leaderboards: dict[str, list[RankEntry]],
    news: list[Article],
    output: Path,
) -> tuple[Path, dict]:
    output.mkdir(parents=True, exist_ok=True)
    data = {
        "updated": dt.datetime.now().isoformat(),
        "leaderboards": {
            name: [r.__dict__ for r in ranks]
            for name, ranks in leaderboards.items()
        },
        "news": [
            {
                "title": a.title,
                "url": a.url,
                "source": a.source_name,
                "published": a.date_str,
                "summary": a.summary,
            }
            for a in news
        ],
    }
    out = output / "eval.json"
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return out, data
