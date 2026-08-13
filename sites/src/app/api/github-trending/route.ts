import { NextResponse } from "next/server"
import { refreshGitHubTrending } from "@/lib/github-store"
import { requireIngestSecret } from "@/lib/api-auth"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(request: Request) {
  const denied = requireIngestSecret(request)
  if (denied) return denied
  try {
    const snapshot = await refreshGitHubTrending()
    return NextResponse.json({ ok: true, repos: snapshot.repos.length })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
