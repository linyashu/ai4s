import { readItems, readStories, writeHeatSnapshots } from "./store"
import { dbReadVoteCounts } from "./db"
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
const VOTE_BONUS_PER_VOTE = 0.005
const VOTE_CAP = 100

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

export function computeHeat(
  item: AIItem,
  opts: {
    storyMembers?: number
    now?: number
    votes?: number
    halfLifeHours?: number
  } = {}
): number {
  const now = opts.now ?? Date.now()
  const halfLifeHours = opts.halfLifeHours ?? HALF_LIFE_HOURS
  const published = new Date(item.publishedAt).getTime()
  const ageHours = Math.max(0, (now - published) / 3600000)
  const decay = Math.pow(0.5, ageHours / halfLifeHours)
  const sourceBoost = SOURCE_WEIGHT[item.source.name] ?? 1.0
  const members = opts.storyMembers ?? 1
  const dupBoost = 1 + DUP_BONUS_PER_SOURCE * (members - 1)
  const votes = Math.max(0, opts.votes ?? 0)
  const voteBoost = 1 + VOTE_BONUS_PER_VOTE * Math.min(votes, VOTE_CAP)
  return (
    Math.round((BASE_WEIGHT + item.finalScore) * decay * sourceBoost * dupBoost * voteBoost * 100) /
    100
  )
}

/**
 * 时间窗口：24h 用 24h 半衰期，7d 用 72h 半衰期（长窗口衰减更缓）。
 */
export function halfLifeForWindow(windowHours: number): number {
  return windowHours >= 168 ? 72 : HALF_LIFE_HOURS
}

export async function computeHotRanking(
  items: AIItem[],
  limit = 10,
  now = Date.now(),
  stories?: Array<{ itemIds: string[] }>,
  windowHours = 24
): Promise<HotEntry[]> {
  const storyList = stories ?? (await readStories())
  const voteCounts = await dbReadVoteCounts()
  const halfLifeHours = halfLifeForWindow(windowHours)
  const windowStart = now - windowHours * 3600000
  return items
    .filter((item) => new Date(item.publishedAt).getTime() >= windowStart)
    .map((item) => {
      const storyMembers = storyMembersFor(item, storyList)
      const votes = voteCounts.get(item.id) ?? 0
      const heat = computeHeat(item, { storyMembers, now, votes, halfLifeHours })
      return {
        item,
        heat,
        ageHours: Math.max(
          0,
          (now - new Date(item.publishedAt).getTime()) / 3600000
        ),
        rank: 0,
        storyMembers,
        vibeVotes: votes,
      }
    })
    .sort((a, b) => b.heat - a.heat)
    .slice(0, limit)
    .map((entry, i) => ({ ...entry, rank: i + 1 }))
}

export async function takeHeatSnapshot(now = Date.now()): Promise<void> {
  const items = (await readItems()).filter((it) => it.aiSelected)
  const stories = await readStories()
  const voteCounts = await dbReadVoteCounts()
  const points = items.map((item) => {
    const storyMembers = storyMembersFor(item, stories)
    return {
      itemId: item.id,
      heat: computeHeat(item, {
        storyMembers,
        now,
        votes: voteCounts.get(item.id) ?? 0,
      }),
    }
  })
  await writeHeatSnapshots({
    timestamp: now,
    points,
  })
}
