import { createHash } from "node:crypto"
import type { AIItem, Story } from "./types"

const STOPWORDS = new Set([
  "发布", "宣布", "推出", "上线", "了", "的", "在", "与", "和", "及",
  "this", "that", "with", "for", "the", "and", "new", "how", "why",
])

function cjkBigrams(text: string): Set<string> {
  const out = new Set<string>()
  const runs = text.match(/[\u4e00-\u9fff]+/g) ?? []
  for (const run of runs) {
    for (let i = 0; i < run.length - 1; i++) {
      const gram = run.slice(i, i + 2)
      if (!STOPWORDS.has(gram)) out.add(gram)
    }
  }
  return out
}

export function tokenize(text: string): Set<string> {
  const tokens = new Set<string>()
  const lower = text.toLowerCase()
  const words = lower.match(/[a-z0-9][a-z0-9+-.]*/g) ?? []
  for (const w of words) if (!STOPWORDS.has(w)) tokens.add(w)
  for (const g of cjkBigrams(text)) tokens.add(`#${g}`)
  return tokens
}

function properNouns(text: string): Set<string> {
  const out = new Set<string>()
  const matches =
    text.match(/[A-Z][A-Za-z0-9]*(?:[-.][A-Za-z0-9]+)*/g) ?? []
  for (const m of matches) {
    if (m.length >= 3 && !/^(The|And|For|With|How|Why|New|Show|HN)$/.test(m)) {
      out.add(m.toLowerCase())
    }
  }
  return out
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  const union = a.size + b.size - inter
  return inter / union
}

export function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return (2 * inter) / (a.size + b.size)
}

const CORE_ENTITIES = [
  "gpt", "claude", "gemini", "deepseek", "qwen", "通义", "kimi", "moonshot",
  "llama", "mistral", "muse", "glimmer", "openai", "anthropic", "google",
  "deepmind", "meta", "微软", "阿里", "字节", "百度", "腾讯", "豆包", "智谱",
  "glm", "claude code", "智能体", "机器人", "hugging face", "开源", "发布",
  "榜单", "排行榜", "融资", "上市", "收购", "禁用", "封锁", "安全", "漏洞",
  "里程碑", "agent", "评测", "基准", "grok", "gemma", "mistral", "luna",
  "terra", "sol", "nova", "seed", "doubao", "inception", "moonshot",
]

function entities(title: string): Set<string> {
  const t = title.toLowerCase()
  const out = new Set<string>()
  for (const e of CORE_ENTITIES) {
    if (t.includes(e)) out.add(e)
  }
  return out
}

function titleSimilarity(a: string, b: string): number {
  return dice(tokenize(a), tokenize(b))
}

function eventMatch(a: string, b: string): boolean {
  const ea = entities(a)
  const eb = entities(b)
  let inter = 0
  for (const e of ea) if (eb.has(e)) inter++
  if (inter >= 2) return true
  if (inter === 1 && titleSimilarity(a, b) > 0.3) return true
  return false
}

export function itemsSimilar(a: AIItem, b: AIItem): boolean {
  const pn = properNouns(a.titleZh)
  const pnB = properNouns(b.titleZh)
  let sharedProper = 0
  for (const p of pn) if (pnB.has(p)) sharedProper++
  if (sharedProper >= 1) return true

  const d = dice(tokenize(a.titleZh), tokenize(b.titleZh))
  if (d >= 0.4) return true

  return eventMatch(a.titleZh, b.titleZh)
}

function makeStoryId(titles: string[]): string {
  const h = createHash("sha1")
    .update(titles.sort().join("|"))
    .digest("hex")
    .slice(0, 14)
  return `story-${h}`
}

function pickBestTitle(items: AIItem[]): string {
  return [...items].sort((a, b) => b.finalScore - a.finalScore)[0]?.titleZh ?? ""
}

function mergeSummary(items: AIItem[]): string {
  const primary = [...items].sort((a, b) => b.finalScore - a.finalScore)[0]
  if (!primary) return ""
  const extras = items
    .filter((it) => it.id !== primary.id)
    .slice(0, 2)
    .map((it) => it.titleZh)
  const base = primary.summaryZh
  if (extras.length === 0) return base
  return `${base} 另有 ${extras.join("、")} 等信源亦报道此事。`
}

export function buildStories(items: AIItem[]): Story[] {
  const selected = items.filter((it) => it.aiSelected)
  const used = new Set<string>()
  const stories: Story[] = []

  for (const item of selected) {
    if (used.has(item.id)) continue
    const group = selected.filter(
      (cand) =>
        cand.id !== item.id &&
        !used.has(cand.id) &&
        itemsSimilar(item, cand)
    )
    const cluster = [item, ...group]
    group.forEach((g) => used.add(g.id))
    used.add(item.id)

    const earliest = cluster.reduce((min, it) =>
      new Date(it.publishedAt) < new Date(min.publishedAt) ? it : min
    )
    stories.push({
      id: makeStoryId(cluster.map((it) => it.titleZh)),
      titleZh: pickBestTitle(cluster),
      summaryZh: mergeSummary(cluster),
      itemIds: cluster.map((it) => it.id),
      category: item.category,
      publishedAt: earliest.publishedAt,
      sources: cluster.map((it) => it.source.name),
      finalScore: Math.max(...cluster.map((it) => it.finalScore)),
    })
  }

  return stories
}
