export type SourceKind = "rss" | "web_list" | "json_list" | "x_search"

export interface Source {
  name: string
  kind: SourceKind
}

export type Category =
  | "ai-models"
  | "ai-products"
  | "industry"
  | "opinion"
  | "paper"
  | "tip"

export const CATEGORY_LABELS: Record<Category, string> = {
  "ai-models": "模型",
  "ai-products": "产品",
  industry: "行业",
  opinion: "观点",
  paper: "论文",
  tip: "教程",
}

export interface AITag {
  tag: string
}

export interface AIItem {
  id: string
  url: string
  title: string
  titleZh: string
  summaryZh: string
  publishedAt: string
  aiSelected: boolean
  aiSelectedReason: string
  finalScore: number
  category: Category
  aiTags: AITag[]
  source: Source
  duplicateCount: number
  dateKey: string
  dateLabel: string
  timeLabel: string
}

export interface RawItem {
  url: string
  title: string
  content?: string
  publishedAt?: string
  sourceName: string
  sourceKind: SourceKind
}

export interface LLMOutput {
  titleZh: string
  summaryZh: string
  category: Category
  tags: string[]
  aiSelected: boolean
  aiSelectedReason: string
  finalScore: number
}

export interface Story {
  id: string
  titleZh: string
  summaryZh: string
  itemIds: string[]
  category: Category
  publishedAt: string
  sources: string[]
  finalScore: number
}

export type BenchmarkMetric =
  | "overall"
  | "intelligence"
  | "reasoning"
  | "coding"
  | "math"
  | "multimodal"
  | "agentic"
  | "speed"
  | "price"

export interface BenchmarkModel {
  slug: string
  name: string
  shortName: string
  creator: string
  country: string
  color: string
  isOpenWeights: boolean
  isReasoning: boolean
  releaseDate: string
  // AA 综合与能力指数（0-100 量纲）
  intelligenceIndex: number | null
  codingIndex: number | null
  agenticIndex: number | null
  // 具体基准原始分（多为 0-1 或 0-100）
  hle: number | null
  gpqa: number | null
  critpt: number | null
  mmmuPro: number | null
  omniscience: number | null
  scicode: number | null
  lcr: number | null
  gdpvalNormalized: number | null
  // 性能与价格
  speed: number | null
  price: number | null
  contextWindow: number | null
}

export interface BenchmarkSnapshot {
  source: string
  sourceUrl: string
  capturedAt: string
  note: string
  models: BenchmarkModel[]
}

export interface BenchmarkConfig {
  metrics: Record<
    BenchmarkMetric,
    {
      label: string
      unit?: string
      desc: string
      higherIsBetter: boolean
    }
  >
  weights: Partial<Record<BenchmarkMetric, number>>
}

export interface RankEntry {
  rank: number
  model: string
  score: string
  org?: string
  url?: string
  votes?: string
  price?: string
  context?: string
  categoryScores?: Record<string, string>
  params?: string
  license?: string
  arch?: string
}

export interface LiveRanking {
  source: string
  sourceUrl: string
  label: string
  note: string
  columns: string[]
  capturedAt: string
  rows: RankEntry[]
}

export interface RankingsSnapshot {
  updatedAt: string
  leaderboards: LiveRanking[]
}
