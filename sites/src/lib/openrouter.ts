export interface OpenRouterModelRank {
  date: string
  slug: string
  displayName: string
  provider: string
  variant: string
  totalTokens: number
  promptTokens: number
  completionTokens: number
  requests: number
  cachedTokens: number
  toolCalls: number
}

interface OpenRouterRaw {
  data?: Array<{
    date: string
    model_permaslug: string
    variant: string
    total_completion_tokens: number
    total_prompt_tokens: number
    count: number
    total_native_tokens_cached: number
    total_tool_calls: number
  }>
}

export async function fetchOpenRouterRankings(): Promise<OpenRouterModelRank[]> {
  const url = "https://openrouter.ai/api/frontend/v1/rankings/models"
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    cache: "no-store",
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`OpenRouter API ${res.status}: ${body.slice(0, 150)}`)
  }
  const data = (await res.json()) as OpenRouterRaw
  const raw = data.data ?? []

  // 按 provider+model 聚合（同模型不同日期/变体合并，token 累加）
  const byKey = new Map<string, OpenRouterModelRank>()
  for (const it of raw) {
    const { provider, model } = splitSlug(it.model_permaslug)
    const key = `${provider}/${model}`
    const existing = byKey.get(key)
    const tokens = (it.total_prompt_tokens ?? 0) + (it.total_completion_tokens ?? 0)
    if (!existing) {
      byKey.set(key, {
        date: it.date,
        slug: it.model_permaslug,
        displayName: model,
        provider,
        variant: it.variant ?? "",
        totalTokens: tokens,
        promptTokens: it.total_prompt_tokens ?? 0,
        completionTokens: it.total_completion_tokens ?? 0,
        requests: it.count ?? 0,
        cachedTokens: it.total_native_tokens_cached ?? 0,
        toolCalls: it.total_tool_calls ?? 0,
      })
    } else {
      existing.totalTokens += tokens
      existing.promptTokens += it.total_prompt_tokens ?? 0
      existing.completionTokens += it.total_completion_tokens ?? 0
      existing.requests += it.count ?? 0
      existing.cachedTokens += it.total_native_tokens_cached ?? 0
      existing.toolCalls += it.total_tool_calls ?? 0
      if (it.date > existing.date) {
        existing.date = it.date
        existing.slug = it.model_permaslug
        existing.variant = it.variant ?? ""
      }
    }
  }

  return [...byKey.values()].sort((a, b) => b.totalTokens - a.totalTokens)
}

function splitSlug(slug: string): { provider: string; model: string } {
  const [provider, ...rest] = slug.split("/")
  const full = rest.join("/") || slug
  // 去掉日期后缀：如 muse-spark-1.2-20260805 → muse-spark-1.2
  const model = full.replace(/-(20\d{6})$/i, "")
  return { provider, model }
}
