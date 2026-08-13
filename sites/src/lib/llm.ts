import type { Category, LLMOutput, RawItem } from "./types"
import { CATEGORY_PROMPTS } from "./sources"

const MODEL = process.env.LLM_MODEL || "deepseek-chat"
const API_URL = "https://api.deepseek.com/chat/completions"

const CATEGORY_KEYS = Object.keys(CATEGORY_PROMPTS).join("|")

function buildPrompt(item: RawItem): string {
  const published = item.publishedAt ? `- 发布时间：${item.publishedAt}` : ""
  const excerpt = item.content ? `- 正文摘录：${item.content.slice(0, 1500)}` : ""
  return `你是 AI 行业情报编辑，负责把一条原始资讯加工成中文精选条目。

【原始资讯】
- 标题：${item.title}
- 来源：${item.sourceName}
${published}
${excerpt}

【任务】
1. titleZh：给出简洁准确的中文标题（保留关键英文专有名词，如模型名/公司名）
2. summaryZh：120-200 字中文摘要，提炼事件核心、影响与背景
3. category：从 ${CATEGORY_KEYS} 中选择最合适的一个。分类说明：${JSON.stringify(CATEGORY_PROMPTS)}
4. tags：2-4 个中文/英文标签，如 Agent、模型发布、开源、多模态、融资、端侧、安全/对齐、评测/基准
5. aiSelected：该资讯对 AI 从业者是否有较高价值（重要模型发布、重大产品/行业事件选 true；琐碎水稿选 false）
6. aiSelectedReason：若精选，用 1 句话说明为什么值得关注（40-90 字）
7. finalScore：0-100 的重要性评分，普通资讯 55-70，重要事件 75-90

只返回 JSON，不要输出任何其他文字：
{"titleZh":"","summaryZh":"","category":"","tags":[],"aiSelected":true,"aiSelectedReason":"","finalScore":0}`
}

export async function processWithLLM(item: RawItem): Promise<LLMOutput> {
  if (process.env.LLM_MOCK === "1") {
    return mockProcess(item)
  }

  // 解析失败时重试一次（LLM 偶发截断 JSON）
  for (let attempt = 0; attempt < 2; attempt++) {
    const { content, usage } = await fetchWithRetry(
      {
        messages: [
          { role: "system", content: "你只输出合法 JSON。" },
          { role: "user", content: buildPrompt(item) },
        ],
      },
      1200
    )
    if (usage) {
      const { recordLLMUsage } = await import("./usage")
      recordLLMUsage({
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
      })
    }

    const json = extractJson(content)
    if (!json) {
      console.warn(`[llm] JSON 解析失败（第 ${attempt + 1} 次），标题 "${item.title.slice(0, 30)}"`)
      continue
    }
    const parsed = JSON.parse(json) as Partial<LLMOutput>

    const category = (CATEGORY_PROMPTS as Record<string, string>)[
      parsed.category ?? ""
    ]
      ? (parsed.category as Category)
      : "industry"

    return {
      titleZh: parsed.titleZh || item.title,
      summaryZh: parsed.summaryZh || "",
      category,
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 4) : [],
      aiSelected: Boolean(parsed.aiSelected),
      aiSelectedReason: parsed.aiSelectedReason || "",
      finalScore: Math.max(0, Math.min(100, Number(parsed.finalScore) || 0)),
    }
  }

  throw new Error(`LLM 输出两次均无法解析: ${item.title.slice(0, 40)}`)
}

function mockProcess(item: RawItem): LLMOutput {
  const t = item.title
  const s = t.toLowerCase()
  const isPaper = /arxiv|paper|towards|survey|foundation model/i.test(t)
  const isTutorial = /tutorial|how to|guide|implementing|build /i.test(t)
  const isOpinion = /letter|statement|announces|we are|i believe/i.test(t)
  const category: Category = isPaper
    ? "paper"
    : isTutorial
      ? "tip"
      : isOpinion
        ? "opinion"
        : s.includes("model") || /gpt|claude|llama|deepseek|gemini|qwen/i.test(t)
          ? "ai-models"
          : /funding|raises|acqui|ipo|invest|factory|infrastructure/i.test(t)
            ? "industry"
            : "ai-products"
  const tags: string[] = []
  if (isPaper) tags.push("论文/研究")
  if (isTutorial) tags.push("教程/实践")
  if (/agent|mcp/i.test(t)) tags.push("Agent")
  if (/open.?source|open.?weight/i.test(t)) tags.push("开源生态")
  if (/multimodal|video|image|audio/i.test(t)) tags.push("多模态")
  if (tags.length < 2) tags.push("行业动态")
  return {
    titleZh: t,
    summaryZh: item.content?.slice(0, 150) || "来自 " + item.sourceName + " 的 AI 行业动态。",
    category,
    tags: tags.slice(0, 4),
    aiSelected: true,
    aiSelectedReason: "该资讯涉及 AI 行业核心动态，对从业者有较高关注价值。",
    finalScore: 65,
  }
}

export interface CandidatePayload {
  title: string
  source: string
  url: string
  published?: string
  summary?: string
}

export interface CandidateResult {
  url: string
  relevance?: string
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const RETRY_DELAYS_MS = [1500, 5000]

async function fetchWithRetry(
  body: Record<string, unknown>,
  maxTokens: number
): Promise<{ content: string; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error("缺少 DEEPSEEK_API_KEY 环境变量")

  let lastErr: unknown
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS_MS[attempt - 1]
      console.warn(`[llm] 第 ${attempt} 次重试（${delay}ms 后）`)
      await new Promise((r) => setTimeout(r, delay))
    }
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.3,
          max_tokens: maxTokens,
          response_format: { type: "json_object" },
          ...body,
        }),
        cache: "no-store",
      })
      if (!res.ok) {
        const bodyText = await res.text()
        const err = new Error(`LLM API ${res.status}: ${bodyText.slice(0, 200)}`)
        if (RETRYABLE_STATUS.has(res.status)) {
          lastErr = err
          continue
        }
        throw err
      }
      const data = (await res.json()) as {
        choices: Array<{ message: { content: string } }>
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
      }
      return {
        content: data.choices?.[0]?.message?.content ?? "",
        usage: data.usage,
      }
    } catch (err) {
      // 网络错误也重试；不可重试错误（如 400）会在此判断
      if (!(err instanceof Error) || !err.message.startsWith("LLM API")) {
        lastErr = err
        continue
      }
      throw err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

export async function chatJson(system: string, user: string, maxTokens = 2000): Promise<string> {
  const { content, usage } = await fetchWithRetry(
    {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    },
    maxTokens
  )
  if (usage) {
    const { recordLLMUsage } = await import("./usage")
    recordLLMUsage({
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
    })
  }
  return content
}

export async function selectCandidates(
  items: CandidatePayload[],
  limit = 10
): Promise<CandidateResult[]> {
  // 候选过多时仅传标题+来源，避免 prompt 过大浪费 token
  const slim = items.length > 30
  const payload = slim
    ? items.map((it) => ({ url: it.url, title: it.title, source: it.source }))
    : items

  const prompt = `你是 AI 行业情报编辑。以下是今日从多源聚合的 AI 动态条目（标题${slim ? "" : "+摘要"}）。
请挑选最有价值、最能反映 AI 行业重要变化的候选条目，输出 JSON。

要求：
1. 挑出最多 ${limit} 条，按重要性从高到低排列
2. 优先选：重要模型发布、重大产品/行业事件、权威论文、高价值观点
3. 排除：琐碎水稿、广告、无关内容
4. url 必须一字不改取自上方条目
5. 每条附 relevance 字段（一句话说明为何值得关注）

JSON 结构：
{"items":[{"url":"原始链接","relevance":"一句话说明"}]}

条目列表（JSON）：
${JSON.stringify(payload, null, 2)}`

  try {
    const content = await chatJson("你是严谨的 AI 情报分析师，输出简体中文，只输出 JSON。", prompt, 8000)
    const parsed = JSON.parse(extractJson(content) ?? "{}") as { items?: Array<{ url: string; relevance?: string }> }
    const byUrl = new Map(items.map((it) => [it.url, it]))
    const matched = (parsed.items ?? [])
      .filter((it) => byUrl.has(it.url))
      .slice(0, limit)
      .map((it) => ({ url: it.url, relevance: it.relevance }))
    if (matched.length === 0) {
      console.warn("[llm] 粗选解析为空，回退取前几条")
      return items.slice(0, limit).map((it) => ({ url: it.url }))
    }
    return matched
  } catch (err) {
    console.warn("[llm] 粗选失败，回退取前几条:", err instanceof Error ? err.message : err)
    return items.slice(0, limit).map((it) => ({ url: it.url }))
  }
}

export interface RefineInput {
  title: string
  source: string
  url: string
  summary: string
  fulltext?: string
}

export interface RefineResult {
  url: string
  titleZh: string
  summaryZh: string
  category: Category
  tags: string[]
  aiSelected: boolean
  aiSelectedReason: string
  finalScore: number
}

export async function refineWithFulltext(
  candidates: RefineInput[],
  maxItems = 8
): Promise<RefineResult[]> {
  const prompt = `你是 AI 行业情报编辑。以下候选条目含摘要（部分含全文）。
请基于内容做深度分析，为每条输出中文标题、中文摘要、分类、标签、精选理由与评分。

分类从：${CATEGORY_KEYS} 中选择。分类说明：${JSON.stringify(CATEGORY_PROMPTS)}

JSON 结构：
{"items":[{"url":"原始链接","titleZh":"中文标题","summaryZh":"120-200字中文摘要","category":"分类","tags":["标签1","标签2"],"aiSelected":true,"aiSelectedReason":"一句话精选理由","finalScore":70}]}

要求：
1. 按重要性从高到低排列，最多 ${maxItems} 条
2. titleZh 保留关键英文专有名词；summaryZh 提炼事件核心、影响与背景
3. aiSelectedReason 必须引用全文中的具体数据/细节（如模型参数量、基准分数、排名变化、融资金额、性能数字），用 40-90 字说明为何值得关注，禁止泛泛而谈（如"值得关注""重要进展"这类空话）
4. 无 fulltext 则基于 summary 判断，优先摘取其中数字信息
5. 严格输出合法 JSON

候选条目（JSON）：
${JSON.stringify(candidates, null, 2)}`

  try {
    const content = await chatJson("你是严谨的 AI 情报分析师，输出简体中文，只输出 JSON。", prompt, 8000)
    const parsed = JSON.parse(extractJson(content) ?? "{}") as {
      items?: Array<{
        url: string
        titleZh?: string
        summaryZh?: string
        category?: string
        tags?: string[]
        aiSelected?: boolean
        aiSelectedReason?: string
        finalScore?: number
      }>
    }
    const byUrl = new Map(candidates.map((it) => [it.url, it]))
    const out: RefineResult[] = []
    for (const it of parsed.items ?? []) {
      const src = byUrl.get(it.url)
      if (!src) continue
      const category = (CATEGORY_PROMPTS as Record<string, string>)[it.category ?? ""]
        ? (it.category as Category)
        : "industry"
      out.push({
        url: it.url,
        titleZh: it.titleZh || src.title,
        summaryZh: it.summaryZh || src.summary.slice(0, 150),
        category,
        tags: Array.isArray(it.tags) ? it.tags.slice(0, 4) : [],
        aiSelected: Boolean(it.aiSelected),
        aiSelectedReason: it.aiSelectedReason || "",
        finalScore: Math.max(0, Math.min(100, Number(it.finalScore) || 0)),
      })
    }
    return out.slice(0, maxItems)
  } catch (err) {
    console.warn("[llm] 精析失败:", err instanceof Error ? err.message : err)
    return []
  }
}

function extractJson(text: string): string | null {
  if (!text) return null
  text = text.replace(/```(?:json)?\s*/g, "").trim()
  try {
    JSON.parse(text)
    return text
  } catch {
    const start = text.indexOf("{")
    const end = text.lastIndexOf("}")
    if (start !== -1 && end > start) {
      const candidate = text.slice(start, end + 1)
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
