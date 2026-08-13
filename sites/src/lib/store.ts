import type { AIItem, Story } from "./types"
import {
  dbWriteItems,
  dbWriteStories,
  dbWriteHeatSnapshot,
  dbReadItems,
  dbGetItemById,
  dbReadStories,
  dbReadHeatSnapshots,
} from "./db"

export interface HeatSnapshot {
  timestamp: number
  points: Array<{ itemId: string; heat: number }>
}

export async function readItems(): Promise<AIItem[]> {
  return dbReadItems()
}

export async function writeItems(items: AIItem[]): Promise<void> {
  await dbWriteItems(items)
}

export async function getItemById(id: string): Promise<AIItem | undefined> {
  return dbGetItemById(id)
}

export async function readStories(): Promise<Story[]> {
  return dbReadStories()
}

export async function writeStories(stories: Story[]): Promise<void> {
  await dbWriteStories(stories)
}

export async function getStoryById(id: string): Promise<Story | undefined> {
  return (await dbReadStories()).find((s) => s.id === id)
}

export async function readHeatSnapshots(): Promise<HeatSnapshot[]> {
  const rows = await dbReadHeatSnapshots()
  const byTime = new Map<number, HeatSnapshot>()
  for (const r of rows) {
    if (!byTime.has(r.timestamp)) byTime.set(r.timestamp, { timestamp: r.timestamp, points: [] })
    byTime.get(r.timestamp)!.points.push({ itemId: r.itemId, heat: r.heat })
  }
  return [...byTime.values()].sort((a, b) => a.timestamp - b.timestamp)
}

export async function writeHeatSnapshots(snapshot: HeatSnapshot): Promise<void> {
  await dbWriteHeatSnapshot(snapshot.timestamp, snapshot.points)
}
