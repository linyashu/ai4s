import { config } from "dotenv"
import { existsSync } from "node:fs"
import path from "node:path"
import { runPipeline } from "../src/lib/pipeline"

const envLocal = path.join(process.cwd(), ".env.local")
if (existsSync(envLocal)) config({ path: envLocal })

async function main() {
  console.log("[ingest] 开始抓取与 AI 加工…")
  const result = await runPipeline()
  console.log("[ingest] 完成:", JSON.stringify(result, null, 2))
}

main().catch((err) => {
  console.error("[ingest] 失败:", err)
  process.exit(1)
})
