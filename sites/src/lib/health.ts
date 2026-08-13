import { getDb, ensureMigrated } from "./db"

export interface SourceHealth {
  sourceName: string
  ok: boolean
  itemCount: number
  error?: string
  timestamp: string
}

export async function recordSourceHealth(h: SourceHealth): Promise<void> {
  await ensureMigrated()
  await getDb().execute({
    sql: `INSERT INTO source_health (sourceName, ok, itemCount, error, timestamp)
       VALUES (?, ?, ?, ?, ?)`,
    args: [h.sourceName, h.ok ? 1 : 0, h.itemCount, h.error ?? null, h.timestamp],
  })
}

export async function readSourceHealth(limit = 100): Promise<Array<Record<string, unknown>>> {
  await ensureMigrated()
  const r = await getDb().execute({
    sql: "SELECT * FROM source_health ORDER BY id DESC LIMIT ?",
    args: [limit],
  })
  return r.rows.map((row) => row as Record<string, unknown>)
}

export async function summarizeSourceHealth(): Promise<
  Array<{
    sourceName: string
    runs: number
    okRuns: number
    failRuns: number
    avgItems: number
  }>
> {
  await ensureMigrated()
  const r = await getDb().execute(
    `SELECT sourceName,
            COUNT(*) AS runs,
            SUM(ok) AS okRuns,
            COUNT(*) - SUM(ok) AS failRuns,
            ROUND(AVG(itemCount), 1) AS avgItems
     FROM source_health
     WHERE timestamp >= datetime('now', '-7 days')
     GROUP BY sourceName
     ORDER BY failRuns DESC`
  )
  return r.rows.map((row) => {
    const rr = row as Record<string, unknown>
    return {
      sourceName: String(rr.sourceName),
      runs: Number(rr.runs),
      okRuns: Number(rr.okRuns),
      failRuns: Number(rr.failRuns),
      avgItems: Number(rr.avgItems),
    }
  })
}
