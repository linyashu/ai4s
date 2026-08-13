import { createHash } from "node:crypto"
import { FEED_SOURCES } from "./sources"
import { fetchFeed } from "./fetch-rss"
import { processWithLLM } from "./llm"
import { readItems, writeItems, writeStories } from "./store"
import { buildStories } from "./story"
import { dbStartIngestRun, dbFinishIngestRun, kvGet, kvSet } from "./db"
import { recordSourceHealth } from "./health"
import { isExcluded } from "./filter"
import { cnDateKey as cnDateKeyOf, cnDateLabel as cnDateLabelOf, cnTimeLabel as cnTimeLabelOf } from "./time"
import type { AIItem, RawItem } from "./types"

const DAY_MS = 24 * 60 * 60 * 1000

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ""
    const query = new URLSearchParams(u.search)
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"]) {
      query.delete(k)
    }
    u.search = query.toString()
    return u.toString()
  } catch {
    return url.trim()
  }
}

function titleKey(title: string): string {
  return title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 60)
}

function isDuplicate(title: string, url: string, existing: AIItem[]): boolean {
  const urlNorm = normalizeUrl(url)
  const tKey = titleKey(title)
  return existing.some((it) => {
    if (it.url && normalizeUrl(it.url) === urlNorm) return true
    if (it.title && titleKey(it.title) === tKey) return true
    return false
  })
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "item"
  )
}

function makeId(url: string, title: string): string {
  const h = createHash("sha1").update(`${url}|${title}`).digest("hex").slice(0, 16)
  return `${slugify(title)}-${h}`
}

function cnDateKey(d: Date): { dateKey: string; dateLabel: string; timeLabel: string } {
  const ms = d.getTime()
  return {
    dateKey: cnDateKeyOf(ms),
    dateLabel: cnDateLabelOf(ms),
    timeLabel: cnTimeLabelOf(ms),
  }
}

async function fetchOne(src: (typeof FEED_SOURCES)[number]): Promise<RawItem[]> {
  try {
    const items = await fetchFeed(src)
    await recordSourceHealth({
      sourceName: src.name,
      ok: true,
      itemCount: items.length,
      timestamp: new Date().toISOString(),
    })
    return items
  } catch (err) {
    console.warn(`[ingest] 源失败 ${src.name}:`, err instanceof Error ? err.message : err)
    await recordSourceHealth({
      sourceName: src.name,
      ok: false,
      itemCount: 0,
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    })
    return []
  }
}

async function collectRaw(): Promise<RawItem[]> {
  const all: RawItem[] = []
  const reddit = FEED_SOURCES.filter((s) => s.url.includes("reddit.com"))
  const others = FEED_SOURCES.filter((s) => !s.url.includes("reddit.com"))

  const results = await Promise.allSettled(others.map((s) => fetchOne(s)))
  results.forEach((r) => {
    if (r.status === "fulfilled") all.push(...r.value)
  })

  if (reddit.length > 0) {
    const last = Number((await kvGet("reddit_rotation")) ?? "-1")
    const idx = (last + 1) % reddit.length
    await kvSet("reddit_rotation", String(idx))
    const items = await fetchOne(reddit[idx])
    all.push(...items)
  }

  const { fetchXFeed } = await import("./fetch-x")
  try {
    const xItems = await fetchXFeed()
    if (xItems.length > 0) {
      all.push(...xItems)
      console.log(`[ingest] X 信源抓取 ${xItems.length} 条`)
    }
  } catch (err) {
    console.warn("[ingest] X 信源失败:", err instanceof Error ? err.message : err)
  }

  // Google News 中文搜索源
  const { fetchGoogleNews } = await import("./fetch-gnews")
  try {
    const gnews = await fetchGoogleNews()
    if (gnews.length > 0) {
      all.push(...gnews)
      console.log(`[ingest] Google News 中文源抓取 ${gnews.length} 条`)
    }
  } catch (err) {
    console.warn("[ingest] Google News 抓取失败:", err instanceof Error ? err.message : err)
  }

  // HuggingFace 热门模型
  const { fetchHuggingFace } = await import("./fetch-hf")
  try {
    const hf = await fetchHuggingFace()
    if (hf.length > 0) {
      all.push(...hf)
      console.log(`[ingest] HuggingFace 抓取 ${hf.length} 条`)
    }
  } catch (err) {
    console.warn("[ingest] HuggingFace 抓取失败:", err instanceof Error ? err.message : err)
  }
  return all
}

function dedupeRaw(items: RawItem[]): RawItem[] {
  const seen = new Set<string>()
  const out: RawItem[] = []
  for (const it of items) {
    const key = normalizeUrl(it.url) || titleKey(it.title)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(it)
  }
  return out
}

function makeEntry(
  item: RawItem,
  out: Partial<AIItem> = {}
): AIItem {
  const now = new Date(item.publishedAt ?? Date.now())
  const { dateKey, dateLabel, timeLabel } = cnDateKey(new Date(now))
  return {
    id: makeId(item.url, item.title),
    url: item.url,
    title: item.title,
    titleZh: out.titleZh ?? item.title,
    summaryZh: out.summaryZh ?? item.content?.slice(0, 200) ?? "",
    publishedAt: now.toISOString(),
    aiSelected: out.aiSelected ?? false,
    aiSelectedReason: out.aiSelectedReason ?? "",
    finalScore: out.finalScore ?? 0,
    category: out.category ?? "industry",
    aiTags: out.aiTags ?? [],
    source: { name: item.sourceName, kind: item.sourceKind },
    duplicateCount: 0,
    dateKey,
    dateLabel,
    timeLabel,
  }
}

export interface IngestResult {
  fetched: number
  processed: number
  selected: number
  failed: number
  filtered: number
  total: number
}

export async function runPipeline(): Promise<IngestResult> {
  const runId = await dbStartIngestRun()
  const existing = await readItems()
  const raw = dedupeRaw(await collectRaw())

  const candidates = raw.filter((it) => {
    if (isDuplicate(it.title, it.url, existing)) return false
    if (isExcluded(it.title, it.content ?? "")) return false
    return true
  })

  let processed = 0
  let selected = 0
  let failed = 0

  if (candidates.length > 0) {
    const useMock = process.env.LLM_MOCK === "1"
    if (useMock) {
      for (const item of candidates) {
        try {
          const res = await processWithLLM(item)
          existing.push(makeEntry(item, {
            titleZh: res.titleZh,
            summaryZh: res.summaryZh,
            aiSelected: res.aiSelected,
            aiSelectedReason: res.aiSelectedReason,
            finalScore: res.finalScore,
            category: res.category,
            aiTags: res.tags.map((tag) => ({ tag })),
          }))
          processed++
          if (res.aiSelected) selected++
        } catch (err) {
          failed++
          console.warn(`[ingest] 加工失败 "${item.title.slice(0, 40)}":`, err instanceof Error ? err.message : err)
          existing.push(makeEntry(item))
        }
      }
    } else {
      const { selectCandidates, refineWithFulltext } = await import("./llm")
      const { fetchFulltextBatch } = await import("./fetch-fulltext")
      const candidateLimit = Number(process.env.CANDIDATE_LIMIT || 10)

      try {
        const shortlist = await selectCandidates(
          candidates.map((it) => ({
            title: it.title,
            source: it.sourceName,
            url: it.url,
            published: it.publishedAt,
            summary: it.content?.slice(0, 800) ?? "",
          })),
          candidateLimit
        )
        const shortUrls = new Set(shortlist.map((s) => s.url))
        const shortItems = candidates.filter((it) => shortUrls.has(it.url))
        console.log(`[ingest] 两阶段：粗选 ${shortItems.length}/${candidates.length} 条候选`)

        const fulltexts = await fetchFulltextBatch(
          shortItems.map((it) => ({ title: it.title, url: it.url })),
          candidateLimit
        )

        const refined = await refineWithFulltext(
          shortItems.map((it) => ({
            title: it.title,
            source: it.sourceName,
            url: it.url,
            summary: it.content?.slice(0, 800) ?? "",
            fulltext: fulltexts.get(it.url),
          })),
          candidateLimit
        )
        const refinedMap = new Map(refined.map((r) => [r.url, r]))

        for (const item of shortItems) {
          const r = refinedMap.get(item.url)
          if (r) {
            existing.push(makeEntry(item, {
              titleZh: r.titleZh,
              summaryZh: r.summaryZh,
              aiSelected: r.aiSelected,
              aiSelectedReason: r.aiSelectedReason,
              finalScore: r.finalScore,
              category: r.category,
              aiTags: r.tags.map((tag) => ({ tag })),
            }))
            processed++
            if (r.aiSelected) selected++
          } else {
            const res = await processWithLLM(item)
            existing.push(makeEntry(item, {
              titleZh: res.titleZh,
              summaryZh: res.summaryZh,
              aiSelected: res.aiSelected,
              aiSelectedReason: res.aiSelectedReason,
              finalScore: res.finalScore,
              category: res.category,
              aiTags: res.tags.map((tag) => ({ tag })),
            }))
            processed++
            if (res.aiSelected) selected++
          }
        }
      } catch (err) {
        console.warn("[ingest] 两阶段管线失败，回退逐条加工:", err instanceof Error ? err.message : err)
        for (const item of candidates) {
          try {
            const res = await processWithLLM(item)
            existing.push(makeEntry(item, {
              titleZh: res.titleZh,
              summaryZh: res.summaryZh,
              aiSelected: res.aiSelected,
              aiSelectedReason: res.aiSelectedReason,
              finalScore: res.finalScore,
              category: res.category,
              aiTags: res.tags.map((tag) => ({ tag })),
            }))
            processed++
            if (res.aiSelected) selected++
          } catch (err2) {
            failed++
            console.warn(`[ingest] 加工失败 "${item.title.slice(0, 40)}":`, err2 instanceof Error ? err2.message : err2)
            existing.push(makeEntry(item))
          }
        }
      }
    }
  }

  const filteredCount = raw.filter((it) => !isDuplicate(it.title, it.url, existing) && isExcluded(it.title, it.content ?? "")).length

  const cutoff = Date.now() - 14 * DAY_MS
  const trimmed = existing.filter((it) => new Date(it.publishedAt).getTime() >= cutoff)
  trimmed.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
  await writeItems(trimmed)

  const stories = buildStories(trimmed)
  await writeStories(stories)

  const { takeHeatSnapshot } = await import("./hot")
  await takeHeatSnapshot()

  if (process.env.REFRESH_RANKINGS !== "0") {
    try {
      const { refreshRankings } = await import("./refresh-benchmarks")
      await refreshRankings()
    } catch (err) {
      console.warn("[ingest] 排行榜刷新失败（不影响主流程）:", err instanceof Error ? err.message : err)
    }
  }

  if (process.env.REFRESH_GITHUB !== "0") {
    try {
      const { refreshGitHubTrending } = await import("./github-store")
      await refreshGitHubTrending()
    } catch (err) {
      console.warn("[ingest] GitHub 热榜刷新失败（不影响主流程）:", err instanceof Error ? err.message : err)
    }
  }

  if (process.env.REFRESH_OPENROUTER !== "0") {
    try {
      const { refreshOpenRouter } = await import("./openrouter-store")
      await refreshOpenRouter(20)
    } catch (err) {
      console.warn("[ingest] OpenRouter 排行榜刷新失败（不影响主流程）:", err instanceof Error ? err.message : err)
    }
  }

  if (process.env.REFRESH_DAILY !== "0") {
    try {
      const { generateDailyDeepReport } = await import("./daily")
      await generateDailyDeepReport()
    } catch (err) {
      console.warn("[ingest] 深度日报生成失败（不影响主流程）:", err instanceof Error ? err.message : err)
    }
  }

  const result: IngestResult = {
    fetched: raw.length,
    processed,
    selected,
    failed,
    filtered: filteredCount,
    total: trimmed.length,
  }
  await dbFinishIngestRun(runId, result)
  return result
}
