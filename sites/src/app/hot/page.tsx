import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/site-header";
import { readItems, readStories, readHeatSnapshots } from "@/lib/store";
import { computeHotRanking } from "@/lib/hot";
import { CATEGORY_LABELS } from "@/lib/types";
import Spark from "@/components/spark";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI4S — 热门排行",
  description: "AI4S 热门话题排行，精选信源权重 + 用户投票加成 + 24 小时半衰期热度衰减。",
};

const WINDOWS = [
  { key: "24h", hours: 24, label: "24 小时" },
  { key: "7d", hours: 168, label: "7 天" },
] as const;

interface HotProps {
  searchParams: Promise<{ window?: string }>;
}

function heatBarClass(rank: number): string {
  return rank <= 3 ? `bar-top` : `bar-rest`;
}

export default async function HotPage({ searchParams }: HotProps) {
  const { window: windowParam } = await searchParams;
  const windowKey = windowParam === "7d" ? "7d" : "24h";
  const windowHours = WINDOWS.find((w) => w.key === windowKey)?.hours ?? 24;

  const items = (await readItems()).filter((it) => it.aiSelected);
  const stories = await readStories();
  const heatSnaps = await readHeatSnapshots();
  const series = heatSnaps.flatMap((s) =>
    s.points.map((p) => ({ ts: s.timestamp, heat: p.heat, itemId: p.itemId }))
  );
  const ranking = await computeHotRanking(items, 10, undefined, stories, windowHours);

  const maxHeat = ranking[0]?.heat ?? 1;

  return (
    <main className={styles.main}>
      <SiteHeader active="hot" />

      <section className={styles.hero}>
        <h1 className={styles.pageTitle}>热门排行</h1>
        <p className={styles.pageSubtitle}>
          精选信源权重 + 用户投票加成，按 24 小时半衰期衰减
        </p>
      </section>

      <div className={styles.windowTabs} role="tablist" aria-label="时间窗口">
        {WINDOWS.map((w) => (
          <a
            key={w.key}
            href={w.key === "24h" ? "/hot" : `/hot?window=${w.key}`}
            role="tab"
            aria-selected={windowKey === w.key}
            className={`${styles.windowTab} ${windowKey === w.key ? styles.windowTabActive : ""}`}
          >
            {w.label}
          </a>
        ))}
      </div>

      {ranking.length === 0 ? (
        <div className={styles.empty}>
          <p>暂无热门数据，运行 npm run ingest 生成。</p>
        </div>
      ) : (
        <ol className={styles.rankList}>
          {ranking.map(({ item, heat, rank, storyMembers, vibeVotes }) => {
            const story = stories.find((s) => s.itemIds.includes(item.id));
            return (
              <li key={item.id} className={styles.rankRow}>
                <span className={`${styles.rankNumber} ${styles[`rankNumber${rank}`]}`}>
                  {rank}
                </span>

                <div className={styles.rankContent}>
                  <Link href={`/items/${item.id}`} className={styles.rankTitle}>
                    {item.titleZh}
                  </Link>

                  <div className={styles.rankMeta}>
                    <span className={styles.rankSource}>{item.source.name}</span>
                    <span className={styles.rankCategory}>
                      {CATEGORY_LABELS[item.category]}
                    </span>
                    {storyMembers > 1 && (
                      <Link
                        href={story ? `/stories/${story.id}` : "#"}
                        className={styles.rankDup}
                      >
                        {storyMembers} 信源报道
                      </Link>
                    )}
                  </div>

                <div className={styles.rankBarTrack}>
                  <div
                    className={`${styles.rankBar} ${styles[heatBarClass(rank)]}`}
                    style={{ width: `${Math.round((heat / maxHeat) * 100)}%` }}
                  />
                </div>
              </div>

              <Spark itemId={item.id} series={series} />

              <div className={styles.rankHeat}>
                  <span className={styles.heatValue}>{heat}</span>
                  <span className={styles.heatLabel}>热度</span>
                  {vibeVotes > 0 && (
                    <span className={styles.vibe}>票 {vibeVotes}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
