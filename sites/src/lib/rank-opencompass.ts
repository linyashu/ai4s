import { fetchMarkdown, extractTable, type RankEntry } from "./rank-common"

export async function fetchOpenCompass(topN = 10, retries = 4): Promise<RankEntry[]> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const md = await fetchMarkdown("https://rank.opencompass.org.cn/home", 100000, 15)
      const rows = parseOpenCompass(md, topN)
      if (rows.length > 0) return rows
      console.warn(`[opencompass] 解析为空（第 ${attempt + 1}/${retries + 1} 次）`)
    } catch (err) {
      console.warn("[opencompass] 抓取失败:", err instanceof Error ? err.message : err)
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 3000 + attempt * 3000))
  }
  return []
}

function parseOpenCompass(md: string, topN: number): RankEntry[] {
  md = md.replace(/<br\s*\/?>/gi, " ")
  const rows = extractTable(md, "均分")
  const entries: RankEntry[] = []
  for (const cells of rows.slice(0, topN + 3)) {
    if (cells.length < 4) continue
    const modelCell = cells[1] ?? ""
    const model = modelCell.replace(/^new\s*/i, "").trim()
    if (!model || model.includes("模型")) continue
    const m = model.match(/^(.*?)(?:\s+(?:闭源|开源)\s*·\s*(.+))?$/)
    const modelName = m?.[1]?.trim() ?? model
    const org = m?.[2]?.trim() ?? ""
    entries.push({
      rank: entries.length + 1,
      model: modelName,
      org,
      score: cells[4] ?? "",
      params: cells[3] ?? "",
      url: "https://rank.opencompass.org.cn/home",
      categoryScores: {
        language: cells[5] ?? "",
        knowledge: cells[6] ?? "",
        reasoning: cells[7] ?? "",
        math: cells[8] ?? "",
        coding: cells[9] ?? "",
        agent: cells[10] ?? "",
      },
    })
    if (entries.length >= topN) break
  }
  return entries
}
