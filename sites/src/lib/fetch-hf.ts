import type { RawItem } from "./types"

interface HFModel {
  id: string
  downloads?: number
  likes?: number
  pipeline_tag?: string
  lastModified?: string
}

export async function fetchHuggingFace(
  limit = 12,
  minDownloads = 500
): Promise<RawItem[]> {
  const results: RawItem[] = []
  try {
    const res = await fetch(
      "https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=30",
      {
        headers: { "User-Agent": "ai4s-aggregator/1.0" },
        cache: "no-store",
      }
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const models = (await res.json()) as HFModel[]
    let n = 0
    for (const m of models) {
      if (n >= limit) break
      const id = m.id ?? ""
      if (!id) continue
      const isOfficial =
        /^(openai|anthropic|meta-models|deepseek-ai|qwen|mistralai|google|microsoft|nvidia|cohere|ai21|baichuan-inc|zai-org|moonshotai|minimax|alibaba)/i.test(
          id
        )
      const downloads = m.downloads ?? 0
      if (!isOfficial && downloads < minDownloads) continue
      if (downloads < 100) continue
      const tag = m.pipeline_tag ?? ""
      results.push({
        url: `https://huggingface.co/${id}`,
        title: `${id}`,
        content: tag ? `模型类型：${tag} · 下载量：${downloads.toLocaleString()} · 喜欢：${(m.likes ?? 0).toLocaleString()}` : "",
        publishedAt: m.lastModified ? new Date(m.lastModified).toISOString() : undefined,
        sourceName: "HuggingFace 热门模型",
        sourceKind: "json_list",
      })
      n++
    }
  } catch (err) {
    console.warn("[huggingface] 抓取失败:", err instanceof Error ? err.message : err)
  }
  return results
}
