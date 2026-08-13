import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/site-header";
import CategoryChips from "@/components/category-chips";
import ItemCard from "@/components/item-card";
import Pagination from "@/components/pagination";
import { readItems, readVoteCounts } from "@/lib/store";
import { computeHotRanking } from "@/lib/hot";
import { readGitHubTrending } from "@/lib/github-store";
import { readBenchmarks, sortByMetric } from "@/lib/benchmark";
import { CATEGORY_LABELS, type Category } from "@/lib/types";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI4S — AI 行业动态聚合 · 每日精选",
  description:
    "AI4S 每日精选 AI 行业动态：模型发布、产品发布、行业事件、论文、教程与观点。",
};

const PAGE_SIZE = 30;

interface HomeProps {
  searchParams: Promise<{ category?: string; page?: string }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const { category, page: pageParam } = await searchParams;
  const active: Category | "all" =
    category && category in CATEGORY_LABELS
      ? (category as Category)
      : "all";

  const items = await readItems();
  const voteCounts = await readVoteCounts();
  const filtered =
    active === "all"
      ? items.filter((it) => it.aiSelected)
      : items.filter((it) => it.aiSelected && it.category === active);

  const sorted = [...filtered].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  const page = Math.max(1, Number(pageParam) || 1);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pageItems = sorted.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const query: Record<string, string> = {};
  if (active !== "all") query.category = active;

  const hotTop = await computeHotRanking(
    items.filter((it) => it.aiSelected),
    5
  );
  const githubTop = readGitHubTrending()?.repos.slice(0, 3) ?? [];
  const benchmarkSnapshot = readBenchmarks();
  const modelTop = benchmarkSnapshot
    ? sortByMetric(benchmarkSnapshot.models, "overall", 3)
    : [];

  const today = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());

  const subtitle =
    active === "all"
      ? `${today} · AI 自动挑选的高价值内容`
      : `${today} · ${CATEGORY_LABELS[active]}类精选`;

  return (
    <main className={styles.main}>
      <SiteHeader active="feed" />

      <section className={styles.hero}>
        <h1 className={styles.pageTitle}>
          {active === "all" ? "精选" : CATEGORY_LABELS[active]}
        </h1>
        <p className={styles.pageSubtitle}>
          {subtitle}
          {sorted.length > PAGE_SIZE && ` · 第 ${current}/${totalPages} 页`}
        </p>
      </section>

      <div className={styles.chips}>
        <CategoryChips active={active} />
      </div>

      {pageItems.length === 0 ? (
        <div className={styles.empty}>
          <p>该分类暂时没有精选内容。</p>
          <p className={styles.emptyHint}>
            运行 <code className="mono">npm run ingest</code> 触发抓取 + AI 加工。
          </p>
        </div>
      ) : (
        <>
          <div className={styles.grid}>
            {pageItems.map((item) => (
              <ItemCard key={item.id} item={item} votes={voteCounts.get(item.id) ?? 0} />
            ))}
          </div>
          <Pagination
            current={current}
            total={sorted.length}
            pageSize={PAGE_SIZE}
            basePath="/"
            query={query}
          />
        </>
      )}

      <section className={styles.insights}>
        <div className={styles.insightCard}>
          <h2 className={styles.insightTitle}>
            <Link href="/hot">热门排行 Top 5 ↗</Link>
          </h2>
          {hotTop.length === 0 ? (
            <p className={styles.insightEmpty}>暂无数据</p>
          ) : (
            <ol className={styles.insightList}>
              {hotTop.map(({ item, heat }) => (
                <li key={item.id} className={styles.insightRow}>
                  <Link href={`/items/${item.id}`} className={styles.insightLink}>
                    {item.titleZh}
                  </Link>
                  <span className={styles.insightMeta}>{heat}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className={styles.insightCard}>
          <h2 className={styles.insightTitle}>
            <Link href="/github">GitHub 周热榜 ↗</Link>
          </h2>
          {githubTop.length === 0 ? (
            <p className={styles.insightEmpty}>暂无数据</p>
          ) : (
            <ol className={styles.insightList}>
              {githubTop.map((repo) => (
                <li key={repo.id} className={styles.insightRow}>
                  <a
                    href={repo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.insightLink}
                  >
                    {repo.fullName}
                  </a>
                  <span className={styles.insightMeta}>
                    ★ {repo.stars >= 1000 ? `${(repo.stars / 1000).toFixed(1)}k` : repo.stars}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className={styles.insightCard}>
          <h2 className={styles.insightTitle}>
            <Link href="/benchmark">模型综合榜 Top 3 ↗</Link>
          </h2>
          {modelTop.length === 0 ? (
            <p className={styles.insightEmpty}>暂无数据</p>
          ) : (
            <ol className={styles.insightList}>
              {modelTop.map((model) => (
                <li key={model.slug} className={styles.insightRow}>
                  <Link href="/benchmark" className={styles.insightLink}>
                    {model.shortName || model.name}
                  </Link>
                  <span className={styles.insightMeta}>{model.creator}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </main>
  );
}
