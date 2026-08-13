import { NextResponse } from "next/server"
import { runPipeline } from "@/lib/pipeline"
import { tryAcquireLock, releaseLock } from "@/lib/lock"
import { requireIngestSecret } from "@/lib/api-auth"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: Request) {
  const denied = requireIngestSecret(request)
  if (denied) return denied

  if (!(await tryAcquireLock("ingest"))) {
    return NextResponse.json(
      { ok: false, error: "另一个抓取任务正在运行，请稍后再试" },
      { status: 409 }
    )
  }

  try {
    const result = await runPipeline()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  } finally {
    await releaseLock("ingest")
  }
}
