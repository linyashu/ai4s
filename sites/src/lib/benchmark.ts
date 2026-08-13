import { readFileSync, existsSync } from "node:fs"
import path from "node:path"
import type { BenchmarkConfig, BenchmarkMetric, BenchmarkModel, BenchmarkSnapshot } from "./types"

const FILE = path.join(process.cwd(), "data", "benchmarks.json")

let cache: BenchmarkSnapshot | null = null

export function readBenchmarks(): BenchmarkSnapshot | null {
  if (cache) return cache
  try {
    if (!existsSync(FILE)) return null
    cache = JSON.parse(readFileSync(FILE, "utf-8")) as BenchmarkSnapshot
    return cache
  } catch {
    return null
  }
}

export const BENCHMARK_CONFIG: BenchmarkConfig = {
  metrics: {
    overall: { label: "综合能力", desc: "多基准加权综合分（HLE/GPQA/MMMU-Pro/CritPT 等归一化）", higherIsBetter: true },
    intelligence: { label: "智能指数", desc: "Artificial Analysis Intelligence Index", higherIsBetter: true },
    reasoning: { label: "推理", desc: "HLE + GPQA 加权（高难度推理）", higherIsBetter: true },
    coding: { label: "代码", desc: "Artificial Analysis Coding Index", higherIsBetter: true },
    math: { label: "数学", desc: "LCR 数学基准", higherIsBetter: true },
    multimodal: { label: "多模态", desc: "MMMU-Pro 多模态理解", higherIsBetter: true },
    agentic: { label: "智能体", desc: "Artificial Analysis Agentic Index", higherIsBetter: true },
    speed: { label: "速度", desc: "输出速度（token/秒）", higherIsBetter: true },
    price: { label: "价格", desc: "每百万 token 混合价格（美元）", unit: "$", higherIsBetter: false },
  },
  weights: {
    intelligence: 0.5,
    reasoning: 0.2,
    coding: 0.1,
    math: 0.05,
    multimodal: 0.05,
    agentic: 0.1,
  },
}

type ValueGetter = (m: BenchmarkModel) => number | null

const VALUE_GETTERS: Record<string, ValueGetter> = {
  intelligence: (m) => m.intelligenceIndex,
  coding: (m) => m.codingIndex,
  agentic: (m) => m.agenticIndex,
  speed: (m) => m.speed,
  price: (m) => m.price,
}

function avg(vals: Array<number | null>): number | null {
  const nums = vals.filter((v): v is number => v != null && isFinite(v))
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function reasoningValue(m: BenchmarkModel): number | null {
  return avg([m.hle != null ? m.hle * 100 : null, m.gpqa != null ? m.gpqa * 100 : null])
}

function mathValue(m: BenchmarkModel): number | null {
  return m.lcr != null ? m.lcr * 100 : null
}

function multimodalValue(m: BenchmarkModel): number | null {
  return m.mmmuPro != null ? m.mmmuPro * 100 : null
}

const COMPOSITE_GETTERS: Record<string, ValueGetter> = {
  reasoning: reasoningValue,
  math: mathValue,
  multimodal: multimodalValue,
}

/**
 * 归一化到 0-100。higherIsBetter=true 时高分靠前。
 */
function normalize(values: number[], higherIsBetter: boolean): Map<number, number> {
  if (values.length === 0) return new Map()
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min
  const map = new Map<number, number>()
  if (range === 0) {
    values.forEach((v) => map.set(v, 50))
    return map
  }
  values.forEach((v) => {
    const norm = higherIsBetter ? (v - min) / range : (max - v) / range
    map.set(v, Math.round(norm * 1000) / 10)
  })
  return map
}

export function getMetricValue(model: BenchmarkModel, metric: BenchmarkMetric): number | null {
  if (metric === "overall") return overallScore(model)
  const getter = COMPOSITE_GETTERS[metric] ?? VALUE_GETTERS[metric]
  return getter ? getter(model) : null
}

/**
 * 综合能力分：将各子维度在候选集合内归一化后按权重加权。
 */
export function overallScore(model: BenchmarkModel): number | null {
  const config = BENCHMARK_CONFIG
  const weights = config.weights
  const components = (Object.keys(weights) as BenchmarkMetric[]).filter(
    (k) => weights[k] && k !== "overall"
  )

  let sum = 0
  let totalW = 0
  for (const k of components) {
    const v = getMetricValue(model, k)
    if (v == null || !isFinite(v)) continue
    const w = weights[k] ?? 0
    // intelligence/agentic/coding 本身是 0-100；reasoning/math/multimodal 已转为 0-100
    sum += v * w
    totalW += w
  }
  if (totalW === 0) return null
  return Math.round((sum / totalW) * 10) / 10
}

/**
 * 归一化后排序（在同一指标内消除量纲差异）。
 */
export function sortByMetric(
  models: BenchmarkModel[],
  metric: BenchmarkMetric,
  limit?: number
): BenchmarkModel[] {
  const higherIsBetter = BENCHMARK_CONFIG.metrics[metric].higherIsBetter
  const values: number[] = []
  const valueMap = new Map<string, number | null>()
  for (const m of models) {
    const v = getMetricValue(m, metric)
    valueMap.set(m.slug, v)
    if (v != null && isFinite(v)) values.push(v)
  }
  const normMap = normalize(values, higherIsBetter)

  const ranked = [...models].sort((a, b) => {
    const va = valueMap.get(a.slug)
    const vb = valueMap.get(b.slug)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    const na = normMap.get(va) ?? 0
    const nb = normMap.get(vb) ?? 0
    return nb - na
  })
  return limit ? ranked.slice(0, limit) : ranked
}

/**
 * 同一厂商去重：每个厂商保留智能指数最高的模型。
 */
export function dedupeByCreator(models: BenchmarkModel[]): BenchmarkModel[] {
  const best = new Map<string, BenchmarkModel>()
  for (const m of models) {
    const cur = best.get(m.creator)
    if (!cur || (m.intelligenceIndex ?? 0) > (cur.intelligenceIndex ?? 0)) {
      best.set(m.creator, m)
    }
  }
  return [...best.values()].sort((a, b) => (b.intelligenceIndex ?? 0) - (a.intelligenceIndex ?? 0))
}
