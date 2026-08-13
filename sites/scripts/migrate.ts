import { config } from "dotenv"
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"
import {
  dbWriteItems,
  dbWriteStories,
  dbWriteHeatSnapshot,
  dbReadItems,
  dbReadStories,
  dbReadHeatSnapshots,
} from "../src/lib/db"
import type { AIItem, Story } from "../src/lib/types"

const envLocal = path.join(process.cwd(), ".env.local")
if (existsSync(envLocal)) config({ path: envLocal })

function readJson<T>(file: string, fallback: T): T {
  const p = path.join(process.cwd(), "data", file)
  try {
    if (!existsSync(p)) return fallback
    return JSON.parse(readFileSync(p, "utf-8")) as T
  } catch {
    return fallback
  }
}

function readItemsJson(): AIItem[] {
  const p = path.join(process.cwd(), "data", "items.json")
  try {
    if (!existsSync(p)) return []
    const parsed = JSON.parse(readFileSync(p, "utf-8"))
    if (Array.isArray(parsed)) return parsed
    if (parsed && Array.isArray(parsed.items)) return parsed.items
    return []
  } catch {
    return []
  }
}

async function main() {
  console.log("[migrate] 从 JSON 迁移到 SQLite…")

  const items = readItemsJson()
  console.log(`[migrate] JSON items: ${items.length}`)
  await dbWriteItems(items)

  const stories = readJson<Story[]>("stories.json", [])
  console.log(`[migrate] JSON stories: ${stories.length}`)
  await dbWriteStories(stories)

  const snapshots = readJson<Array<{ timestamp: number; points: Array<{ itemId: string; heat: number }> }>>(
    "heat-history.json",
    []
  )
  let heatPoints = 0
  for (const s of snapshots) {
    await dbWriteHeatSnapshot(s.timestamp, s.points)
    heatPoints += s.points.length
  }
  console.log(`[migrate] JSON heat points: ${heatPoints}`)

  console.log(
    `[migrate] 完成。DB items: ${(await dbReadItems()).length}, stories: ${(await dbReadStories()).length}, heat points: ${(await dbReadHeatSnapshots()).length}`
  )
}

main().catch((err) => {
  console.error("[migrate] 失败:", err)
  process.exit(1)
})
