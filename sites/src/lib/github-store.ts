import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs"
import path from "node:path"
import type { GitHubRepo } from "./github-trending"

const FILE = path.join(process.cwd(), "data", "github-trending.json")

export interface GitHubTrendingSnapshot {
  updatedAt: string
  days: number
  repos: GitHubRepo[]
  summaryZh: string
}

export function readGitHubTrending(): GitHubTrendingSnapshot | null {
  try {
    if (!existsSync(FILE)) return null
    return JSON.parse(readFileSync(FILE, "utf-8")) as GitHubTrendingSnapshot
  } catch {
    return null
  }
}

export async function refreshGitHubTrending(days = 7, topN = 10): Promise<GitHubTrendingSnapshot> {
  const { fetchGitHubTrending } = await import("./github-trending")
  const all = await fetchGitHubTrending(days)
  const repos = all.slice(0, topN)

  let summaryZh = ""
  if (repos.length > 0) {
    try {
      const { summarizeGitHub } = await import("./github-summary")
      summaryZh = await summarizeGitHub(repos)
    } catch (err) {
      console.warn("[github] 中文简介生成失败:", err instanceof Error ? err.message : err)
    }
  }

  const snapshot: GitHubTrendingSnapshot = {
    updatedAt: new Date().toISOString(),
    days,
    repos,
    summaryZh,
  }
  mkdirSync(path.dirname(FILE), { recursive: true })
  writeFileSync(FILE, JSON.stringify(snapshot, null, 2), "utf-8")
  console.log(`[github] 刷新完成：${repos.length} 个仓库（近 ${days} 天创建）`)
  return snapshot
}
