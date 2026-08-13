import { describe, expect, it } from "vitest"
import { computeHeat } from "./hot"
import type { AIItem } from "./types"

function makeItem(partial: Partial<AIItem> = {}): AIItem {
  return {
    id: "item-1",
    url: "https://example.com/1",
    title: "标题",
    titleZh: "标题",
    summaryZh: "摘要",
    publishedAt: new Date().toISOString(),
    aiSelected: true,
    aiSelectedReason: "",
    finalScore: 60,
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

describe("hot.computeHeat", () => {
  it("刚发布时热度 = (60 + score) × 信源权重", () => {
    const item = makeItem({ finalScore: 60 })
    const now = new Date(item.publishedAt).getTime()
    expect(computeHeat(item, { now })).toBeCloseTo(120, 2)
  })

  it("24 小时后热度衰减一半", () => {
    const item = makeItem({ finalScore: 60 })
    const now = new Date(item.publishedAt).getTime() + 24 * 3600000
    expect(computeHeat(item, { now })).toBeCloseTo(60, 2)
  })

  it("48 小时后衰减为四分之一", () => {
    const item = makeItem({ finalScore: 60 })
    const now = new Date(item.publishedAt).getTime() + 48 * 3600000
    expect(computeHeat(item, { now })).toBeCloseTo(30, 2)
  })

  it("信源权重生效（OpenAI 1.25 倍）", () => {
    const item = makeItem({
      finalScore: 60,
      source: { name: "OpenAI 官网", kind: "rss" },
    })
    const now = new Date(item.publishedAt).getTime()
    expect(computeHeat(item, { now })).toBeCloseTo(150, 2)
  })

  it("多信源报道加成（每多 1 源 +15%）", () => {
    const item = makeItem({ finalScore: 60 })
    const now = new Date(item.publishedAt).getTime()
    expect(computeHeat(item, { storyMembers: 2, now })).toBeCloseTo(138, 2)
  })

  it("未来时间不出现负衰减", () => {
    const item = makeItem({ finalScore: 60 })
    const now = new Date(item.publishedAt).getTime() - 3600000
    expect(computeHeat(item, { now })).toBeCloseTo(120, 2)
  })
})

describe("hot 氛围票加权", () => {
  it("每票 +0.5%，10 票 = +5%", () => {
    const item = makeItem({ finalScore: 60 })
    const now = new Date(item.publishedAt).getTime()
    expect(computeHeat(item, { votes: 10, now })).toBeCloseTo(126, 2)
  })

  it("票数封顶 100（+50%）", () => {
    const item = makeItem({ finalScore: 60 })
    const now = new Date(item.publishedAt).getTime()
    expect(computeHeat(item, { votes: 100, now })).toBeCloseTo(180, 2)
    expect(computeHeat(item, { votes: 1000, now })).toBeCloseTo(180, 2)
  })

  it("无票数不加成", () => {
    const item = makeItem({ finalScore: 60 })
    const now = new Date(item.publishedAt).getTime()
    expect(computeHeat(item, { votes: 0, now })).toBeCloseTo(120, 2)
  })
})
