import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoryById, readItems } from "@/lib/store";
import { CATEGORY_LABELS } from "@/lib/types";
import { ScoreBadge } from "@/components/item-card";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

interface StoryProps {
  params: Promise<{ id: string }>;
}

function decodeId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function getPageData(id: string) {
  const story = await getStoryById(id);
  if (!story) return null;
  const items = await readItems();
  const members = story.itemIds
    .map((itemId) => items.find((it) => it.id === itemId))
    .filter(Boolean) as NonNullable<(typeof items)[number]>[];
  return { story, members };
}

export async function generateMetadata({ params }: StoryProps): Promise<Metadata> {
  const { id: rawId } = await params;
  const data = await getPageData(decodeId(rawId));
  if (!data) return {};
  return {
    title: `${data.story.titleZh} · AI4S 事件聚合`,
    description: data.story.summaryZh.slice(0, 150),
  };
}

export default async function StoryPage({ params }: StoryProps) {
  const { id: rawId } = await params;
  const data = await getPageData(decodeId(rawId));
  if (!data) notFound();

  const { story, members } = data;

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <Link className={styles.backLink} href="/stories">
          ← 事件聚合
        </Link>
      </header>

      <article className={styles.article}>
        <div className={styles.meta}>
          <span className={styles.sources}>{members.length} 个信源</span>
          <span className={styles.category}>
            {CATEGORY_LABELS[story.category]}
          </span>
          <span className={styles.time}>
            {new Date(story.publishedAt).getMonth() + 1}月
            {new Date(story.publishedAt).getDate()}日
          </span>
          <span className={styles.flex} />
          <ScoreBadge score={story.finalScore} />
        </div>

        <h1 className={styles.title}>{story.titleZh}</h1>
        <p className={styles.summary}>{story.summaryZh}</p>
      </article>

      <section className={styles.members}>
        <h2 className={styles.membersTitle}>相关报道</h2>
        <div className={styles.memberList}>
          {members.map((item) => (
            <Link
              key={item.id}
              href={`/items/${item.id}`}
              className={styles.member}
            >
              <div className={styles.memberHead}>
                <span className={styles.memberSource}>{item.source.name}</span>
                <span className={styles.memberTime}>
                  {new Date(item.publishedAt).getMonth() + 1}月
                  {new Date(item.publishedAt).getDate()}日{" "}
                  {String(new Date(item.publishedAt).getHours()).padStart(2, "0")}:
                  {String(new Date(item.publishedAt).getMinutes()).padStart(2, "0")}
                </span>
              </div>
              <p className={styles.memberTitle}>{item.titleZh}</p>
              <p className={styles.memberSummary}>{item.summaryZh}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
