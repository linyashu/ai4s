import Link from "next/link";
import type { AIItem } from "@/lib/types"
import { CATEGORY_LABELS } from "@/lib/types"
import styles from "./item-card.module.css"

function timeAgo(publishedAt: string): string {
  const diff = Date.now() - new Date(publishedAt).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "刚刚"
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}

export function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 80 ? "high" : score >= 70 ? "mid" : "low"
  return (
    <span className={`${styles.score} ${styles[`score-${tone}`]}`}>{score}</span>
  )
}

export default function ItemCard({ item }: { item: AIItem }) {
  return (
    <article className={styles.card}>
      <div className={styles.head}>
        <span className={styles.source}>{item.source.name}</span>
        <span className={styles.time}>{timeAgo(item.publishedAt)}</span>
      </div>

      <Link href={`/items/${item.id}`} className={styles.title}>
        {item.titleZh}
      </Link>

      {item.aiSelectedReason && (
        <div className={styles.note}>
          <span className={styles.noteLabel}>AI 精选</span>
          <span className={styles.noteText}>{item.aiSelectedReason}</span>
        </div>
      )}

      <p className={styles.summary}>{item.summaryZh}</p>

      <div className={styles.foot}>
        <span className={styles.category}>{CATEGORY_LABELS[item.category]}</span>
        {item.aiTags.map((t) => (
          <span key={t.tag} className={styles.tag}>
            {t.tag}
          </span>
        ))}
        <span className={styles.flex} />
        <ScoreBadge score={item.finalScore} />
      </div>
    </article>
  )
}
