const JINA_READER = "https://r.jina.ai/"
const FIRECRAWL_API = "https://api.firecrawl.dev/v1/scrape"

function firecrawlHeaders(): Record<string, string> | null {
  const key = process.env.FIRECRAWL_API_KEY?.trim()
  return key ? { Authorization: `Bearer ${key}` } : null
}

export async function fetchFulltext(url: string, timeoutMs = 90000): Promise<string> {
  if (!url) return ""
  const fc = firecrawlHeaders()
  if (fc) {
    try {
      const text = await firecrawl(url, fc, timeoutMs)
      if (text) return text
    } catch (err) {
      console.warn(`[fulltext] Firecrawl 失败回退 Jina [${url.slice(0, 60)}]:`, err instanceof Error ? err.message : err)
    }
  }
  return jina(url, timeoutMs)
}

async function firecrawl(url: string, headers: Record<string, string>, timeoutMs: number): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(FIRECRAWL_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ url, formats: ["markdown"] }),
      signal: controller.signal,
      cache: "no-store",
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { success?: boolean; data?: { markdown?: string } }
    if (!data.success) throw new Error("Firecrawl 未成功")
    return cleanFulltext(data.data?.markdown ?? "")
  } finally {
    clearTimeout(timer)
  }
}

async function jina(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(JINA_READER + url, {
      headers: {
        "X-Return-Format": "markdown",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    let text = await res.text()
    const idx = text.indexOf("Markdown Content")
    if (idx >= 0) text = text.slice(idx + "Markdown Content".length)
    return cleanFulltext(text)
  } catch (err) {
    console.warn(`[fulltext] Jina 抓取失败 ${url.slice(0, 60)}:`, err instanceof Error ? err.message : err)
    return ""
  } finally {
    clearTimeout(timer)
  }
}

function cleanFulltext(md: string): string {
  if (!md) return ""
  md = md.replace(/\n{3,}/g, "\n\n")
  md = md.replace(/^\s*\[(Image|Video|Audio)\d*\]/gm, "")
  return md.trim()
}

export async function fetchFulltextBatch(
  items: Array<{ title: string; url: string }>,
  maxItems = 8,
  concurrency = 3,
  timeoutMs = 45000
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const seen = new Set<string>()
  const queue = items.filter((it) => {
    if (!it.url || seen.has(it.url)) return false
    seen.add(it.url)
    return true
  }).slice(0, maxItems)

  let cursor = 0
  async function worker() {
    while (cursor < queue.length) {
      const it = queue[cursor++]
      const text = await fetchFulltext(it.url, timeoutMs)
      if (text) result.set(it.url, text.slice(0, 8000))
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, () => worker())
  )
  return result
}
