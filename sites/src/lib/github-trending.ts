export interface GitHubRepo {
  id: number
  fullName: string
  name: string
  owner: string
  description: string
  url: string
  stars: number
  forks: number
  language: string
  topics: string[]
  createdAt: string
  updatedAt: string
  homepage: string
}

interface SearchResponse {
  items?: Array<{
    id: number
    full_name: string
    name: string
    description: string | null
    html_url: string
    stargazers_count: number
    forks_count: number
    language: string | null
    topics?: string[]
    created_at: string
    updated_at: string
    homepage: string | null
  }>
}

const AI_TOPICS = [
  "ai", "llm", "agent", "mcp", "machine-learning", "deepseek",
]

export async function fetchGitHubTrending(
  days = 7,
  minStars = 5,
  perTopic = 20
): Promise<GitHubRepo[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const results = new Map<string, GitHubRepo>()

  for (const topic of AI_TOPICS) {
    const q = `topic:${topic} created:>${since} stars:>${minStars}`
    try {
      const repos = await searchRepos(q, perTopic)
      for (const r of repos) {
        if (!results.has(r.fullName)) results.set(r.fullName, r)
      }
    } catch (err) {
      console.warn(`[github] topic:${topic} 抓取失败:`, err instanceof Error ? err.message : err)
    }
    await sleep(1500)
  }

  const filtered = [...results.values()].filter(isAiRelevant)
  return filtered.sort((a, b) => b.stars - a.stars)
}

const AI_KEYWORDS = [
  "ai", "llm", "agent", "model", "gpt", "claude", "deepseek", "llama",
  "chatbot", "rag", "multimodal", "machine learning", "neural",
  "language model", "inference", "prompt", "mcp", "embedding",
  "大模型", "智能体", "人工智能", "机器学习", "ai 助手",
]

function isAiRelevant(repo: GitHubRepo): boolean {
  const text = `${repo.fullName} ${repo.description ?? ""} ${repo.topics.join(" ")}`.toLowerCase()
  // 强相关：标题或描述含 AI 关键词
  return AI_KEYWORDS.some((k) => text.includes(k))
}

async function searchRepos(q: string, perPage: number): Promise<GitHubRepo[]> {
  const token = process.env.GITHUB_TOKEN
  const headers: Record<string, string> = {
    "User-Agent": "ai4s-aggregator",
    Accept: "application/vnd.github+json",
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(
    q
  )}&sort=stars&order=desc&per_page=${perPage}`
  const res = await fetch(url, { headers, cache: "no-store" })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 150)}`)
  }
  const data = (await res.json()) as SearchResponse
  return (data.items ?? []).map((it) => ({
    id: it.id,
    fullName: it.full_name,
    name: it.name,
    owner: it.full_name.split("/")[0],
    description: it.description ?? "",
    url: it.html_url,
    stars: it.stargazers_count,
    forks: it.forks_count,
    language: it.language ?? "",
    topics: it.topics ?? [],
    createdAt: it.created_at,
    updatedAt: it.updated_at,
    homepage: it.homepage ?? "",
  }))
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
