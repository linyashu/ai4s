import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs"
import path from "node:path"
import type { OpenRouterModelRank } from "./openrouter"

const FILE = path.join(process.cwd(), "data", "openrouter-rankings.json")

export interface OpenRouterSnapshot {
  updatedAt: string
  capturedAt: string
  source: string
  sourceUrl: string
  top: OpenRouterModelRank[]
}

export function readOpenRouter(): OpenRouterSnapshot | null {
  try {
    if (!existsSync(FILE)) return null
    return JSON.parse(readFileSync(FILE, "utf-8")) as OpenRouterSnapshot
  } catch {
    return null
  }
}

export async function refreshOpenRouter(topN = 20): Promise<OpenRouterSnapshot> {
  const { fetchOpenRouterRankings } = await import("./openrouter")
  const all = await fetchOpenRouterRankings()
  const snapshot: OpenRouterSnapshot = {
    updatedAt: new Date().toISOString(),
    capturedAt: new Date().toISOString().slice(0, 10),
    source: "OpenRouter",
    sourceUrl: "https://openrouter.ai/rankings",
    top: all.slice(0, topN),
  }
  mkdirSync(path.dirname(FILE), { recursive: true })
  writeFileSync(FILE, JSON.stringify(snapshot, null, 2), "utf-8")
  console.log(`[openrouter] 刷新完成：Top ${snapshot.top.length} 模型（共 ${all.length} 个）`)
  return snapshot
}
