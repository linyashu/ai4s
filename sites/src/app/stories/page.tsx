import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/site-header";
import { readStories } from "@/lib/store";
import { CATEGORY_LABELS } from "@/lib/types";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI4S — 事件聚合",
  description: "AI4S 将同一事件的多信源报道聚合成一个故事，一站式了解来龙去脉。",
};

export default async function StoriesPage() {
  const stories = await readStories();

  const sorted = [...stories].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  return (
    <main className={styles.main}>
      <SiteHeader active="stories" />

      <section className={styles.hero}>
        <h1 className={styles.pageTitle}>事件聚合</h1>
        <p className={styles.pageSubtitle}>
          同一事件的多信源报道合并为一个故事 · {sorted.length} 个
        </p>
      </section>

      {sorted.length === 0 ? (
        <div className={styles.empty}>
          <p>暂无事件聚合数据，运行 npm run ingest 生成。</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {sorted.map((story) => {
            return (
              <Link
                key={story.id}
                href={`/stories/${story.id}`}
                className={styles.card}
              >
                <div className={styles.cardHead}>
                  <span className={styles.sources}>
                    {story.sources.length} 个信源
                  </span>
                  <span className={styles.category}>
                    {CATEGORY_LABELS[story.category]}
                  </span>
                </div>
                <h2 className={styles.cardTitle}>{story.titleZh}</h2>
                <p className={styles.cardSummary}>{story.summaryZh}</p>
                <div className={styles.cardFoot}>
                  <span className={styles.time}>
                    {new Date(story.publishedAt).getMonth() + 1}月
                    {new Date(story.publishedAt).getDate()}日
                  </span>
                  <span className={styles.score}>{story.finalScore}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
