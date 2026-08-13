import { createClient } from "@libsql/client"
import path from "node:path"
import type { AIItem, Story } from "./types"

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data")
const DB_FILE = path.join(DATA_DIR, "ai4s.db")

let db: ReturnType<typeof createClient> | null = null
let migratePromise: Promise<void> | null = null

export function getDb(): ReturnType<typeof createClient> {
  if (!db) {
    db = createClient({ url: `file:${DB_FILE}` })
  }
  return db
}

export async function ensureMigrated(): Promise<void> {
  if (!migratePromise) {
    migratePromise = migrate(getDb())
  }
  return migratePromise
}

async function migrate(db: ReturnType<typeof createClient>): Promise<void> {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      titleZh TEXT NOT NULL,
      summaryZh TEXT NOT NULL,
      publishedAt TEXT NOT NULL,
      aiSelected INTEGER NOT NULL DEFAULT 0,
      aiSelectedReason TEXT NOT NULL DEFAULT '',
      finalScore INTEGER NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT 'industry',
      aiTags TEXT NOT NULL DEFAULT '[]',
      sourceName TEXT NOT NULL,
      sourceKind TEXT NOT NULL DEFAULT 'rss',
      duplicateCount INTEGER NOT NULL DEFAULT 0,
      dateKey TEXT NOT NULL,
      dateLabel TEXT NOT NULL,
      timeLabel TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_items_date ON items (publishedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_items_category ON items (category);
    CREATE INDEX IF NOT EXISTS idx_items_selected ON items (aiSelected);

    CREATE TABLE IF NOT EXISTS stories (
      id TEXT PRIMARY KEY,
      titleZh TEXT NOT NULL,
      summaryZh TEXT NOT NULL,
      itemIds TEXT NOT NULL DEFAULT '[]',
      category TEXT NOT NULL DEFAULT 'industry',
      publishedAt TEXT NOT NULL,
      sources TEXT NOT NULL DEFAULT '[]',
      finalScore INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS heat_snapshots (
      timestamp INTEGER NOT NULL,
      itemId TEXT NOT NULL,
      heat REAL NOT NULL,
      PRIMARY KEY (timestamp, itemId)
    );

    CREATE TABLE IF NOT EXISTS ingest_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      startedAt TEXT NOT NULL,
      finishedAt TEXT,
      fetched INTEGER NOT NULL DEFAULT 0,
      processed INTEGER NOT NULL DEFAULT 0,
      selected INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'running'
    );

    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS source_health (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sourceName TEXT NOT NULL,
      ok INTEGER NOT NULL,
      itemCount INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      timestamp TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_health_name ON source_health (sourceName);

    CREATE TABLE IF NOT EXISTS llm_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      promptTokens INTEGER NOT NULL,
      completionTokens INTEGER NOT NULL,
      totalTokens INTEGER NOT NULL,
      estCost REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pipeline_lock (
      name TEXT PRIMARY KEY,
      acquiredAt INTEGER NOT NULL
    );
  `)
}

export async function kvGet(key: string): Promise<string | null> {
  await ensureMigrated()
  const r = await getDb().execute({ sql: "SELECT value FROM kv WHERE key = ?", args: [key] })
  const row = r.rows[0] as { value?: string } | undefined
  return row?.value ?? null
}

export async function kvSet(key: string, value: string): Promise<void> {
  await ensureMigrated()
  await getDb().execute({
    sql: `INSERT INTO kv (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [key, value],
  })
}

function rowToItem(row: Record<string, unknown>): AIItem {
  return {
    id: String(row.id),
    url: String(row.url),
    title: String(row.title),
    titleZh: String(row.titleZh),
    summaryZh: String(row.summaryZh),
    publishedAt: String(row.publishedAt),
    aiSelected: Boolean(row.aiSelected),
    aiSelectedReason: String(row.aiSelectedReason),
    finalScore: Number(row.finalScore),
    category: String(row.category) as AIItem["category"],
    aiTags: JSON.parse(String(row.aiTags)),
    source: {
      name: String(row.sourceName),
      kind: String(row.sourceKind) as AIItem["source"]["kind"],
    },
    duplicateCount: Number(row.duplicateCount),
    dateKey: String(row.dateKey),
    dateLabel: String(row.dateLabel),
    timeLabel: String(row.timeLabel),
  }
}

export async function dbReadItems(): Promise<AIItem[]> {
  await ensureMigrated()
  const r = await getDb().execute("SELECT * FROM items ORDER BY publishedAt DESC")
  return r.rows.map((row) => rowToItem(row as Record<string, unknown>))
}

export async function dbGetItemById(id: string): Promise<AIItem | undefined> {
  await ensureMigrated()
  const r = await getDb().execute({ sql: "SELECT * FROM items WHERE id = ?", args: [id] })
  const row = r.rows[0] as Record<string, unknown> | undefined
  return row ? rowToItem(row) : undefined
}

export async function dbWriteItems(items: AIItem[]): Promise<void> {
  await ensureMigrated()
  const db = getDb()
  await db.execute("BEGIN")
  try {
    for (const it of items) {
      await db.execute({
        sql: `INSERT OR REPLACE INTO items (
          id, url, title, titleZh, summaryZh, publishedAt, aiSelected,
          aiSelectedReason, finalScore, category, aiTags, sourceName,
          sourceKind, duplicateCount, dateKey, dateLabel, timeLabel
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          it.id, it.url, it.title, it.titleZh, it.summaryZh, it.publishedAt,
          it.aiSelected ? 1 : 0, it.aiSelectedReason, it.finalScore, it.category,
          JSON.stringify(it.aiTags), it.source.name, it.source.kind,
          it.duplicateCount, it.dateKey, it.dateLabel, it.timeLabel,
        ],
      })
    }
    await db.execute("COMMIT")
  } catch (err) {
    await db.execute("ROLLBACK")
    throw err
  }
}

export async function dbReadStories(): Promise<Story[]> {
  await ensureMigrated()
  const r = await getDb().execute("SELECT * FROM stories")
  return r.rows.map((row) => {
    const rr = row as Record<string, unknown>
    return {
      id: String(rr.id),
      titleZh: String(rr.titleZh),
      summaryZh: String(rr.summaryZh),
      itemIds: JSON.parse(String(rr.itemIds)),
      category: String(rr.category) as Story["category"],
      publishedAt: String(rr.publishedAt),
      sources: JSON.parse(String(rr.sources)),
      finalScore: Number(rr.finalScore),
    }
  })
}

export async function dbWriteStories(stories: Story[]): Promise<void> {
  await ensureMigrated()
  const db = getDb()
  await db.execute("BEGIN")
  try {
    for (const s of stories) {
      await db.execute({
        sql: `INSERT OR REPLACE INTO stories (
          id, titleZh, summaryZh, itemIds, category, publishedAt, sources, finalScore
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [s.id, s.titleZh, s.summaryZh, JSON.stringify(s.itemIds), s.category, s.publishedAt, JSON.stringify(s.sources), s.finalScore],
      })
    }
    await db.execute("COMMIT")
  } catch (err) {
    await db.execute("ROLLBACK")
    throw err
  }
}

export async function dbWriteHeatSnapshot(timestamp: number, points: Array<{ itemId: string; heat: number }>): Promise<void> {
  await ensureMigrated()
  const db = getDb()
  await db.execute("BEGIN")
  try {
    for (const p of points) {
      await db.execute({
        sql: "INSERT OR REPLACE INTO heat_snapshots (timestamp, itemId, heat) VALUES (?, ?, ?)",
        args: [timestamp, p.itemId, p.heat],
      })
    }
    await db.execute("COMMIT")
  } catch (err) {
    await db.execute("ROLLBACK")
    throw err
  }
}

export async function dbReadHeatSnapshots(): Promise<Array<{ timestamp: number; itemId: string; heat: number }>> {
  await ensureMigrated()
  const r = await getDb().execute("SELECT * FROM heat_snapshots ORDER BY timestamp ASC")
  return r.rows.map((row) => {
    const rr = row as Record<string, unknown>
    return {
      timestamp: Number(rr.timestamp),
      itemId: String(rr.itemId),
      heat: Number(rr.heat),
    }
  })
}

export async function dbStartIngestRun(): Promise<number> {
  await ensureMigrated()
  const r = await getDb().execute({
    sql: "INSERT INTO ingest_runs (startedAt, status) VALUES (?, 'running')",
    args: [new Date().toISOString()],
  })
  return Number(r.lastInsertRowid)
}

export async function dbFinishIngestRun(
  id: number,
  stats: { fetched: number; processed: number; selected: number; failed: number; filtered?: number; total: number }
): Promise<void> {
  await ensureMigrated()
  await getDb().execute({
    sql: `UPDATE ingest_runs SET finishedAt = ?, status = 'done',
        fetched = ?, processed = ?, selected = ?, failed = ?, total = ?
       WHERE id = ?`,
    args: [new Date().toISOString(), stats.fetched, stats.processed, stats.selected, stats.failed, stats.total, id],
  })
}

export async function dbReadIngestRuns(limit = 10): Promise<Array<Record<string, unknown>>> {
  await ensureMigrated()
  const r = await getDb().execute({
    sql: "SELECT * FROM ingest_runs ORDER BY id DESC LIMIT ?",
    args: [limit],
  })
  return r.rows.map((row) => row as Record<string, unknown>)
}
