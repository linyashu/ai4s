"""个人知识库：按快照存档抓取数据与 LLM 分析结果，支持查询与导出。

目录结构：
    kb/
      ai4s/YYYYMMDD-HHMM.json    # AI4S 抓取 + digest
      eval/YYYYMMDD-HHMM.json    # 测评抓取 + digest
      index.json                 # 所有快照元数据

查询工具（命令行）：
    python kb_query.py --source ai4s --since 2026-08-01 --keywords 蛋白质
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_KB = Path(__file__).resolve().parent.parent / "kb"
DEFAULT_ARCHIVE = Path(__file__).resolve().parent.parent / "archive"
DEFAULT_RETENTION_DAYS = 30


def _ts() -> str:
    return dt.datetime.now().strftime("%Y%m%d-%H%M")


def save_snapshot(
    kb_dir: Path,
    archive_dir: Path,
    ai4s_data: dict,
    eval_data: dict,
    site_dir: Path | None = None,
    retention_days: int = DEFAULT_RETENTION_DAYS,
) -> None:
    """保存一次运行的知识库快照 + 看板存档，并清理过期快照。

    ai4s_data: {"articles": [...], "digest": {...}}
    eval_data: {"leaderboards": {...}, "news": [...], "digest": {...}}
    """
    stamp = _ts()
    kb_dir = Path(kb_dir)
    archive_dir = Path(archive_dir)

    # 1) 知识库：结构化数据（供后续爬取 / 喂 LLM）
    for sub, payload in (("ai4s", ai4s_data), ("eval", eval_data)):
        if not payload:
            continue
        d = kb_dir / sub
        d.mkdir(parents=True, exist_ok=True)
        path = d / f"{stamp}.json"
        path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        logger.info("知识库存档: %s (%d 字段)", path, len(payload))

    # 2) 看板页面存档（HTML 快照）
    if site_dir and Path(site_dir).exists():
        target = archive_dir / stamp
        target.mkdir(parents=True, exist_ok=True)
        for f in ("index.html", "data.json", "eval.html", "eval.json"):
            src = Path(site_dir) / f
            if src.exists():
                shutil.copy2(src, target / f)
        logger.info("看板存档: %s", target)

    # 3) 清理超过保留期的快照
    _cleanup(kb_dir, retention_days)
    _cleanup(archive_dir, retention_days)

    # 4) 更新索引
    _write_index(kb_dir)


def _cleanup(root: Path, retention_days: int) -> None:
    """删除 root 下超过 retention_days 的日期快照。"""
    if not root.exists():
        return
    cutoff = dt.datetime.now() - dt.timedelta(days=retention_days)
    for d in root.iterdir():
        if not d.is_dir():
            continue
        try:
            snap = dt.datetime.strptime(d.name, "%Y%m%d-%H%M")
        except ValueError:
            continue
        if snap < cutoff:
            shutil.rmtree(d)
            logger.info("清理过期快照: %s", d)


def _write_index(kb_dir: Path) -> None:
    index: dict = {"updated": dt.datetime.now().isoformat(), "snapshots": {}}
    for sub in ("ai4s", "eval"):
        d = kb_dir / sub
        if not d.exists():
            continue
        snaps = []
        for f in sorted(d.glob("*.json")):
            try:
                snap = dt.datetime.strptime(f.stem, "%Y%m%d-%H%M")
            except ValueError:
                continue
            size = f.stat().st_size
            snaps.append({"time": snap.isoformat(), "file": f.name, "size": size})
        index["snapshots"][sub] = snaps
    (kb_dir / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8"
    )


# ---------------------------------------------------------------------------
# 查询与导出（供调用 LLM 分析）
# ---------------------------------------------------------------------------

def query(
    kb_dir: Path = DEFAULT_KB,
    source: str = "ai4s",
    since: str | None = None,
    until: str | None = None,
    keywords: str | None = None,
) -> list[dict]:
    """按时间范围与关键词查询快照，返回快照内容列表。"""
    d = Path(kb_dir) / source
    if not d.exists():
        return []
    since_dt = _parse_dt(since) if since else None
    until_dt = _parse_dt(until) if until else None
    kws = [k.strip().lower() for k in (keywords or "").split(",") if k.strip()]

    results = []
    for f in sorted(d.glob("*.json")):
        try:
            snap = dt.datetime.strptime(f.stem, "%Y%m%d-%H%M")
        except ValueError:
            continue
        if since_dt and snap < since_dt:
            continue
        if until_dt and snap > until_dt:
            continue
        data = json.loads(f.read_text(encoding="utf-8"))
        if kws:
            blob = json.dumps(data, ensure_ascii=False).lower()
            if not all(kw in blob for kw in kws):
                continue
        results.append({"time": snap.isoformat(), "file": f.name, "data": data})
    return results


def _parse_dt(s: str) -> dt.datetime:
    s = s.strip()
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d", "%Y%m%d"):
        try:
            return dt.datetime.strptime(s, fmt)
        except ValueError:
            continue
    raise ValueError(f"无法解析时间: {s!r}")


def export_markdown(
    kb_dir: Path = DEFAULT_KB,
    source: str = "ai4s",
    since: str | None = None,
    until: str | None = None,
    keywords: str | None = None,
) -> str:
    """把查询结果拼成 Markdown，供直接喂给 LLM 做分析。"""
    snaps = query(kb_dir, source, since, until, keywords)
    parts = [f"# {source.upper()} 知识库查询结果（{len(snaps)} 个快照）", ""]
    for snap in snaps:
        parts.append(f"## 快照 {snap['time']}")
        data = snap["data"]
        digest = data.get("digest") or {}
        if digest.get("items"):
            parts.append("### LLM 分析")
            for it in digest["items"]:
                parts.append(
                    f"- **{it.get('title','')}** [{it.get('source','')}] "
                    f"\n  - 点评：{it.get('impact','')}\n  - 理由：{it.get('why','')}"
                )
            if digest.get("trend"):
                parts.append(f"\n**趋势观察**：{digest['trend']}")
            parts.append("")
        articles = data.get("articles") or data.get("news") or []
        if articles:
            parts.append(f"### 抓取条目（{len(articles)} 条）")
            for a in articles[:20]:
                parts.append(f"- {a.get('published','')} | {a.get('title','')} | {a.get('url','')}")
            parts.append("")
    return "\n".join(parts)
