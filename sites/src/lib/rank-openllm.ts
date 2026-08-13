import { httpGet, type RankEntry } from "./rank-common"

export async function fetchOpenLLM(topN = 10): Promise<RankEntry[]> {
  const base =
    "https://datasets-server.huggingface.co/rows?dataset=open-llm-leaderboard%2Fcontents&config=default&split=train"
  const entries: RankEntry[] = []
  const seen = new Set<string>()
  try {
    for (let offset = 0; offset < 600; offset += 100) {
      const body = await httpGet(`${base}&offset=${offset}&length=100`, { timeout: 60000 })
      const data = JSON.parse(body) as { rows?: Array<{ row: Record<string, unknown> }> }
      const rows = data.rows ?? []
      for (const item of rows) {
        const row = item.row
        const avg = row["Average ⬆️"]
        if (avg == null) continue
        const avgF = parseFloat(String(avg))
        if (isNaN(avgF)) continue
        const model = String(row["Model"] ?? "")
        if (!model || seen.has(model)) continue
        seen.add(model)
        const modelClean = model.replace(/<[^>]+>/g, "").trim()
        entries.push({
          rank: 0,
          model: modelClean,
          score: avgF.toFixed(1),
          org: String(row["Architecture"] ?? ""),
          url: "https://huggingface.co/" + modelClean,
          params: String(row["#Params (B)"] ?? ""),
          license: String(row["Hub License"] ?? ""),
          arch: String(row["Architecture"] ?? ""),
        })
      }
      if (rows.length < 100) break
    }
  } catch (err) {
    console.warn("[open-llm] 抓取失败:", err instanceof Error ? err.message : err)
    return []
  }
  entries.sort((a, b) => parseFloat(b.score) - parseFloat(a.score))
  return entries.slice(0, topN).map((e, i) => ({ ...e, rank: i + 1 }))
}
