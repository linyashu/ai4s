import type { Category, SourceKind } from "./types"

export interface FeedSource {
  name: string
  kind: SourceKind
  url: string
  maxItems?: number
}

export const FEED_SOURCES: FeedSource[] = [
  {
    name: "OpenAI 官网",
    kind: "rss",
    url: "https://openai.com/news/rss.xml",
    maxItems: 10,
  },
  {
    name: "Hacker News 热门",
    kind: "rss",
    url: "https://hnrss.org/frontpage?count=30",
    maxItems: 30,
  },
  {
    name: "MarkTechPost",
    kind: "rss",
    url: "https://www.marktechpost.com/feed/",
    maxItems: 15,
  },
  {
    name: "arXiv cs.AI",
    kind: "rss",
    url: "http://export.arxiv.org/rss/cs.AI",
    maxItems: 20,
  },
  {
    name: "IT之家 AI",
    kind: "rss",
    url: "https://www.ithome.com/rss/",
    maxItems: 20,
  },
  {
    name: "机器之心",
    kind: "rss",
    url: "https://www.jiqizhixin.com/rss",
    maxItems: 20,
  },
  {
    name: "Google AI Blog",
    kind: "rss",
    url: "https://blog.google/technology/ai/rss/",
    maxItems: 10,
  },
  {
    name: "MIT AI News",
    kind: "rss",
    url: "https://news.mit.edu/rss/topic/artificial-intelligence2",
    maxItems: 10,
  },
  {
    name: "InfoQ AI",
    kind: "rss",
    url: "https://www.infoq.cn/feed",
    maxItems: 10,
  },
  {
    name: "arXiv cs.CL",
    kind: "rss",
    url: "http://export.arxiv.org/rss/cs.CL",
    maxItems: 20,
  },
  {
    name: "VentureBeat AI",
    kind: "rss",
    url: "https://venturebeat.com/category/ai/feed/",
    maxItems: 10,
  },
  {
    name: "Reddit r/artificial",
    kind: "rss",
    url: "https://www.reddit.com/r/artificial/.rss",
    maxItems: 15,
  },
  {
    name: "Reddit r/LocalLLaMA",
    kind: "rss",
    url: "https://www.reddit.com/r/LocalLLaMA/.rss",
    maxItems: 15,
  },
  {
    name: "Reddit r/MachineLearning",
    kind: "rss",
    url: "https://www.reddit.com/r/MachineLearning/.rss",
    maxItems: 15,
  },
  {
    name: "Reddit r/OpenAI",
    kind: "rss",
    url: "https://www.reddit.com/r/OpenAI/.rss",
    maxItems: 15,
  },
  // ===== 以下为 ai4s-daily 补充的信源 =====
  // 学术期刊与机构博客
  {
    name: "DeepMind Blog",
    kind: "rss",
    url: "https://deepmind.google/blog/rss.xml",
    maxItems: 10,
  },
  // 测评/行业新闻源
  {
    name: "Epoch AI",
    kind: "rss",
    url: "https://epochai.substack.com/feed",
    maxItems: 8,
  },
  {
    name: "MIT Tech Review",
    kind: "rss",
    url: "https://www.technologyreview.com/feed/",
    maxItems: 8,
  },
  {
    name: "The Verge AI",
    kind: "rss",
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    maxItems: 8,
  },
  {
    name: "量子位",
    kind: "rss",
    url: "https://www.qbitai.com/feed",
    maxItems: 15,
  },
  // arXiv 补充分类（借鉴 ai4s-daily 的关键词过滤）
  {
    name: "arXiv cs.LG",
    kind: "rss",
    url: "http://export.arxiv.org/rss/cs.LG",
    maxItems: 20,
  },
  {
    name: "arXiv cs.CR",
    kind: "rss",
    url: "http://export.arxiv.org/rss/cs.CR",
    maxItems: 20,
  },
  {
    name: "arXiv cs.SI",
    kind: "rss",
    url: "http://export.arxiv.org/rss/cs.SI",
    maxItems: 15,
  },
]

// Google News 中文搜索源（按主题，借鉴 ai4s-daily）
export const GOOGLE_NEWS_QUERIES: Array<{ name: string; q: string }> = [
  { name: "AI for Science", q: "AI for Science 科研" },
  { name: "人工智能科学发现", q: "人工智能 科学发现" },
  { name: "AI 大模型", q: "大模型 发布" },
  { name: "AI 芯片", q: "AI 芯片 算力" },
]

export const CATEGORY_PROMPTS: Record<Category, string> = {
  "ai-models": "模型发布、权重开源、推理/训练能力、benchmark 表现",
  "ai-products": "AI 产品/功能发布、工具更新、商业化产品动态",
  industry: "行业事件、融资、公司动态、政策法规、市场格局",
  opinion: "大佬观点、行业评论、趋势预测、个人长文",
  paper: "论文、研究、arxiv 预印本",
  tip: "教程、实践指南、技术分享、开源项目使用技巧",
}
