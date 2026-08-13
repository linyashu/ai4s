import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fetchLmArena } from "./rank-lmarena"
import { fetchLiveBench } from "./rank-livebench"
import { fetchOpenLLM } from "./rank-openllm"
import { fetchOpenCompass } from "./rank-opencompass"
import type { LiveRanking, RankingsSnapshot } from "./types"

const FILE = path.join(process.cwd(), "data", "rankings.json")

export function readRankings(): RankingsSnapshot | null {
  try {
    if (!existsSync(FILE)) return null
    return JSON.parse(readFileSync(FILE, "utf-8")) as RankingsSnapshot
  } catch {
    return null
  }
}

export async function refreshRankings(): Promise<RankingsSnapshot> {
  const [lmarena, livebench, openllm, opencompass] = await Promise.all([
    fetchLmArena(10),
    fetchLiveBench(10),
    fetchOpenLLM(10),
    fetchOpenCompass(10),
  ])

  const now = new Date().toISOString()
  const leaderboards: LiveRanking[] = []

  if (lmarena.length > 0) {
    leaderboards.push({
      source: "LMArena",
      sourceUrl: "https://lmarena.ai/leaderboard/text",
      label: "LMArena Text Arena（人工盲测 Elo）",
      note: "人类盲测投票的 Elo 评分，反映真实使用体验。",
      columns: ["模型", "Elo", "投票", "价格", "上下文"],
      capturedAt: now,
      rows: lmarena,
    })
  }
  if (livebench.length > 0) {
    leaderboards.push({
      source: "LiveBench",
      sourceUrl: "https://livebench.ai/",
      label: "LiveBench（抗污染客观评测）",
      note: "自动生成的客观评测，防污染设计。",
      columns: ["模型", "Overall", "推理", "编码", "数学", "语言", "价格"],
      capturedAt: now,
      rows: livebench,
    })
  }
  if (openllm.length > 0) {
    leaderboards.push({
      source: "Open LLM Leaderboard",
      sourceUrl: "https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard",
      label: "Open LLM Leaderboard v2（开源模型）",
      note: "HuggingFace 开源模型综合评测。",
      columns: ["模型", "Average", "参数量", "架构"],
      capturedAt: now,
      rows: openllm,
    })
  }
  if (opencompass.length > 0) {
    leaderboards.push({
      source: "OpenCompass 司南",
      sourceUrl: "https://rank.opencompass.org.cn/home",
      label: "OpenCompass 司南（上海AI实验室）",
      note: "中文最权威的多维评测榜。",
      columns: ["模型", "均分", "参数量", "语言", "知识", "推理", "数学", "代码", "智能体"],
      capturedAt: now,
      rows: opencompass,
    })
  }

  const snapshot: RankingsSnapshot = { updatedAt: now, leaderboards }
  mkdirSync(path.dirname(FILE), { recursive: true })
  writeFileSync(FILE, JSON.stringify(snapshot, null, 2), "utf-8")
  console.log(`[rankings] 刷新完成：${leaderboards.length} 个排行榜（${leaderboards.map((l) => `${l.source}:${l.rows.length}`).join(" / ")}）`)
  return snapshot
}
