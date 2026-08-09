"""主入口：抓取 → 全文精析 → 渲染看板 → 知识库存档。

用法：
    python main.py                 # 用项目根目录 config.yaml + .env
    python main.py --config x.yaml --output ./site
    python main.py --no-archive    # 不存知识库
"""
from __future__ import annotations

import argparse
import logging
from pathlib import Path

from ai4s import config, render
from ai4s.collectors import collect_all
from ai4s.summarizer import Digest, summarize

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def main() -> None:
    parser = argparse.ArgumentParser(description="AI4S 每日进展看板生成器")
    parser.add_argument("--config", default=None, help="config.yaml 路径")
    parser.add_argument("--output", default=None, help="输出目录（默认项目下 site/）")
    parser.add_argument("--no-digest", action="store_true", help="跳过 LLM 摘要")
    parser.add_argument(
        "--max-fulltext",
        type=int,
        default=10,
        help="为摘要分析抓取全文的最大文章数（默认 10）",
    )
    parser.add_argument("--no-archive", action="store_true", help="跳过知识库存档")
    parser.add_argument("--retention", type=int, default=30, help="看板存档保留天数")
    args = parser.parse_args()

    config.load_env()
    cfg = config.load_config(args.config)
    out_dir = Path(args.output) if args.output else config.PROJECT_ROOT / "site"

    logger.info("开始抓取信源…")
    articles = collect_all(cfg)
    logger.info("共抓取 %d 条", len(articles))

    digest = Digest()
    if not args.no_digest:
        llm = config.llm_config()
        # 阶段 1：粗选候选（仅标题+摘要，省 token）
        from ai4s.fulltext import fetch_fulltext_batch
        from ai4s.summarizer import _select_candidates

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
        shortlist = _select_candidates(llm, payload, args.max_fulltext)
        logger.info("粗选候选 %d 条，开始抓取全文…", len(shortlist))
        fulltexts = fetch_fulltext_batch(
            [(it["title"], it["url"]) for it in shortlist],
            max_items=args.max_fulltext,
        )
        digest = summarize(llm, articles, fulltexts=fulltexts)
        if digest.valid:
            logger.info("LLM 深度分析完成：%d 条进展", len(digest.items))

    html_path = render.render(articles, digest, out_dir)
    _, ai4s_json = render.render_json(articles, out_dir)
    logger.info("看板已生成: %s", html_path)
    logger.info("数据已导出: %s", out_dir / "data.json")

    eval_data_for_kb: dict = {}
    if cfg.get("eval", {}).get("enabled", True):
        from ai4s import eval_collectors, eval_render
        from ai4s.fulltext import fetch_fulltext_batch
        from ai4s.summarizer import summarize_eval, _select_eval_candidates

        logger.info("开始抓取测评数据…")
        eval_data = eval_collectors.collect_eval(cfg)

        eval_digest = Digest()
        if not args.no_digest and eval_data["news"]:
            llm = config.llm_config()
            # 全文分析只针对有独立文章链接的 RSS 新闻；
            # AA changelog 动态（同页列表）仅作展示，不进入全文分析
            analyzable = [
                a for a in eval_data["news"]
                if "artificialanalysis.ai" not in (a.url or "")
            ]
            if not analyzable:
                logger.info("无可分析测评新闻，跳过简报")
            else:
                news_payload = [
                    {
                        "title": a.title,
                        "source": a.source_name,
                        "publisher": a.publisher or a.source_name,
                        "url": a.url,
                        "published": a.date_str,
                        "summary": (a.summary or "")[:800],
                    }
                    for a in analyzable
                ]
                shortlist = _select_eval_candidates(llm, news_payload, args.max_fulltext)
                # 按 URL 去重
                seen_urls: set[str] = set()
                unique = []
                for it in shortlist:
                    u = it.get("url")
                    if u in seen_urls:
                        continue
                    seen_urls.add(u)
                    unique.append(it)
                shortlist = unique
                if shortlist:
                    logger.info("测评粗选候选 %d 条，开始抓取全文…", len(shortlist))
                    fulltexts = fetch_fulltext_batch(
                        [(it["title"], it["url"]) for it in shortlist],
                        max_items=args.max_fulltext,
                    )
                    eval_digest = summarize_eval(
                        llm, analyzable, fulltexts=fulltexts
                    )
                else:
                    eval_digest = summarize_eval(llm, analyzable)

        eval_html = eval_render.render_eval(
            eval_data["leaderboards"], eval_data["news"], out_dir, digest=eval_digest
        )
        _, eval_json = eval_render.render_eval_json(
            eval_data["leaderboards"], eval_data["news"], out_dir
        )
        logger.info("测评看板已生成: %s", eval_html)
        eval_data_for_kb = {
            **eval_json,
            "digest": eval_digest.to_dict() if eval_digest.valid else {},
        }

    if not args.no_archive:
        from ai4s import kb

        kb.save_snapshot(
            kb_dir=kb.DEFAULT_KB,
            archive_dir=kb.DEFAULT_ARCHIVE,
            ai4s_data={"articles": ai4s_json, "digest": digest.to_dict() if digest.valid else {}},
            eval_data=eval_data_for_kb,
            site_dir=out_dir,
            retention_days=args.retention,
        )
        logger.info("知识库存档完成（保留 %d 天）", args.retention)


if __name__ == "__main__":
    main()
