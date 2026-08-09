"""个人知识库查询工具。

用法：
    # 查看最近 7 天 AI4S 数据并导出为 Markdown（可直接喂给 LLM）
    python kb_query.py --source ai4s --since 2026-08-02 --markdown

    # 按关键词过滤测评数据
    python kb_query.py --source eval --keywords deepseek,评测

    # 输出原始 JSON
    python kb_query.py --source ai4s --since 2026-08-01 --json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from ai4s import config
from ai4s.kb import DEFAULT_KB, export_markdown, query


def main() -> None:
    parser = argparse.ArgumentParser(description="AI4S 个人知识库查询")
    parser.add_argument("--kb", default=str(DEFAULT_KB), help="知识库目录")
    parser.add_argument("--source", choices=["ai4s", "eval"], default="ai4s")
    parser.add_argument("--since", default=None, help="起始时间，如 2026-08-01")
    parser.add_argument("--until", default=None, help="结束时间，如 2026-08-09")
    parser.add_argument("--keywords", default=None, help="逗号分隔关键词，全部命中")
    parser.add_argument("--markdown", action="store_true", help="输出 Markdown")
    parser.add_argument("--json", action="store_true", help="输出原始 JSON")
    args = parser.parse_args()

    config.load_env()
    if args.markdown:
        print(export_markdown(args.kb, args.source, args.since, args.until, args.keywords))
        return

    results = query(args.kb, args.source, args.since, args.until, args.keywords)
    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
        return

    print(f"{args.source} 快照数: {len(results)}")
    for r in results:
        data = r["data"]
        articles = data.get("articles") or data.get("news") or []
        digest = data.get("digest") or {}
        leaderboards = data.get("leaderboards") or {}
        lb_info = ""
        if leaderboards:
            lb_info = " | 排行榜 " + ", ".join(
                f"{k}:{len(v)}" for k, v in leaderboards.items()
            )
        print(f"  {r['time']}  | 条目 {len(articles)}{lb_info} | LLM分析 {len(digest.get('items') or [])} 条")


if __name__ == "__main__":
    main()
