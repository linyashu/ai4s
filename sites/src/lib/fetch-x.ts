import type { RawItem, SourceKind } from "./types"

interface XConfig {
  bearerToken: string
}

const ACCOUNTS = [
  { name: "@OpenAI", handle: "OpenAI" },
  { name: "@AnthropicAI", handle: "AnthropicAI" },
  { name: "@GoogleDeepMind", handle: "GoogleDeepMind" },
  { name: "@sama", handle: "sama" },
  { name: "@tobi", handle: "tobi" },
  { name: "@jeremyphoward", handle: "jeremyphoward" },
  { name: "@hwchase17", handle: "hwchase17" },
  { name: "@AndrewYNg", handle: "AndrewYNg" },
]

function getConfig(): XConfig | null {
  const bearerToken = process.env.X_BEARER_TOKEN
  if (!bearerToken) return null
  return { bearerToken }
}

async function searchRecent(
  config: XConfig,
  query: string,
  maxResults = 10
): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(
    `https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(
      query
    )}&max_results=${maxResults}&tweet.fields=created_at,text,author_id&user.fields=username`,
    {
      headers: { Authorization: `Bearer ${config.bearerToken}` },
      cache: "no-store",
    }
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`X API ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = (await res.json()) as { data?: Array<Record<string, unknown>> }
  return data.data ?? []
}

export async function fetchXFeed(): Promise<RawItem[]> {
  const config = getConfig()
  if (!config) return []

  const items: RawItem[] = []
  for (const acc of ACCOUNTS) {
    try {
      const tweets = await searchRecent(config, `from:${acc.handle} -is:retweet`, 10)
      for (const t of tweets) {
        const text = String(t.text ?? "").replace(/\s+/g, " ").trim()
        if (!text) continue
        const id = String(t.id)
        const createdAt = String(t.created_at ?? "")
        items.push({
          url: `https://x.com/${acc.handle}/status/${id}`,
          title: text.slice(0, 120),
          content: text,
          publishedAt: createdAt ? new Date(createdAt).toISOString() : undefined,
          sourceName: `X ${acc.name}`,
          sourceKind: "x_search" as SourceKind,
        })
      }
    } catch (err) {
      console.warn(`[x] ${acc.handle} 抓取失败:`, err instanceof Error ? err.message : err)
    }
  }
  return items
}
