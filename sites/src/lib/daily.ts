import { createHash } from "node:crypto"
import { readItems } from "./store"
import { cnDateKey, isCnToday } from "./time"
import { dbReadDailyReport, dbWriteDailyReport } from "./db"
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

export interface DailyDeepReport {
  headline: string
  analysis: string
  points: string[]
}

/**
 * 用 LLM 生成当日深度解读（头条 + 300 字分析 + 要点），
 * 生成后缓存到 daily_reports 表（按 dateKey），页面读缓存。
 */
export async function generateDailyDeepReport(dateKey?: string): Promise<DailyDeepReport | null> {
  if (process.env.LLM_MOCK === "1") return null
  const key = dateKey ?? currentDateKey()
  const items = await buildTodayItems()

  const candidates = [...items]
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, 15)
  if (candidates.length === 0) return null

  const { chatJson } = await import("./llm")
  const payload = candidates.map((it) => ({
    title: it.titleZh,
    source: it.source.name,
    score: it.finalScore,
    category: it.category,
    summary: it.summaryZh.slice(0, 120),
  }))

  const prompt = `你是 AI 行业首席分析师。以下是今天（${key}）的 AI 精选动态（按重要性排序）。
请生成今日深度日报，JSON 结构：
{"headline":"今日头条标题（一句话，20-40字）","analysis":"深度解读（250-350字）：今天最值得关注的 1-2 件事，提炼事件核心、行业影响与趋势判断","points":["要点1（15-30字）","要点2","要点3"]}

动态列表（JSON）：
${JSON.stringify(payload, null, 2)}`

  try {
    const content = await chatJson(
      "你是严谨的 AI 行业分析师，输出简体中文，只输出 JSON。",
      prompt,
      2000
    )
    const parsed = JSON.parse(extractDailyJson(content) ?? "{}") as {
      headline?: string
      analysis?: string
      points?: string[]
    }
    if (!parsed.headline || !parsed.analysis) {
      console.warn("[daily] LLM 深度日报字段缺失，跳过缓存")
      return null
    }
    const report: DailyDeepReport = {
      headline: parsed.headline.trim(),
      analysis: parsed.analysis.trim(),
      points: (parsed.points ?? []).filter((p) => typeof p === "string").slice(0, 5),
    }
    await dbWriteDailyReport(key, JSON.stringify(report))
    console.log(`[daily] 深度日报已生成（${key}，${report.points.length} 个要点）`)
    return report
  } catch (err) {
    console.warn("[daily] 深度日报生成失败:", err instanceof Error ? err.message : err)
    return null
  }
}

export async function readDailyDeepReport(dateKey?: string): Promise<DailyDeepReport | null> {
  const key = dateKey ?? currentDateKey()
  const raw = await dbReadDailyReport(key)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as DailyDeepReport
    if (parsed.headline && parsed.analysis) return parsed
    return null
  } catch {
    return null
  }
}

function extractDailyJson(text: string): string | null {
  if (!text) return null
  text = text.replace(/```(?:json)?\s*/g, "").trim()
  try {
    JSON.parse(text)
    return text
  } catch {
    const start = text.indexOf("{")
    const end = text.lastIndexOf("}")
    if (start !== -1 && end > start) {
      const candidate = text.slice(start, end + 1)
      try {
        JSON.parse(candidate)
        return candidate
      } catch {
        return null
      }
    }
    return null
  }
}
