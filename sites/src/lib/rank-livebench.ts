import { fetchMarkdown, extractTable, type RankEntry } from "./rank-common"

export async function fetchLiveBench(topN = 10): Promise<RankEntry[]> {
  try {
    const md = await fetchMarkdown("https://livebench.ai/", 90000, 8)
    const rows = extractTable(md, "Model")
    const entries: RankEntry[] = []
    for (const cells of rows.slice(0, topN + 3)) {
      if (cells.length < 3) continue
      const model = cells[1] ?? ""
      const overall = cells[2] ?? ""
      if (!model || !overall) continue
      entries.push({
        rank: entries.length + 1,
        model,
        score: overall,
        price: cells[10] ?? "",
        categoryScores: {
          reasoning: cells[3] ?? "",
          coding: cells[4] ?? "",
          agentic: cells[5] ?? "",
          math: cells[6] ?? "",
          data: cells[7] ?? "",
          language: cells[8] ?? "",
          instruct: cells[9] ?? "",
        },
      })
      if (entries.length >= topN) break
    }
    return entries
  } catch (err) {
    console.warn("[livebench] 抓取失败:", err instanceof Error ? err.message : err)
    return []
  }
}
