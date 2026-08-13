import { config } from "dotenv"
import { existsSync } from "node:fs"
import path from "node:path"
import { refreshOpenRouter } from "../src/lib/openrouter-store"

const envLocal = path.join(process.cwd(), ".env.local")
if (existsSync(envLocal)) config({ path: envLocal })

async function main() {
  console.log("[openrouter] 开始刷新 OpenRouter 排行榜…")
  const snapshot = await refreshOpenRouter(20)
  console.log(`[openrouter] 完成：Top ${snapshot.top.length} 模型`)
}

main().catch((err) => {
  console.error("[openrouter] 失败:", err)
  process.exit(1)
})
