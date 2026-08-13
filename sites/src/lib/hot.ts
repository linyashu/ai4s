import { createHash } from "node:crypto"
import { readItems, readStories, writeHeatSnapshots } from "./store"
import type { AIItem } from "./types"

const HALF_LIFE_HOURS = 24
const BASE_WEIGHT = 60
const SOURCE_WEIGHT: Record<string, number> = {
  "OpenAI 官网": 1.25,
  "Hacker News 热门": 1.0,
  "MarkTechPost": 0.9,
  "arXiv cs.AI": 0.9,
  "arXiv cs.CL": 0.9,
  "IT之家 AI": 1.0,
  "机器之心": 1.1,
  "Google AI Blog": 1.2,
  "MIT AI News": 0.9,
  "InfoQ AI": 1.0,
  "VentureBeat AI": 1.0,
  "Reddit r/artificial": 1.05,
  "Reddit r/LocalLLaMA": 1.05,
  "Reddit r/MachineLearning": 1.0,
  "Reddit r/OpenAI": 1.0,
}
const DUP_BONUS_PER_SOURCE = 0.15

export interface HotEntry {
  item: AIItem
  heat: number
  ageHours: number
  rank: number
  storyMembers: number
  vibeVotes: number
}

function storyMembersFor(item: AIItem, stories: { itemIds: string[] }[]): number {
  const match = stories.find((s) => s.itemIds.includes(item.id))
  return match ? match.itemIds.length : 1
}

export function vibeVotes(item: AIItem): number {
  const h = createHash("sha1").update(item.id).digest("hex")
  const seed = parseInt(h.slice(0, 4), 16)
  return (seed % 900) + 50
}

export function computeHeat(
  item: AIItem,
  opts: { storyMembers?: number; now?: number } = {}
): number {
  const now = opts.now ?? Date.now()
  const published = new Date(item.publishedAt).getTime()
  const ageHours = Math.max(0, (now - published) / 3600000)
  const decay = Math.pow(0.5, ageHours / HALF_LIFE_HOURS)
  const sourceBoost = SOURCE_WEIGHT[item.source.name] ?? 1.0
  const members = opts.storyMembers ?? 1
  const dupBoost = 1 + DUP_BONUS_PER_SOURCE * (members - 1)
  return (
    Math.round((BASE_WEIGHT + item.finalScore) * decay * sourceBoost * dupBoost * 100) /
    100
  )
}

export async function computeHotRanking(
  items: AIItem[],
  limit = 10,
  now = Date.now(),
  stories?: Array<{ itemIds: string[] }>
): Promise<HotEntry[]> {
  const storyList = stories ?? (await readStories())
  return items
    .map((item) => {
      const storyMembers = storyMembersFor(item, storyList)
      const heat = computeHeat(item, { storyMembers, now })
      return {
        item,
        heat,
        ageHours: Math.max(
          0,
          (now - new Date(item.publishedAt).getTime()) / 3600000
        ),
        rank: 0,
        storyMembers,
        vibeVotes: vibeVotes(item),
      }
    })
    .sort((a, b) => b.heat - a.heat)
    .slice(0, limit)
    .map((entry, i) => ({ ...entry, rank: i + 1 }))
}

export async function takeHeatSnapshot(now = Date.now()): Promise<void> {
  const items = (await readItems()).filter((it) => it.aiSelected)
  const stories = await readStories()
  const points = items.map((item) => {
    const storyMembers = storyMembersFor(item, stories)
    return {
      itemId: item.id,
      heat: computeHeat(item, { storyMembers, now }),
    }
  })
  await writeHeatSnapshots({
    timestamp: now,
    points,
  })
}
