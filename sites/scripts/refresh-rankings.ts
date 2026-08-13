import { config } from "dotenv"
import { existsSync } from "node:fs"
import path from "node:path"
import { refreshRankings } from "../src/lib/refresh-benchmarks"

const envLocal = path.join(process.cwd(), ".env.local")
if (existsSync(envLocal)) config({ path: envLocal })

async function main() {
  console.log("[rankings] 开始刷新实时排行榜…")
  const snapshot = await refreshRankings()
  console.log(`[rankings] 完成：${snapshot.leaderboards.length} 个排行榜`)
}

main().catch((err) => {
  console.error("[rankings] 失败:", err)
  process.exit(1)
})
