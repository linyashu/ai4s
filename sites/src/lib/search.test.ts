import { describe, expect, it } from "vitest"
import { searchItems } from "./search"
import type { AIItem } from "./types"

function makeItem(partial: Partial<AIItem> & { id: string }): AIItem {
  return {
    url: `https://example.com/${partial.id}`,
    title: partial.title ?? "原标题",
    titleZh: partial.titleZh ?? "中文标题",
    summaryZh: partial.summaryZh ?? "摘要",
    publishedAt: partial.publishedAt ?? "2026-08-13T00:00:00Z",
    aiSelected: partial.aiSelected ?? true,
    aiSelectedReason: partial.aiSelectedReason ?? "",
    finalScore: partial.finalScore ?? 70,
    category: partial.category ?? "ai-models",
    aiTags: partial.aiTags ?? [],
    source: partial.source ?? { name: "测试源", kind: "rss" },
    duplicateCount: 0,
    dateKey: "2026-08-13",
    dateLabel: "8月13日",
    timeLabel: "08:00",
    ...partial,
  }
}

describe("search.searchItems", () => {
  const items = [
    makeItem({
      id: "a",
      titleZh: "OpenAI 发布 GPT-5",
      summaryZh: "新一代旗舰模型",
      publishedAt: "2026-08-13T00:00:00Z",
    }),
    makeItem({
      id: "b",
      titleZh: "DeepSeek 开源新模型",
      summaryZh: "包含 GPT-5 对比测试",
      publishedAt: "2026-08-12T00:00:00Z",
    }),
    makeItem({
      id: "c",
      titleZh: "某公司融资",
      summaryZh: "行业动态",
      category: "industry",
      publishedAt: "2026-08-11T00:00:00Z",
    }),
  ]

  it("空查询返回全部按时间倒序", () => {
    const r = searchItems(items, { q: "" })
    expect(r.map((it) => it.id)).toEqual(["a", "b", "c"])
  })

  it("标题命中优先于摘要命中", () => {
    const r = searchItems(items, { q: "GPT-5" })
    expect(r[0].id).toBe("a")
    expect(r.map((it) => it.id)).toContain("b")
  })

  it("标签命中", () => {
    const withTag = makeItem({ id: "d", titleZh: "无关标题", aiTags: [{ tag: "GPT-5" }] })
    const r = searchItems([withTag], { q: "gpt-5" })
    expect(r.length).toBe(1)
  })

  it("分类过滤生效", () => {
    const r = searchItems(items, { q: "", category: "industry" })
    expect(r.map((it) => it.id)).toEqual(["c"])
  })

  it("大小写不敏感", () => {
    const r = searchItems(items, { q: "openai" })
    expect(r.map((it) => it.id)).toEqual(["a"])
  })
})
