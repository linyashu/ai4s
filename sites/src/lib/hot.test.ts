import { describe, expect, it } from "vitest"
import { computeHeat, vibeVotes } from "./hot"
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

describe("hot.vibeVotes", () => {
  it("同一 item 投票数确定且稳定", () => {
    const item = makeItem({ id: "stable-id" })
    expect(vibeVotes(item)).toBe(vibeVotes(item))
  })

  it("票数范围在 50-950 之间", () => {
    for (let i = 0; i < 20; i++) {
      const v = vibeVotes(makeItem({ id: `item-${i}` }))
      expect(v).toBeGreaterThanOrEqual(50)
      expect(v).toBeLessThan(950)
    }
  })
})
