import { NextResponse } from "next/server"
import { dbReadIngestRuns } from "@/lib/db"
import { summarizeSourceHealth } from "@/lib/health"
import { summarizeUsage } from "@/lib/usage"
import { requireIngestSecret } from "@/lib/api-auth"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const denied = requireIngestSecret(request)
  if (denied) return denied

  const ingestRuns = await dbReadIngestRuns(20)
  const sourceHealth = await summarizeSourceHealth()
  const usage = await summarizeUsage(7)

  return NextResponse.json({
    updatedAt: new Date().toISOString(),
    ingestRuns,
    sourceHealth,
    llmUsage: usage,
  })
}
