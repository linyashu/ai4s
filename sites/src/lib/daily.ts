import { createHash } from "node:crypto"
import { readItems } from "./store"
import { cnDateKey, isCnToday } from "./time"
import type { AIItem } from "./types"

export interface DailyReport {
  id: string
  dateKey: string
  title: string
  summary: string
  headlineIds: string[]
  itemIds: string[]
  publishedAt: string
}

export function currentDateKey(d = new Date()): string {
  return cnDateKey(d.getTime())
}

export async function buildTodayItems(ref = new Date()): Promise<AIItem[]> {
  return (await readItems())
    .filter((it) => it.aiSelected && isCnToday(it.publishedAt, ref))
    .sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    )
}

export async function buildAllReports(): Promise<DailyReport[]> {
  const items = await readItems()
  const byDate = new Map<string, AIItem[]>()
  for (const it of items) {
    if (!it.aiSelected) continue
    const key = it.dateKey || currentDateKey(new Date(it.publishedAt))
    if (!byDate.has(key)) byDate.set(key, [])
    byDate.get(key)!.push(it)
  }

  const reports: DailyReport[] = []
  for (const [key, dayItems] of byDate) {
    const sorted = [...dayItems].sort((a, b) => b.finalScore - a.finalScore)
    const h = createHash("sha1").update(key).digest("hex").slice(0, 12)
    const id = `daily-${key}-${h}`
    const latest = dayItems.reduce((mx, it) =>
      new Date(it.publishedAt) > new Date(mx.publishedAt) ? it : mx
    )
    reports.push({
      id,
      dateKey: key,
      title: `${key.replaceAll("-", ".")} AI 日报`,
      summary: `收录 ${dayItems.length} 条 AI 精选动态`,
      headlineIds: sorted.slice(0, 3).map((it) => it.id),
      itemIds: dayItems.map((it) => it.id),
      publishedAt: latest.publishedAt,
    })
  }
  return reports.sort((a, b) => b.dateKey.localeCompare(a.dateKey))
}
