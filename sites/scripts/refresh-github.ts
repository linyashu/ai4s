import { config } from "dotenv"
import { existsSync } from "node:fs"
import path from "node:path"
import { refreshGitHubTrending } from "../src/lib/github-store"

const envLocal = path.join(process.cwd(), ".env.local")
if (existsSync(envLocal)) config({ path: envLocal })

async function main() {
  console.log("[github] 开始刷新 GitHub 周热榜…")
  const snapshot = await refreshGitHubTrending()
  console.log(`[github] 完成：${snapshot.repos.length} 个仓库`)
}

main().catch((err) => {
  console.error("[github] 失败:", err)
  process.exit(1)
})
