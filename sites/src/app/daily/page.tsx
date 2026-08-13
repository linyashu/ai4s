import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/site-header";
import { buildTodayItems, readDailyDeepReport } from "@/lib/daily";
import { CATEGORY_LABELS } from "@/lib/types";
import { ScoreBadge } from "@/components/item-card";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI4S 日报 — 今日 AI 精选",
  description: "AI4S 今日 AI 行业日报：精选动态、头条事件，一站看全今天有什么 AI 新闻。",
};

export default async function DailyPage() {
  const items = await buildTodayItems();
  const deepReport = await readDailyDeepReport();
  const todayLabel = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());

  const headlineItems = [...items]
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, 3);

  const byCategory = new Map<string, typeof items>();
  for (const it of items) {
    if (!byCategory.has(it.category)) byCategory.set(it.category, []);
    byCategory.get(it.category)!.push(it);
  }

  return (
    <main className={styles.main}>
      <SiteHeader active="daily" />

      <section className={styles.hero}>
        <h1 className={styles.pageTitle}>AI 日报</h1>
        <p className={styles.pageSubtitle}>{todayLabel} · 今日 {items.length} 条精选动态</p>
      </section>

      {items.length === 0 ? (
        <div className={styles.empty}>
          <p>今日暂无日报数据。数据抓取完成后会自动生成。</p>
        </div>
      ) : (
        <>
          {deepReport && (
            <section className={styles.deepSection}>
              <h2 className={styles.sectionTitle}>
                今日解读 <span className={styles.deepBadge}>AI 生成</span>
              </h2>
              <div className={styles.deepCard}>
                <h3 className={styles.deepHeadline}>{deepReport.headline}</h3>
                <p className={styles.deepAnalysis}>{deepReport.analysis}</p>
                {deepReport.points.length > 0 && (
                  <ul className={styles.deepPoints}>
                    {deepReport.points.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}

          {headlineItems.length > 0 && (
            <section className={styles.headlines}>
              <h2 className={styles.sectionTitle}>今日头条</h2>
              <div className={styles.headlineList}>
                {headlineItems.map((it, i) => (
                  <Link
                    key={it.id}
                    href={`/items/${it.id}`}
                    className={styles.headline}
                  >
                    <span className={styles.headlineNum}>{i + 1}</span>
                    <div className={styles.headlineBody}>
                      <p className={styles.headlineTitle}>{it.titleZh}</p>
                      <p className={styles.headlineSource}>
                        {it.source.name} · {it.summaryZh.slice(0, 80)}…
                      </p>
                    </div>
                    <ScoreBadge score={it.finalScore} />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {[...byCategory.entries()].map(([cat, catItems]) => (
            <section key={cat} className={styles.categorySection}>
              <h2 className={styles.sectionTitle}>
                {CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS]}{" "}
                <span className={styles.sectionCount}>{catItems.length}</span>
              </h2>
              <div className={styles.categoryList}>
                {catItems.map((it) => (
                  <Link key={it.id} href={`/items/${it.id}`} className={styles.categoryItem}>
                    <span className={styles.categoryItemTitle}>{it.titleZh}</span>
                    <span className={styles.categoryItemMeta}>
                      {it.source.name} · {it.finalScore}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </main>
  );
}
