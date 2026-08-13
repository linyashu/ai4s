import { httpGet, cleanTd, type RankEntry } from "./rank-common"

export async function fetchLmArena(topN = 10): Promise<RankEntry[]> {
  try {
    const html = await httpGet("https://lmarena.ai/leaderboard/text", { timeout: 90000 })
    const trs = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/g) ?? []
    const rows: RankEntry[] = []
    for (const tr of trs) {
      const tds = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/g) ?? []
      if (tds.length < 5) continue
      const rank = parseInt(cleanTd(tds[0]), 10)
      if (isNaN(rank)) continue
      if (rank > topN) break
      const col3 = tds[2]
      const a = col3.match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
      const modelName = a ? stripTags(a[2]) : cleanTd(col3)
      const modelUrl = a?.[1] ?? ""
      const title = col3.match(/<title>([^<]+)<\/title>/)
      rows.push({
        rank,
        model: modelName,
        score: cleanTd(tds[3]),
        votes: cleanTd(tds[4]),
        price: cleanTd(tds[5] ?? ""),
        context: cleanTd(tds[6] ?? ""),
        org: title?.[1]?.trim() ?? "",
        url: modelUrl,
      })
    }
    if (rows.length > 0) return rows
  } catch (err) {
    console.warn("[lmarena] HTML 抓取失败，尝试 Jina:", err instanceof Error ? err.message : err)
  }
  return fetchLmArenaViaJina(topN)
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim()
}

async function fetchLmArenaViaJina(topN: number): Promise<RankEntry[]> {
  try {
    const { fetchMarkdown } = await import("./rank-common")
    const md = await fetchMarkdown("https://lmarena.ai/leaderboard/text")
    const { extractTable } = await import("./rank-common")
    const table = extractTable(md, "Rank")
    const rows: RankEntry[] = []
    for (const cells of table.slice(0, topN + 3)) {
      const rank = parseInt(cells[0], 10)
      if (isNaN(rank) || rank > topN) continue
      if (cells.length < 5) continue
      const modelCell = cells[2]
      const m = modelCell.match(/\[([^\]]+)\]\(([^)]+)\)/)
      rows.push({
        rank,
        model: m?.[1] ?? modelCell,
        url: m?.[2] ?? "",
        score: cells[3],
        votes: cells[4],
        price: cells[5] ?? "",
        context: cells[6] ?? "",
        org: modelCell.includes("Proprietary") ? "Proprietary" : modelCell.includes("Open") ? "Open" : "",
      })
    }
    return rows
  } catch (err) {
    console.warn("[lmarena] Jina 抓取失败:", err instanceof Error ? err.message : err)
    return []
  }
}
