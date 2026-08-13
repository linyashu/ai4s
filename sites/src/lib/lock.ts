import { getDb, ensureMigrated } from "./db"

const LOCK_TIMEOUT_MS = 30 * 60 * 1000

export async function tryAcquireLock(name: string): Promise<boolean> {
  await ensureMigrated()
  const db = getDb()
  const now = Date.now()
  const minAcquiredAt = now - LOCK_TIMEOUT_MS

  // 原子 upsert：仅当锁不存在或已超时才能写入 acquiredAt，否则不更新
  await db.execute({
    sql: `INSERT INTO pipeline_lock (name, acquiredAt) VALUES (?, ?)
       ON CONFLICT(name) DO UPDATE SET acquiredAt = excluded.acquiredAt
       WHERE pipeline_lock.acquiredAt < ?`,
    args: [name, now, minAcquiredAt],
  })

  const r = await db.execute({
    sql: "SELECT acquiredAt FROM pipeline_lock WHERE name = ?",
    args: [name],
  })
  const row = r.rows[0] as unknown as { acquiredAt: number } | undefined
  return row != null && Number(row.acquiredAt) === now
}

export async function releaseLock(name: string): Promise<void> {
  await ensureMigrated()
  await getDb().execute({
    sql: "DELETE FROM pipeline_lock WHERE name = ?",
    args: [name],
  })
}
