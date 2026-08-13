import type { GitHubRepo } from "./github-trending"

export interface GitHubSummaryItem {
  fullName: string
  introZh: string
}

export interface GitHubSummary {
  overview: string
  items: GitHubSummaryItem[]
}

export async function summarizeGitHub(repos: GitHubRepo[]): Promise<string> {
  if (process.env.LLM_MOCK === "1") {
    return mockSummary(repos)
  }
  const { chatJson } = await import("./llm")

  const payload = repos.map((r) => ({
    name: r.fullName,
    desc: r.description,
    stars: r.stars,
    language: r.language,
    topics: r.topics,
  }))

  const prompt = `你是 AI 开源社区观察员。以下是本周 GitHub 上最热门的 ${repos.length} 个 AI 相关新仓库（按 stars 排序）。
请为每个仓库写一句 40-80 字的中文简介，并写一段 80-150 字的榜单总览。

要求：
1. introZh 概括仓库用途/解决的问题，面向中文读者，保留关键英文术语
2. overview 总结本周 AI 开源趋势（出现哪些方向、整体格局）
3. 严格输出 JSON

JSON 结构：
{"overview":"榜单总览","items":[{"fullName":"仓库全名","introZh":"中文简介"}]}

仓库列表（JSON）：
${JSON.stringify(payload, null, 2)}`

  try {
    const content = await chatJson("你是严谨的开源社区分析师，输出简体中文，只输出 JSON。", prompt, 4000)
    const parsed = JSON.parse(extractJson(content) ?? "{}") as {
      overview?: string
      items?: Array<{ fullName?: string; introZh?: string }>
    }
    if (!parsed.overview && !parsed.items?.length) {
      console.warn("[github-summary] LLM 返回为空，用 mock")
      return mockSummary(repos)
    }

    const byName = new Map(repos.map((r) => [r.fullName, r]))
    const items = (parsed.items ?? [])
      .filter((it) => it.fullName && it.introZh && byName.has(it.fullName))
      .map((it) => ({ fullName: it.fullName!, introZh: it.introZh!.trim() }))

    return JSON.stringify({
      overview: parsed.overview?.trim() ?? "",
      items,
    })
  } catch (err) {
    console.warn("[github] LLM 简介失败，用 mock:", err instanceof Error ? err.message : err)
    return mockSummary(repos)
  }
}

function extractJson(text: string): string | null {
  if (!text) return null
  text = text.replace(/```(?:json)?\s*/g, "").trim()
  try {
    JSON.parse(text)
    return text
  } catch {
    const s = text.indexOf("{")
    const e = text.lastIndexOf("}")
    if (s !== -1 && e > s) {
      const candidate = text.slice(s, e + 1)
      try {
        JSON.parse(candidate)
        return candidate
      } catch {
        return null
      }
    }
    return null
  }
}

function mockSummary(repos: GitHubRepo[]): string {
  const items = repos.map((r) => ({
    fullName: r.fullName,
    introZh: `${r.description?.slice(0, 60) || "AI 开源项目"}（⭐ ${r.stars}，${r.language || "多语言"}）`,
  }))
  return JSON.stringify({
    overview: `本周 GitHub 涌现 ${repos.length} 个高热度 AI 项目，聚焦 Agent、MCP 与端侧模型等方向，社区创作热情高涨。`,
    items,
  })
}
