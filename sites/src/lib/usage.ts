import { getDb, ensureMigrated } from "./db"

export interface LLMUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

const INPUT_PRICE_PER_M = Number(process.env.LLM_INPUT_PRICE_PER_M ?? 0.27)
const OUTPUT_PRICE_PER_M = Number(process.env.LLM_OUTPUT_PRICE_PER_M ?? 1.1)

export async function recordLLMUsage(u: LLMUsage): Promise<void> {
  await ensureMigrated()
  const estCost =
    (u.promptTokens / 1_000_000) * INPUT_PRICE_PER_M +
    (u.completionTokens / 1_000_000) * OUTPUT_PRICE_PER_M
  await getDb().execute({
    sql: `INSERT INTO llm_usage (timestamp, promptTokens, completionTokens, totalTokens, estCost)
       VALUES (?, ?, ?, ?, ?)`,
    args: [new Date().toISOString(), u.promptTokens, u.completionTokens, u.totalTokens, estCost],
  })
}

export interface UsageSummary {
  runs: number
  totalTokens: number
  estCostUSD: number
}

export async function summarizeUsage(days = 7): Promise<UsageSummary> {
  await ensureMigrated()
  const r = await getDb().execute({
    sql: `SELECT COUNT(*) AS runs,
              SUM(totalTokens) AS totalTokens,
              SUM(estCost) AS estCost
       FROM llm_usage
       WHERE timestamp >= datetime('now', ?)`,
    args: [`-${days} days`],
  })
  const row = r.rows[0] as Record<string, unknown> | undefined
  return {
    runs: Number(row?.runs ?? 0),
    totalTokens: Number(row?.totalTokens ?? 0),
    estCostUSD: Number(row?.estCost ?? 0),
  }
}
