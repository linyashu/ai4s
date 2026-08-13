import { config } from "dotenv"
import { existsSync } from "node:fs"
import path from "node:path"
import { writeFileSync, mkdirSync } from "node:fs"
import type { BenchmarkModel, BenchmarkSnapshot } from "../src/lib/types"

const envLocal = path.join(process.cwd(), ".env.local")
if (existsSync(envLocal)) config({ path: envLocal })

const FILE = path.join(process.cwd(), "data", "benchmarks.json")
const AA_URL = "https://artificialanalysis.ai/leaderboards/models"

async function fetchAaModels(): Promise<Array<Record<string, unknown>>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 90000)
  try {
    const res = await fetch(AA_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: controller.signal,
      cache: "no-store",
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    const scripts = html.match(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g) ?? []
    let full = scripts.join("")
    full = full.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    full = full.replace(/\\"/g, '"').replace(/\\n/g, "")

    const start = full.indexOf('"models":[{"id":')
    if (start === -1) throw new Error("未找到 models 数据")
    // 找到对象起点
    const objStart = full.lastIndexOf("{", start)
    // 用 JSON 解析（从 objStart 到能解析的完整对象）
    const decoder = new JSONDecoder()
    const data = decoder.decode(full.slice(objStart))
    const models = (data as { models?: Array<Record<string, unknown>> }).models
    if (!Array.isArray(models) || models.length === 0) throw new Error("models 解析失败")
    return models as Array<Record<string, unknown>>
  } finally {
    clearTimeout(timer)
  }
}

class JSONDecoder {
  decode(s: string): unknown {
    let idx = 0
    const parseValue = (): unknown => {
      const c = s[idx]
      if (c === "{") return parseObj()
      if (c === "[") return parseArr()
      if (c === '"') return parseStr()
      if (c === "t") { idx += 4; return true }
      if (c === "f") { idx += 5; return false }
      if (c === "n") { idx += 4; return null }
      return parseNum()
    }
    const parseObj = (): Record<string, unknown> => {
      idx++ // {
      const o: Record<string, unknown> = {}
      while (s[idx] !== "}" && idx < s.length) {
        const key = parseStr()
        idx++ // :
        o[key] = parseValue()
        if (s[idx] === ",") idx++
      }
      idx++ // }
      return o
    }
    const parseArr = (): unknown[] => {
      idx++ // [
      const a: unknown[] = []
      while (s[idx] !== "]" && idx < s.length) {
        a.push(parseValue())
        if (s[idx] === ",") idx++
      }
      idx++ // ]
      return a
    }
    const parseStr = (): string => {
      idx++ // "
      let out = ""
      while (idx < s.length && s[idx] !== '"') {
        out += s[idx++]
      }
      idx++ // "
      return out
    }
    const parseNum = (): number => {
      let out = ""
      while (idx < s.length && /[0-9.eE+-]/.test(s[idx])) {
        out += s[idx++]
      }
      return parseFloat(out)
    }
    return parseValue()
  }
}

function toBenchmarkModel(raw: Record<string, unknown>): BenchmarkModel | null {
  const intel = raw.intelligenceIndex
  if (typeof intel !== "number") return null
  return {
    slug: String(raw.slug ?? ""),
    name: String(raw.name ?? ""),
    shortName: String(raw.shortName ?? raw.name ?? ""),
    creator: String(raw.modelCreatorName ?? ""),
    country: String(raw.modelCreatorCountry ?? ""),
    color: String(raw.modelCreatorColor ?? ""),
    isOpenWeights: Boolean(raw.isOpenWeights),
    isReasoning: Boolean(raw.isReasoning),
    releaseDate: String(raw.releaseDate ?? ""),
    intelligenceIndex: typeof intel === "number" ? intel : null,
    codingIndex: typeof raw.codingIndex === "number" ? raw.codingIndex : null,
    agenticIndex: typeof raw.agenticIndex === "number" ? raw.agenticIndex : null,
    hle: typeof raw.hle === "number" ? raw.hle : null,
    gpqa: typeof raw.gpqa === "number" ? raw.gpqa : null,
    critpt: typeof raw.critpt === "number" ? raw.critpt : null,
    mmmuPro: typeof raw.mmmuPro === "number" ? raw.mmmuPro : null,
    omniscience: typeof raw.omniscience === "number" ? raw.omniscience : null,
    scicode: typeof raw.scicode === "number" ? raw.scicode : null,
    lcr: typeof raw.lcr === "number" ? raw.lcr : null,
    gdpvalNormalized: typeof raw.gdpvalNormalized === "number" ? raw.gdpvalNormalized : null,
    speed: typeof raw.medianOutputTokensPerSecond === "number" ? raw.medianOutputTokensPerSecond : null,
    price: typeof raw.price1mBlended0To3To1 === "number" ? raw.price1mBlended0To3To1 : null,
    contextWindow: typeof raw.contextWindowTokens === "number" ? raw.contextWindowTokens : null,
  }
}

async function main() {
  console.log("[aa] 抓取 Artificial Analysis 全量数据…")
  const raw = await fetchAaModels()
  console.log(`[aa] 抓取 ${raw.length} 个模型`)

  const models = raw
    .map(toBenchmarkModel)
    .filter((m): m is BenchmarkModel => m !== null)
    .filter((m) => m.intelligenceIndex !== null)
    .sort((a, b) => (b.intelligenceIndex ?? 0) - (a.intelligenceIndex ?? 0))

  // 智能指数超过 0 的有效模型
  const effective = models.filter((m) => (m.intelligenceIndex ?? 0) > 0)
  console.log(`[aa] 有效模型 ${effective.length} 个`)

  const snapshot: BenchmarkSnapshot = {
    source: "Artificial Analysis (artificialanalysis.ai)",
    sourceUrl: AA_URL,
    capturedAt: new Date().toISOString().slice(0, 10),
    note:
      "数据来自 Artificial Analysis Intelligence Index。综合能力分由多项基准加权归一化得到（HLE/GPQA/MMMU-Pro/CritPT/SCICode 等），各能力维度独立展示。价格为每百万 token 混合价格（美元）。",
    models: effective,
  }

  mkdirSync(path.dirname(FILE), { recursive: true })
  writeFileSync(FILE, JSON.stringify(snapshot, null, 2), "utf-8")
  console.log(`[aa] 已写入 ${FILE}（${effective.length} 模型）`)
}

main().catch((err) => {
  console.error("[aa] 失败:", err)
  process.exit(1)
})
