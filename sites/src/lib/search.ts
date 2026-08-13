import type { AIItem } from "./types"

export interface SearchQuery {
  q: string
  category?: string
}

export function searchItems(items: AIItem[], query: SearchQuery): AIItem[] {
  const kw = query.q.trim().toLowerCase()
  const results = items.filter((it) => {
    if (query.category && it.category !== query.category) return false
    if (!kw) return true
    const haystack = [
      it.title,
      it.titleZh,
      it.summaryZh,
      it.aiSelectedReason,
      it.source.name,
      it.category,
      ...it.aiTags.map((t) => t.tag),
    ]
      .join("\n")
      .toLowerCase()
    return haystack.includes(kw)
  })

  const sorted = results.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  )

  if (kw) {
    const scored = sorted.map((it) => {
      let score = 0
      if (it.titleZh.toLowerCase().includes(kw)) score += 5
      if (it.title.toLowerCase().includes(kw)) score += 4
      if (it.summaryZh.toLowerCase().includes(kw)) score += 2
      if (it.aiTags.some((t) => t.tag.toLowerCase().includes(kw))) score += 3
      if (it.source.name.toLowerCase().includes(kw)) score += 1
      return { it, score }
    })
    return scored.sort((a, b) => b.score - a.score).map((s) => s.it)
  }

  return sorted
}
