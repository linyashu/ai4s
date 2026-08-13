import { NextResponse } from "next/server"
import { refreshRankings } from "@/lib/refresh-benchmarks"
import { requireIngestSecret } from "@/lib/api-auth"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: Request) {
  const denied = requireIngestSecret(request)
  if (denied) return denied
  try {
    const snapshot = await refreshRankings()
    return NextResponse.json({
      ok: true,
      leaderboards: snapshot.leaderboards.map((l) => ({ source: l.source, count: l.rows.length })),
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
