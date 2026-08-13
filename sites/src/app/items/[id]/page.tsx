import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getItemById, readItems } from "@/lib/store";
import { siteUrl } from "@/lib/site-url";
import { CATEGORY_LABELS } from "@/lib/types";
import { ScoreBadge } from "@/components/item-card";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

interface ItemProps {
  params: Promise<{ id: string }>;
}

async function getPageData(id: string) {
  const item = await getItemById(id);
  if (!item) return null;

  const all = await readItems();
  const related = all
    .filter(
      (it) =>
        it.id !== item.id &&
        (it.category === item.category ||
          it.aiTags.some((t) => item.aiTags.some((mt) => mt.tag === t.tag)))
    )
    .sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    )
    .slice(0, 6);

  return { item, related };
}

export async function generateMetadata({ params }: ItemProps): Promise<Metadata> {
  const { id: rawId } = await params;
  const id = decodeId(rawId);
  const data = await getPageData(id);
  if (!data) return {};
  return {
    title: `${data.item.titleZh} · AI4S`,
    description: data.item.summaryZh.slice(0, 150),
  };
}

function decodeId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default async function ItemPage({ params }: ItemProps) {
  const { id: rawId } = await params;
  const id = decodeId(rawId);
  const data = await getPageData(id);
  if (!data) notFound();

  const { item, related } = data;
  const published = new Date(item.publishedAt);
  const siteUrlValue = siteUrl();
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: item.titleZh,
    description: item.summaryZh.slice(0, 200),
    datePublished: item.publishedAt,
    author: { "@type": "Organization", name: "AI4S" },
    publisher: { "@id": `${siteUrlValue}/#organization` },
    mainEntityOfPage: `${siteUrlValue}/items/${encodeURIComponent(item.id)}`,
    url: item.url,
  };

  return (
    <main className={styles.main}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
      />
      <header className={styles.header}>
        <Link className={styles.backLink} href="/">
          ← 返回精选
        </Link>
      </header>

      <article className={styles.article}>
        <div className={styles.meta}>
          <span className={styles.source}>{item.source.name}</span>
          <span className={styles.time}>
            {published.getMonth() + 1}月{published.getDate()}日{" "}
            {String(published.getHours()).padStart(2, "0")}:
            {String(published.getMinutes()).padStart(2, "0")}
          </span>
        </div>

        <h1 className={styles.title}>{item.titleZh}</h1>

        {item.aiSelectedReason && (
          <div className={styles.note}>
            <span className={styles.noteLabel}>AI 精选理由</span>
            <p className={styles.noteText}>{item.aiSelectedReason}</p>
          </div>
        )}

        <p className={styles.summary}>{item.summaryZh}</p>

        <div className={styles.tags}>
          <span className={styles.category}>
            {CATEGORY_LABELS[item.category]}
          </span>
          {item.aiTags.map((t) => (
            <span key={t.tag} className={styles.tag}>
              {t.tag}
            </span>
          ))}
          <span className={styles.flex} />
          <ScoreBadge score={item.finalScore} />
        </div>

        <div className={styles.actions}>
          <a
            className={styles.original}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            阅读原文 ↗
          </a>
        </div>
      </article>

      {related.length > 0 && (
        <section className={styles.related}>
          <h2 className={styles.relatedTitle}>相关动态</h2>
          <div className={styles.relatedGrid}>
            {related.map((it) => (
              <Link key={it.id} href={`/items/${it.id}`} className={styles.relatedCard}>
                <div className={styles.relatedCat}>
                  {CATEGORY_LABELS[it.category]}
                </div>
                <p className={styles.relatedText}>{it.titleZh}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
