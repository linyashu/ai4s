export interface RankEntry {
  rank: number
  model: string
  score: string
  org?: string
  url?: string
  votes?: string
  price?: string
  context?: string
  categoryScores?: Record<string, string>
  params?: string
  license?: string
  arch?: string
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

export async function httpGet(url: string, opts: { timeout?: number; headers?: Record<string, string> } = {}): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeout ?? 60000)
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, ...opts.headers },
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

export function cleanTd(raw?: string): string {
  if (!raw) return ""
  const txt = raw.replace(/<[^>]+>/g, "")
  return txt.replace(/&nbsp;/g, " ").trim()
}

export function stripHtml(raw: string): string {
  return raw.replace(/<[^>]+>/g, "").trim()
}

export function extractTable(markdown: string, headerKw: string): string[][] {
  const lines = markdown.split("\n")
  const rows: string[][] = []
  let found = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (!found && trimmed.includes(headerKw) && trimmed.startsWith("|")) {
      found = true
      continue
    }
    if (!found) continue
    if (!trimmed) continue
    if (!trimmed.startsWith("|")) break
    if (/^\|[\s\-|:]+\|?$/.test(trimmed)) continue
    const cells = trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim())
    if (!cells.length) continue
    if (cells[0].toLowerCase() === "rank" || cells.join("|").includes("模型")) continue
    rows.push(cells)
  }
  return rows
}

export async function jinaMarkdown(url: string, timeout = 90000, renderTimeout = 0): Promise<string> {
  const headers: Record<string, string> = { "X-Return-Format": "markdown" }
  if (renderTimeout > 0) headers["X-Timeout"] = String(renderTimeout)
  return httpGet("https://r.jina.ai/" + url, { timeout, headers })
}

export async function fetchMarkdown(url: string, timeout = 90000, renderTimeout = 0): Promise<string> {
  const fcKey = process.env.FIRECRAWL_API_KEY?.trim()
  if (fcKey) {
    try {
      const body: Record<string, unknown> = { url, formats: ["markdown"] }
      if (renderTimeout > 0) {
        body["waitFor"] = renderTimeout * 1000
        body["actions"] = [{ type: "scroll", direction: "down" }]
      }
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout)
      try {
        const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${fcKey}` },
          body: JSON.stringify(body),
          signal: controller.signal,
          cache: "no-store",
        })
        if (!res.ok) throw new Error(`Firecrawl HTTP ${res.status}`)
        const data = (await res.json()) as { success?: boolean; data?: { markdown?: string } }
        if (!data.success) throw new Error("Firecrawl 未成功")
        const md = data.data?.markdown
        if (!md) throw new Error("Firecrawl 空 markdown")
        return md
      } finally {
        clearTimeout(timer)
      }
    } catch (err) {
      console.warn("[rank] Firecrawl 失败回退 Jina:", err instanceof Error ? err.message : err)
    }
  }
  return jinaMarkdown(url, timeout, renderTimeout)
}
