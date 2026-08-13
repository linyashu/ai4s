import { describe, expect, it } from "vitest"
import { tokenize, jaccard, dice, itemsSimilar, buildStories } from "./story"
import type { AIItem } from "./types"

function makeItem(partial: Partial<AIItem> & { id: string; titleZh: string }): AIItem {
  return {
    url: `https://example.com/${partial.id}`,
    title: partial.titleZh,
    summaryZh: "摘要",
    publishedAt: "2026-08-13T00:00:00Z",
    aiSelected: true,
    aiSelectedReason: "",
    finalScore: 70,
    category: "ai-models",
    aiTags: [],
    source: { name: "测试源", kind: "rss" },
    duplicateCount: 0,
    dateKey: "2026-08-13",
    dateLabel: "8月13日",
    timeLabel: "08:00",
    ...partial,
  }
}

describe("story.tokenize", () => {
  it("中文按 bigram 切分，英文小写整词", () => {
    const t = tokenize("OpenAI 发布新模型")
    expect(t.has("openai")).toBe(true)
    expect(t.has("#发布")).toBe(false)
    expect(t.has("#模型")).toBe(true)
  })

  it("停用词被剔除", () => {
    const t = tokenize("新模型发布")
    expect(t.has("#发布")).toBe(false)
  })
})

describe("story.jaccard / dice", () => {
  it("完全相同的集合相似度为 1", () => {
    expect(jaccard(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1)
    expect(dice(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1)
  })

  it("无交集为 0，空集合为 0", () => {
    expect(jaccard(new Set(["a"]), new Set(["b"]))).toBe(0)
    expect(jaccard(new Set<string>(), new Set(["b"]))).toBe(0)
  })
})

describe("story.itemsSimilar", () => {
  it("同一事件不同信源（共享英文专有名词）判定相似", () => {
    const a = makeItem({ id: "a", titleZh: "OpenAI 发布 GPT-5，性能大幅提升" })
    const b = makeItem({ id: "b", titleZh: "GPT-5 来了：OpenAI 旗舰新模型评测" })
    expect(itemsSimilar(a, b)).toBe(true)
  })

  it("共享单一泛化实体且标题不相似时不合并", () => {
    const a = makeItem({ id: "a", titleZh: "Google 发布新研究论文" })
    const b = makeItem({ id: "b", titleZh: "Google 开源新工具" })
    expect(itemsSimilar(a, b)).toBe(true)
  })

  it("完全无关的两条不相似", () => {
    const a = makeItem({ id: "a", titleZh: "OpenAI 发布 GPT-5" })
    const b = makeItem({ id: "b", titleZh: "某公司融资 10 亿美元" })
    expect(itemsSimilar(a, b)).toBe(false)
  })
})

describe("story.buildStories", () => {
  it("同事件条目合并为一个 story，来源列表完整", () => {
    const items = [
      makeItem({ id: "a", titleZh: "OpenAI 发布 GPT-5，性能大幅提升", source: { name: "OpenAI 官网", kind: "rss" } }),
      makeItem({ id: "b", titleZh: "GPT-5 来了：OpenAI 旗舰新模型评测", source: { name: "机器之心", kind: "rss" } }),
    ]
    const stories = buildStories(items)
    expect(stories.length).toBe(1)
    expect(stories[0].itemIds.sort()).toEqual(["a", "b"])
    expect(stories[0].sources).toContain("OpenAI 官网")
    expect(stories[0].sources).toContain("机器之心")
  })

  it("非精选条目不参与聚类", () => {
    const items = [
      makeItem({ id: "a", titleZh: "OpenAI 发布 GPT-5", aiSelected: true }),
      makeItem({ id: "b", titleZh: "GPT-5 评测", aiSelected: false }),
    ]
    const stories = buildStories(items)
    expect(stories.length).toBe(1)
    expect(stories[0].itemIds).toEqual(["a"])
  })

  it("故事标题取评分最高的条目", () => {
    const items = [
      makeItem({ id: "a", titleZh: "GPT-5 发布", finalScore: 60 }),
      makeItem({ id: "b", titleZh: "OpenAI 发布 GPT-5 深度评测", finalScore: 90 }),
    ]
    const stories = buildStories(items)
    expect(stories[0].titleZh).toBe("OpenAI 发布 GPT-5 深度评测")
  })
})
